/**
 * BookOrchestrator Agent
 *
 * Tum ajanlari koordine eder. server.js'deki generateBookWithProgress()'in yerini alir.
 *
 * Pipeline (PARALEL URETIM + KIYAFET PROFILLERI):
 *   Faz 1:   BASLANGIC        → Ajanlari olustur, cocuk foto hazirla, metinleri kisisellestir
 *   Faz 2:   KARAKTER PROFILI  → 3D karakter referans gorseli uret
 *   Faz 2.5: KIYAFET PROFILLERI → Her benzersiz kiyafet icin karakter profili uret (paralel)
 *   Faz 3:   PARALEL SAHNELER  → 7'li batch halinde paralel uret (refs: kiyafet profili)
 *   Faz 4:   FINALIZE          → Ozel sayfalar, funfact, PDF
 *
 * Referans zinciri:
 *   Karakter Profili:  refs = [cocuk foto]
 *   Kiyafet Profili:   refs = [cocuk foto, karakter profili]
 *   Her Sahne: refs = [cocuk foto, kiyafet profili] (paralel - onceki sahne ref YOK)
 *
 * Kiyafet sistemi opsiyoneldir — sahnelerde outfitId tanimlanmissa aktif olur.
 */

const fs = require("fs");
const path = require("path");
const config = require("../config");
const PromptArchitect = require("./prompt-architect");
const SceneGenerator = require("./scene-generator");
const QualityValidator = require("./quality-validator");
const TextGenerator = require("../api/text-generator");
const CanvasTextRenderer = require("../canvas-text-renderer");
const TextPageRenderer = require("../text-page-renderer");
const PDFBuilder = require("../pdf-builder");
const { MAX_REGEN_ATTEMPTS } = require("../constants");

class BookOrchestrator {
  /**
   * @param {object} options
   * @param {function} options.sendSSE      - SSE gonderim fonksiyonu
   * @param {function} options.createImageGen - Gorsel uretici fabrika fonksiyonu
   */
  constructor(options = {}) {
    this.sendSSE = options.sendSSE || (() => {});
    this.createImageGen = options.createImageGen;
  }

  /**
   * Tam kitap uretim pipeline'i
   *
   * @param {object} opts
   * @param {string} opts.bookId
   * @param {string} opts.childPhotoPath
   * @param {string} opts.childName
   * @param {string} opts.childGender
   * @param {string} opts.childAge
   * @param {string} opts.outputDir
   * @param {string} opts.dirName        - Cikti klasor adi (SSE path'leri icin)
   * @returns {Promise<{success: boolean, outputDir: string, imageCount: number}>}
   */
  async generateBook(opts) {
    const { bookId, childPhotoPath, childName, childGender, childAge, outputDir, dirName } = opts;
    const childInfo = { name: childName, gender: childGender, age: childAge };

    // ──────────────────────────────────────────
    // FAZ 1: BASLANGIC
    // ──────────────────────────────────────────
    const bookPath = path.join(__dirname, "..", "stories", bookId, "book.json");
    if (!fs.existsSync(bookPath)) throw new Error(`Kitap bulunamadi: ${bookId}`);
    const bookData = JSON.parse(fs.readFileSync(bookPath, "utf-8"));

    const sceneCount = bookData.scenes?.length || 10;
    const hasOutfitSystem = bookData.scenes?.some((s) => s.outfitId) && !bookData.outfit;
    // Adimlar: 1(baslangic) + 1(metin) + 1(foto) + 1(karakter profili) + [1(kiyafet profilleri)] + N(sahneler) + 1(ozel sayfalar) + 1(PDF)
    const TOTAL_STEPS = 4 + (hasOutfitSystem ? 1 : 0) + sceneCount + 2;

    this.sendSSE({ type: "init", totalSteps: TOTAL_STEPS, sceneCount });
    this.sendSSE({ type: "step", step: 0, total: TOTAL_STEPS, message: "Kitap sablonu yukleniyor..." });

    // Ajanlari olustur
    const promptArchitect = new PromptArchitect(bookData, childInfo);
    const imageGen = this.createImageGen();
    const sceneGenerator = new SceneGenerator(imageGen);
    const qualityValidator = new QualityValidator({ enabled: config.geminiVision?.enabled !== false });
    const textGen = new TextGenerator();
    const canvasRenderer = new CanvasTextRenderer();

    // Hikaye metinlerini kisisellestir
    this.sendSSE({ type: "step", step: 1, total: TOTAL_STEPS, message: "Hikaye metinleri kisisellestiriliiyor..." });
    let textsArray;
    try {
      const personalizedTexts = await textGen.personalizeStoryTexts(bookData, childInfo);
      textsArray = Array.isArray(personalizedTexts)
        ? personalizedTexts
        : personalizedTexts.scenes || Object.values(personalizedTexts);
    } catch (err) {
      this.sendSSE({ type: "error", message: `Metin hatasi: ${err.message}` });
      textsArray = bookData.scenes.map((s) => ({ sceneNumber: s.sceneNumber, title: s.title, text: s.text }));
    }
    fs.writeFileSync(path.join(outputDir, "texts.json"), JSON.stringify(textsArray, null, 2), "utf-8");

    // Cocuk fotografini yukle
    this.sendSSE({ type: "step", step: 2, total: TOTAL_STEPS, message: "Karakter referansi hazirlaniyor..." });
    const childPhotoRef = await sceneGenerator.prepareChildPhoto(childPhotoPath);
    this.sendSSE({ type: "scene_done", sceneNumber: 0, title: "Karakter Referansi", imagePath: null, text: "Cocuk fotografi referans olarak kullaniliyor" });

    // Cocuk fotografi buffer'i - yuz tutarliligi kontrolu icin
    let childPhotoBuffer = null;
    try {
      childPhotoBuffer = fs.readFileSync(childPhotoPath);
      console.log(`  [orchestrator] Cocuk fotografi buffer'i yuklendi (${Math.round(childPhotoBuffer.length / 1024)}KB)`);
    } catch (err) {
      console.warn(`  [orchestrator] Cocuk fotografi okunamadi: ${err.message}`);
    }

    // Validasyon icin beklentiler
    const outfitDesc = bookData.outfit?.description
      ? bookData.outfit.description.replace(/\{CHILD_NAME\}/g, childName)
      : null;

    const finalScenePaths = [];

    // ──────────────────────────────────────────
    // FAZ 2: KARAKTER PROFILI
    // ──────────────────────────────────────────
    this.sendSSE({ type: "step", step: 3, total: TOTAL_STEPS, message: "3D karakter profili olusturuluyor..." });
    console.log("  [orchestrator] FAZ 2: Karakter profili uretiliyor...");

    const profilePrompt = promptArchitect.buildCharacterProfilePrompt();
    let characterProfileRef = null; // URL veya path — sonraki sahneler icin referans
    let characterProfileBuffer = null;

    const profileStartTime = Date.now();
    let profileResult = await sceneGenerator.generateScene({
      prompt: profilePrompt,
      referenceImages: [], // Sadece cocuk foto (childPhotoRef zaten SceneGenerator icinde)
      maxRetries: 2,
      onProgress: (progress) => {
        if (progress.elapsedSec % 10 === 0 && progress.elapsedSec > 0) {
          this.sendSSE({
            type: "heartbeat",
            message: `3D karakter profili olusturuluyor... (${progress.elapsedSec}s) [kalite modu - 1K]`,
          });
        }
      },
    });
    const profileElapsed = Math.round((Date.now() - profileStartTime) / 1000);
    console.log(`  [orchestrator] Karakter profili uretim suresi: ${profileElapsed}s`);

    if (profileResult.success && profileResult.buffer) {
      // Karakter profilini diske yaz
      const profilePath = path.join(outputDir, "character-profile.png");
      fs.writeFileSync(profilePath, profileResult.buffer);
      characterProfileBuffer = profileResult.buffer;
      characterProfileRef = profileResult.resultUrl || profilePath;
      console.log(`  [orchestrator] Karakter profili TAMAM (ref: ${profileResult.resultUrl ? "URL" : "disk"})`);

      this.sendSSE({
        type: "scene_done",
        sceneNumber: "profile",
        title: "Karakter Profili",
        imagePath: `/output/${dirName}/character-profile.png`,
        text: "3D karakter referansi olusturuldu",
        imageType: "profile",
      });
    } else {
      console.warn("  [orchestrator] Karakter profili BASARISIZ — profil olmadan devam ediliyor");
      this.sendSSE({ type: "error", message: "Karakter profili olusturulamadi, profil olmadan devam ediliyor" });
    }

    // ──────────────────────────────────────────
    // FAZ 2.5: KIYAFET PROFILLERI — TEK IZGARA GORSEL
    // ──────────────────────────────────────────
    const uniqueOutfits = promptArchitect.getUniqueOutfits();
    const outfitProfileMap = new Map(); // outfitId → { ref, buffer }
    let combinedOutfitRef = null;
    let combinedOutfitBuffer = null;

    if (uniqueOutfits.length > 0 && characterProfileRef) {
      const outfitStepNum = 4;
      console.log(`  [orchestrator] FAZ 2.5: ${uniqueOutfits.length} kiyafet TEK IZGARA GORSEL olarak uretilecek...`);
      this.sendSSE({
        type: "step",
        step: outfitStepNum,
        total: TOTAL_STEPS,
        message: `${uniqueOutfits.length} kiyafet tek goerselde olusturuluyor...`,
      });

      const gridStart = Date.now();

      // Tek bir birlesik prompt olustur
      const gridPrompt = promptArchitect.buildCombinedOutfitGridPrompt(uniqueOutfits);

      const gridResult = await sceneGenerator.generateScene({
        prompt: gridPrompt,
        referenceImages: [characterProfileRef],
        maxRetries: 2,
        onProgress: (progress) => {
          if (progress.elapsedSec % 15 === 0 && progress.elapsedSec > 0) {
            this.sendSSE({
              type: "heartbeat",
              message: `Kiyafet izgara goerseli olusturuluyor... (${progress.elapsedSec}s)`,
            });
          }
        },
      });

      const gridElapsed = Math.round((Date.now() - gridStart) / 1000);

      if (gridResult.success && gridResult.buffer) {
        const gridPath = path.join(outputDir, "outfit-grid.png");
        fs.writeFileSync(gridPath, gridResult.buffer);
        combinedOutfitRef = gridResult.resultUrl || gridPath;
        combinedOutfitBuffer = gridResult.buffer;

        // Her outfit icin ayni grid referansini kaydet
        for (const outfit of uniqueOutfits) {
          outfitProfileMap.set(outfit.outfitId, {
            ref: combinedOutfitRef,
            buffer: combinedOutfitBuffer,
          });
        }

        console.log(`  [orchestrator] Kiyafet izgara goerseli TAMAM: ${uniqueOutfits.length} kiyafet, ${gridElapsed}s`);

        this.sendSSE({
          type: "scene_done",
          sceneNumber: "outfit-grid",
          title: `Kiyafet Referansi (${uniqueOutfits.length} kiyafet)`,
          imagePath: `/output/${dirName}/outfit-grid.png`,
          text: `Tum kiyafetler tek goerselde olusturuldu`,
          imageType: "outfit",
        });
      } else {
        console.warn(`  [orchestrator] Kiyafet izgara goerseli BASARISIZ, ${gridElapsed}s`);
      }

      console.log(`  [orchestrator] FAZ 2.5 TAMAMLANDI: ${outfitProfileMap.size > 0 ? "BASARILI" : "BASARISIZ"} (tek gorsel, ${gridElapsed}s)`);
    }

    // ──────────────────────────────────────────
    // FAZ 3: PARALEL BATCH SAHNE URETIMI
    // ──────────────────────────────────────────
    const BATCH_SIZE = 7; // Ayni anda max 7 sahne
    console.log(`  [orchestrator] FAZ 3: ${sceneCount} sahne PARALEL uretilecek (batch: ${BATCH_SIZE})...`);

    const outfitStepOffset = hasOutfitSystem ? 1 : 0;
    this.sendSSE({
      type: "step",
      step: 4 + outfitStepOffset,
      total: TOTAL_STEPS,
      message: `${sceneCount} sahne paralel uretiliyor...`,
    });

    // Tum sahneler icin prompt ve referanslari onceden hazirla
    const sceneConfigs = bookData.scenes.map((scene, i) => {
      const sceneOutfitProfile = scene.outfitId ? outfitProfileMap.get(scene.outfitId) : null;
      const activeProfileRef = sceneOutfitProfile?.ref || characterProfileRef;
      const hasOutfitProfile = !!sceneOutfitProfile;
      const hasCharacterProfile = !hasOutfitProfile && !!characterProfileRef;

      // Referans: sadece kiyafet/karakter profili (onceki sahne YOK — hiz icin)
      // Cocuk foto SceneGenerator icinde otomatik ekleniyor
      const referenceImages = [];
      if (activeProfileRef) {
        referenceImages.push(activeProfileRef);
      }

      if (hasOutfitProfile) {
        console.log(`    → Sahne ${scene.sceneNumber}: Kiyafet profili: ${scene.outfitId}`);
      }

      const promptOptions = {
        isAnchor: i === 0,
        hasCharacterProfile,
        hasOutfitProfile,
        hasPreviousScene: false, // Paralel modda onceki sahne referansi yok
      };
      const scenePrompt = promptArchitect.buildScenePrompt(scene, promptOptions);

      return {
        sceneNumber: scene.sceneNumber,
        prompt: scenePrompt,
        referenceImages,
        maxRetries: 2,
        // Metadata (post-processing icin)
        _scene: scene,
        _promptOptions: promptOptions,
        _activeProfileRef: activeProfileRef,
        _activeProfileBuffer: sceneOutfitProfile?.buffer || characterProfileBuffer,
      };
    });

    // Paralel batch uretim
    const batchStartTime = Date.now();
    let completedCount = 0;
    const batchResults = await sceneGenerator.generateBatch(sceneConfigs, {
      batchSize: BATCH_SIZE,
      onSceneDone: (result) => {
        completedCount++;
        const elapsed = Math.round((Date.now() - batchStartTime) / 1000);
        console.log(`  [orchestrator] Sahne ${result.sceneNumber} tamamlandi (${completedCount}/${sceneCount}, ${elapsed}s)`);
        this.sendSSE({
          type: "heartbeat",
          message: `Sahne ${result.sceneNumber} hazir (${completedCount}/${sceneCount})`,
        });
      },
    });
    const totalBatchElapsed = Math.round((Date.now() - batchStartTime) / 1000);
    console.log(`  [orchestrator] Tum sahneler uretildi: ${totalBatchElapsed}s (${completedCount}/${sceneCount})`);

    // Sonuclari isle — sirayla diske yaz + overlay uygula
    for (let i = 0; i < bookData.scenes.length; i++) {
      const scene = bookData.scenes[i];
      const sceneNum = scene.sceneNumber;
      const padNum = String(sceneNum).padStart(2, "0");
      const illPath = path.join(outputDir, `scene-${padNum}-illustration.png`);
      const finalPath = path.join(outputDir, `scene-${padNum}-final.png`);
      const textEntry = textsArray.find((t) => t.sceneNumber === sceneNum);

      // Batch sonucundan bul
      const result = batchResults.find((r) => r.sceneNumber === sceneNum);
      const sceneConfig = sceneConfigs[i];

      let sceneSuccess = false;
      if (result && result.success && result.buffer) {
        // Validasyon (paralel uretim sonrasi)
        const validation = await qualityValidator.validateScene(result.buffer, {
          outfitDescription: outfitDesc,
          style: bookData.style,
          mood: scene.mood,
          setting: scene.setting,
          scenePrompt: scene.prompt,
          childPhotoBuffer,
        }, sceneConfig._activeProfileBuffer);

        this.sendSSE({
          type: "validation",
          sceneNumber: sceneNum,
          passed: validation.passed,
          score: validation.overallScore,
          checks: validation.checks,
        });

        // Diske yaz
        fs.writeFileSync(illPath, result.buffer);
        sceneSuccess = true;
        console.log(`  [orchestrator] Sahne ${sceneNum} TAMAM`);
      } else {
        console.error(`  [orchestrator] Sahne ${sceneNum} BASARISIZ`);
      }

      // Canvas metin overlay
      if (sceneSuccess) {
        try {
          await canvasRenderer.renderTextOnImage(illPath, {
            sceneNumber: sceneNum,
            title: textEntry?.title || scene.title,
            text: textEntry?.text || scene.text,
            theme: bookData.theme || {},
            ageGroup: bookData.ageGroup || "3-6",
            pageNumber: 4 + i,
            totalScenes: sceneCount,
            outputPath: finalPath,
          });
        } catch (overlayErr) {
          console.error(`  [orchestrator] Sahne ${sceneNum} overlay hatasi:`, overlayErr.message);
          fs.copyFileSync(illPath, finalPath);
        }
      }

      this.sendSSE({
        type: "scene_done",
        sceneNumber: sceneNum,
        title: scene.title,
        imagePath: sceneSuccess ? `/output/${dirName}/scene-${padNum}-final.png` : null,
        text: textEntry?.text || scene.text,
        imageType: "scene",
      });

      if (!sceneSuccess) {
        this.sendSSE({ type: "error", message: `Sahne ${sceneNum}: basarisiz, atlaniyor...` });
      }

      finalScenePaths.push({ sceneNumber: sceneNum, finalPNG: sceneSuccess ? finalPath : null });
    }

    // Sahne siralamasi (zaten sirali ama emin olmak icin)
    finalScenePaths.sort((a, b) => a.sceneNumber - b.sceneNumber);

    console.log(`  [orchestrator] FAZ 3 TAMAMLANDI: ${finalScenePaths.filter((s) => s.finalPNG).length}/${sceneCount} sahne basarili`);

    // ──────────────────────────────────────────
    // FAZ 4: SON ISLEMLER (ozel sayfalar + PDF)
    // ──────────────────────────────────────────
    this.sendSSE({ type: "step", step: TOTAL_STEPS - 2, total: TOTAL_STEPS, message: "Ozel sayfalar hazirlaniyor..." });
    const textRenderer = new TextPageRenderer();
    const theme = bookData.theme || {};
    const ageGroup = bookData.ageGroup || "3-6";

    // Kapak PNG
    const firstIllPath = path.join(outputDir, "scene-01-illustration.png");
    const firstIll = fs.existsSync(firstIllPath) ? firstIllPath : null;
    try {
      await textRenderer.renderCoverPage({
        imagePath: firstIll, title: bookData.title, childName, theme, ageGroup,
        outputPath: path.join(outputDir, "cover-final.png"),
      });
    } catch (err) { console.error("  [orchestrator] Kapak render hatasi:", err.message); }

    // Ic kapak, Ithaf, Kapanis, Arka kapak
    const specialPages = [
      { method: "renderInnerCoverPage", opts: { title: bookData.title, childName, theme, ageGroup, outputPath: path.join(outputDir, "inner-cover.png") } },
      { method: "renderDedicationPage", opts: { childName, theme, outputPath: path.join(outputDir, "dedication.png") } },
      { method: "renderEndingPage", opts: { childName, theme, outputPath: path.join(outputDir, "ending.png") } },
      { method: "renderBackCoverPage", opts: { title: bookData.title, theme, outputPath: path.join(outputDir, "back-cover.png") } },
    ];

    for (const page of specialPages) {
      try {
        await textRenderer[page.method](page.opts);
      } catch (err) {
        console.error(`  [orchestrator] ${page.method} hatasi:`, err.message);
      }
    }

    // FunFact sayfalari
    const funFactPages = [];
    const funFacts = bookData.funFacts || [];
    const funFactPlacements = bookData.funFactPlacements || [];

    let normalizedFacts = [];
    if (funFacts.length > 0 && funFacts[0].fact) {
      const grouped = {};
      funFacts.forEach((f) => { const cat = f.category || "Bilgi"; if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(f.fact); });
      let fid = 1;
      for (const [cat, facts] of Object.entries(grouped)) {
        normalizedFacts.push({ id: `fact-${fid}`, title: `Biliyor muydun? ${cat === "Tarih" ? "\u{1f4dc}" : cat === "Bilim" ? "\u{1f52c}" : "\u{1f4a1}"}`, facts: facts.slice(0, 3), icon: cat === "Tarih" ? "\u{1f4dc}" : cat === "Bilim" ? "\u{1f52c}" : "\u{1f4a1}" });
        fid++;
      }
    } else if (funFacts.length > 0 && funFacts[0].id) {
      normalizedFacts = funFacts;
    }

    let normalizedPlacements = [];
    if (funFactPlacements.length > 0 && typeof funFactPlacements[0] === "number") {
      funFactPlacements.forEach((afterScene, idx) => { if (idx < normalizedFacts.length) normalizedPlacements.push({ afterScene, factId: normalizedFacts[idx].id }); });
    } else {
      normalizedPlacements = funFactPlacements;
    }

    const factMap = new Map();
    for (const f of normalizedFacts) factMap.set(f.id, f);

    for (const placement of normalizedPlacements) {
      const fact = factMap.get(placement.factId);
      if (fact) {
        try {
          const ffPath = path.join(outputDir, `funfact-after-${placement.afterScene}.png`);
          await textRenderer.renderFunFactPage({ funFact: fact, theme, outputPath: ffPath });
          funFactPages.push({ afterScene: placement.afterScene, png: ffPath });
        } catch (err) { console.error("  [orchestrator] FunFact hatasi:", err.message); }
      }
    }

    // PDF olustur
    this.sendSSE({ type: "step", step: TOTAL_STEPS - 1, total: TOTAL_STEPS, message: "PDF olusturuluyor..." });
    const pdfBuilder = new PDFBuilder();
    const pdfPath = path.join(outputDir, "kitap.pdf");

    try {
      await pdfBuilder.build({
        pdfPath,
        title: bookData.title,
        childName,
        coverPNG: path.join(outputDir, "cover-final.png"),
        innerCoverPNG: path.join(outputDir, "inner-cover.png"),
        dedicationPNG: path.join(outputDir, "dedication.png"),
        scenePages: finalScenePaths,
        funFactPages,
        endingPNG: path.join(outputDir, "ending.png"),
        backCoverPNG: path.join(outputDir, "back-cover.png"),
      });
      this.sendSSE({ type: "pdf_ready", pdfPath: `/output/${dirName}/kitap.pdf`, message: "PDF hazir!" });
    } catch (err) {
      this.sendSSE({ type: "error", message: `PDF hatasi: ${err.message}` });
    }

    // Tamamlandi
    const successCount = finalScenePaths.filter((s) => s.finalPNG).length;
    this.sendSSE({ type: "complete", outputDir: `/output/${dirName}`, pdfPath: `/output/${dirName}/kitap.pdf` });
    console.log(`  [orchestrator] KITAP TAMAMLANDI: ${successCount}/${sceneCount} sahne basarili`);

    return { success: true, outputDir, imageCount: successCount };
  }
}

module.exports = BookOrchestrator;
