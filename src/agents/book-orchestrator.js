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
const TextValidator = require("./text-validator");
const TextGenerator = require("../api/text-generator");
const CanvasTextRenderer = require("../canvas-text-renderer");
const { generateMazePng } = require("../utils/maze-generator");
const TextPageRenderer = require("../text-page-renderer");
const PDFBuilder = require("../pdf-builder");
const BookQualityValidator = require("./book-quality-validator");
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
    const { bookId, childPhotoPath, childName, childGender, childAge, outputDir, dirName, recipientName, senderName, customMessage, recipientNickname, senderGender, sharedActivity, recipientHobby, specialMemory, extraPhotoPaths } = opts;
    const childInfo = { name: childName, gender: childGender, age: childAge, recipientName, senderName, customMessage, recipientNickname, senderGender, sharedActivity, recipientHobby, specialMemory, extraPhotoPaths: extraPhotoPaths || [] };

    // ──────────────────────────────────────────
    // FAZ 1: BASLANGIC
    // ──────────────────────────────────────────
    const bookPath = path.join(__dirname, "..", "stories", bookId, "book.json");
    if (!fs.existsSync(bookPath)) throw new Error(`Kitap bulunamadi: ${bookId}`);
    const bookData = JSON.parse(fs.readFileSync(bookPath, "utf-8"));

    // ── KALITE KONTROLU (uretim oncesi) ──
    {
      const qcValidator = new BookQualityValidator(bookData, { autoFix: true, strict: false });
      const qcResult = qcValidator.validate();
      if (qcResult.issues.length > 0) {
        console.log("  [orchestrator] Kalite Kontrolu:");
        console.log("    Hatalar:", qcResult.errors, "| Uyarilar:", qcResult.warnings);
        for (const fix of qcResult.fixes) {
          console.log("    ✅ Otomatik duzeltme:", fix.fix);
        }
        for (const issue of qcResult.issues.filter(i => i.severity === "error" && !qcResult.fixes.find(f => f.code === i.code && f.sceneNumber === i.sceneNumber))) {
          console.log("    ❌ Duzeltilemeyen:", issue.message);
        }
        this.sendSSE({ type: "step", message: `Kalite kontrolü: ${qcResult.fixes.length} otomatik düzeltme yapıldı` });
      } else {
        console.log("  [orchestrator] Kalite kontrolu: Tum kontroller gecti ✅");
      }
    }

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

    // Metin kalite kontrolu
    const textValidator = new TextValidator({
      maxNamePerScene: 2,
      ageGroup: bookData.ageGroup || "3-6"
    });
    const validation = textValidator.validateAll(textsArray, childName);
    if (validation.issues.length > 0) {
      console.log(`  [orchestrator] Metin sorunlari bulundu: ${validation.summary.warnings} uyari, ${validation.summary.info} bilgi`);
      // Duzeltilmis metinleri kullan
      textsArray = validation.correctedScenes;
    }

    fs.writeFileSync(path.join(outputDir, "texts.json"), JSON.stringify(textsArray, null, 2), "utf-8");

    // Meta bilgilerini kaydet (yeniden uretim icin)
    const metaPath = path.join(outputDir, "meta.json");
    fs.writeFileSync(metaPath, JSON.stringify({
      childName,
      childGender: childInfo.gender,
      childAge: childInfo.age,
      bookId,
      bookTitle: bookData.title,
      extraPhotoCount: (extraPhotoPaths || []).length,
    }, null, 2), "utf-8");

    // Cocuk fotografinin kopyasini output dizinine kaydet (yeniden uretim icin)
    try {
      const photoExt = path.extname(childPhotoPath) || ".jpg";
      const childPhotoCopy = path.join(outputDir, `child-photo${photoExt}`);
      if (!fs.existsSync(childPhotoCopy)) {
        fs.copyFileSync(childPhotoPath, childPhotoCopy);
        console.log(`  [orchestrator] Cocuk fotografi kopyalandi: ${childPhotoCopy}`);
      }
    } catch (copyErr) {
      console.warn(`  [orchestrator] Cocuk fotografi kopyalanamadi: ${copyErr.message}`);
    }

    // Ek fotograflari output dizinine kopyala (rerender icin kalici)
    const copiedExtraPaths = [];
    try {
      if (childInfo.extraPhotoPaths) {
        childInfo.extraPhotoPaths.forEach((ep, i) => {
          if (ep && fs.existsSync(ep)) {
            const ext = path.extname(ep) || ".jpg";
            const dest = path.join(outputDir, `extra-photo-${i + 1}${ext}`);
            fs.copyFileSync(ep, dest);
            copiedExtraPaths.push(dest);
            console.log(`  [orchestrator] Ek fotograf kopyalandi: ${dest}`);
          }
        });
      }
      // Hero page icin kopyalanmis yollari kullan
      childInfo._copiedExtraPaths = copiedExtraPaths;
    } catch (copyErr) {
      console.warn("  [orchestrator] Ek foto kopyalama hatasi:", copyErr.message);
    }

    // Cocuk fotografini yukle
    this.sendSSE({ type: "step", step: 2, total: TOTAL_STEPS, message: "Karakter referansi hazirlaniyor..." });
    const childPhotoRef = await sceneGenerator.prepareChildPhoto(childPhotoPath);
    this.sendSSE({ type: "scene_done", sceneNumber: 0, title: "Karakter Referansi", imagePath: null, text: "Cocuk fotografi referans olarak kullaniliyor" });

    // Ek fotograflari hazirla
    const extraPhotoRefs = [];
    if (extraPhotoPaths && extraPhotoPaths.length > 0) {
      for (const ep of extraPhotoPaths) {
        try {
          const ref = await sceneGenerator.prepareExtraPhoto(ep);
          extraPhotoRefs.push(ref);
          console.log(`  [orchestrator] Ek fotograf hazir: ${ref}`);
        } catch (e) {
          console.warn(`  [orchestrator] Ek foto hazirlama hatasi: ${e.message}`);
        }
      }
      if (extraPhotoRefs.length > 0) {
        console.log(`  [orchestrator] ${extraPhotoRefs.length} ek fotograf hazir`);
      }
    }

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
    console.log(`  [orchestrator] FAZ 3: ${nonMazeScenes.length} sahne PARALEL uretilecek + ${mazeScenes.length} labirent programatik (batch: ${BATCH_SIZE})...`);

    const outfitStepOffset = hasOutfitSystem ? 1 : 0;
    this.sendSSE({
      type: "step",
      step: 4 + outfitStepOffset,
      total: TOTAL_STEPS,
      message: `${sceneCount} sahne paralel uretiliyor...`,
    });

    // Labirent sahnelerini programatik uret (AI yerine)
    const mazeScenes = bookData.scenes.filter(s => s.specialType === "maze");
    const nonMazeScenes = bookData.scenes.filter(s => s.specialType !== "maze");
    const mazeResults = [];
    for (const ms of mazeScenes) {
      const padNum = String(ms.sceneNumber).padStart(2, "0");
      const mazePath = path.join(outputDir, `scene-${padNum}-illustration.png`);
      try {
        const ageGroup = bookData.ageGroup || "3-6";
        const heroName = childInfo?.name || bookData.heroName || "Kahraman";
        const mazeGoal = bookData.meta?.maze_goal || "hedefe";
        await generateMazePng({ ageGroup, heroName, mazeGoal, outputPath: mazePath, characterBuffer: characterProfileBuffer });
        const buffer = fs.readFileSync(mazePath);
        mazeResults.push({ sceneNumber: ms.sceneNumber, success: true, buffer });
        this.sendSSE({ type: "heartbeat", message: `Labirent sayfası programatik üretildi (${ageGroup})` });
        console.log(`  [orchestrator] Labirent sahne ${ms.sceneNumber} PROGRAMATIK uretildi`);
      } catch (e) {
        console.error(`  [orchestrator] Labirent uretim hatasi:`, e.message);
        mazeResults.push({ sceneNumber: ms.sceneNumber, success: false, buffer: null });
      }
    }

    // Tum sahneler icin prompt ve referanslari onceden hazirla (labirent haric)
    const sceneConfigs = nonMazeScenes.map((scene, i) => {
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

      // Ek fotograflari referans olarak ekle (max 2 per scene to not overwhelm)
      if (extraPhotoRefs.length > 0) {
        for (let ep = 0; ep < Math.min(extraPhotoRefs.length, 2); ep++) {
          referenceImages.push(extraPhotoRefs[ep]);
        }
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

    // CoverPromptArchitect — metin sayfalari ve ozel sayfalar icin
    const CoverPromptArchitect = require("./cover-prompt-architect");
    const coverArchitect = new CoverPromptArchitect(bookData, childInfo);

    // Sonuclari isle — illustrasyon kaydet + AI metin sayfasi uret
    for (let i = 0; i < bookData.scenes.length; i++) {
      const scene = bookData.scenes[i];
      const sceneNum = scene.sceneNumber;
      const padNum = String(sceneNum).padStart(2, "0");
      const illPath = path.join(outputDir, `scene-${padNum}-illustration.png`);
      const finalPath = path.join(outputDir, `scene-${padNum}-final.png`);
      const textEntry = textsArray.find((t) => t.sceneNumber === sceneNum);

      // Batch sonucundan bul (maze sonuclari ayri)
      const result = scene.specialType === "maze"
        ? mazeResults.find((r) => r.sceneNumber === sceneNum)
        : batchResults.find((r) => r.sceneNumber === sceneNum);
      const sceneConfig = scene.specialType === "maze" ? null : sceneConfigs.find(sc => sc.sceneNumber === sceneNum);
      const sceneOutfitProfile = scene.outfitId ? outfitProfileMap.get(scene.outfitId) : null;

      let sceneSuccess = false;
      if (result && result.success && result.buffer) {
        if (scene.specialType === "maze") {
          // Labirent programatik — validasyona gerek yok
          fs.writeFileSync(illPath, result.buffer);
          sceneSuccess = true;
          console.log(`  [orchestrator] Sahne ${sceneNum} TAMAM (programatik labirent)`);
        } else {
          // Validasyon (paralel uretim sonrasi)
          const validation = await qualityValidator.validateScene(result.buffer, {
            outfitDescription: outfitDesc,
            style: bookData.style,
            category: bookData.category,
            mood: scene.mood,
            setting: scene.setting,
            scenePrompt: scene.prompt,
            childPhotoBuffer,
          }, sceneConfig?._activeProfileBuffer);

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
        }
      } else {
        console.error(`  [orchestrator] Sahne ${sceneNum} BASARISIZ`);
      }

      // Illustrasyon sayfasi = saf gorsel, overlay YOK
      if (sceneSuccess) {
        fs.copyFileSync(illPath, finalPath);
      }

      // BOYAMA kategorisinde her sahnenin kendi illustrasyonu zaten başlık+metin içerir — ayrı text sayfası YOK
      const skipTextPage = bookData.category === "boyama";
      const textPagePath = path.join(outputDir, `scene-${padNum}-text.png`);
      if (sceneSuccess && !skipTextPage) {
        try {
          this.sendSSE({ type: "heartbeat", message: `Sahne ${sceneNum} metin sayfası üretiliyor...` });
          // Sahne prompt'undan SADECE kiyafet tarifini cikar (ilk virgule kadar)
          let sceneOutfit = "";
          if (scene.prompt) {
            const m = scene.prompt.match(/wearing\s+([^,]+)/i);
            if (m) sceneOutfit = m[1].trim();
          }
          // Karakter yüzü + outfit profili reference olarak — sahne illustration'ı YOK.
          const textPageRefs = [];
          if (characterProfileRef) textPageRefs.push(characterProfileRef);
          if (sceneOutfitProfile?.ref) textPageRefs.push(sceneOutfitProfile.ref);

          // Google content-filter vurunca prompt'u yumusatip yeniden dene
          const softenPrompt = (txt) => txt
            .replace(/pajamas?/gi, "comfortable home clothes")
            .replace(/pijama/gi, "rahat ev kiyafeti")
            .replace(/bedroom/gi, "home room")
            .replace(/yatak odas[iı]/gi, "ev")
            .replace(/\bbed\b/gi, "couch")
            .replace(/sleepwear/gi, "home clothes")
            .replace(/undressed|naked|bare/gi, "clothed");
          let textResult = null;
          let softened = false;
          for (let attempt = 1; attempt <= 3; attempt++) {
            let promptToUse = coverArchitect.buildTextPagePrompt({
              title: textEntry?.title || scene.title,
              text: textEntry?.text || scene.text,
              mood: scene.mood || "warm",
              setting: scene.setting || "",
              sceneAction: scene.title || "",
              sceneOutfit: softened ? softenPrompt(sceneOutfit) : sceneOutfit,
            });
            if (softened) promptToUse = softenPrompt(promptToUse);
            textResult = await sceneGenerator.generateBackground({
              prompt: promptToUse,
              referenceImages: textPageRefs,
              maxRetries: 1,
            });
            if (textResult?.success && textResult?.buffer) break;
            const errLower = String(textResult?.error || "").toLowerCase();
            const isPolicy = errLower.includes("prohibited") || errLower.includes("filtered") || errLower.includes("policy");
            if (attempt < 3 && isPolicy && !softened) {
              console.log(`  [orchestrator] Sahne ${sceneNum} metin policy-filter'a takildi, prompt yumusatilarak tekrar deneniyor`);
              softened = true;
              continue;
            }
            if (attempt < 3) {
              console.log(`  [orchestrator] Sahne ${sceneNum} metin basarisiz (attempt ${attempt}/3), tekrar deneniyor`);
              continue;
            }
          }
          if (textResult?.success && textResult?.buffer) {
            fs.writeFileSync(textPagePath, textResult.buffer);
            console.log(`  [orchestrator] Sahne ${sceneNum} metin sayfasi AI ile uretildi${softened ? ' (softened)' : ''}`);
          } else {
            console.log(`  [orchestrator] Sahne ${sceneNum} metin AI basarisiz, canvas fallback`);
            await canvasRenderer.renderTextOnImage(illPath, {
              sceneNumber: sceneNum,
              title: textEntry?.title || scene.title,
              text: textEntry?.text || scene.text,
              theme: bookData.theme || {},
              ageGroup: bookData.ageGroup || "3-6",
              pageNumber: 4 + i,
              totalScenes: sceneCount,
              outputPath: textPagePath,
            });
          }
        } catch (textErr) {
          console.error(`  [orchestrator] Sahne ${sceneNum} metin hatasi:`, textErr.message, "- canvas fallback");
          try {
            await canvasRenderer.renderTextOnImage(illPath, {
              sceneNumber: sceneNum,
              title: textEntry?.title || scene.title,
              text: textEntry?.text || scene.text,
              theme: bookData.theme || {},
              ageGroup: bookData.ageGroup || "3-6",
              pageNumber: 4 + i,
              totalScenes: sceneCount,
              outputPath: textPagePath,
            });
          } catch (e2) {
            console.error(`  [orchestrator] Sahne ${sceneNum} canvas fallback da basarisiz`);
          }
        }
      }

      this.sendSSE({
        type: "scene_done",
        sceneNumber: sceneNum,
        title: scene.title,
        imagePath: sceneSuccess ? `/output/${dirName}/scene-${padNum}-final.png` : null,
        textPagePath: (sceneSuccess && !skipTextPage) ? `/output/${dirName}/scene-${padNum}-text.png` : null,
        text: textEntry?.text || scene.text,
        imageType: "scene",
      });

      if (!sceneSuccess) {
        this.sendSSE({ type: "error", message: `Sahne ${sceneNum}: basarisiz, atlaniyor...` });
      }

      finalScenePaths.push({
        sceneNumber: sceneNum,
        finalPNG: sceneSuccess ? finalPath : null,
        textPNG: (sceneSuccess && !skipTextPage) ? textPagePath : null,
      });
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

    // ════════════════════════════════════════════════════════════
    // OZEL SAYFALAR: Tamamen AI ile uretim (SVG overlay YOK)
    // coverArchitect zaten yukarida olusturuldu (satir 390-391)
    // ════════════════════════════════════════════════════════════

    // 1. ON KAPAK — AI ile metin dahil uret (referans: karakter profili)
    this.sendSSE({ type: "step", message: "Ön kapak üretiliyor..." });
    const coverFinalPath = path.join(outputDir, "cover-final.png");
    try {
      // Boyama kitabı: use bundle's dedicated coverPrompt (colored Pixar cover, from coloring-book-writer)
      const coverPrompt = (bookData.category === "boyama" && bookData.coverPrompt)
        ? bookData.coverPrompt
        : coverArchitect.buildCoverPrompt({
            characterDesc: bookData.characterDescription?.base || ""
          });
      const coverRefs = [];
      if (characterProfileRef) coverRefs.push(characterProfileRef);
      const coverResult = await sceneGenerator.generateBackground({
        prompt: coverPrompt,
        referenceImages: coverRefs,
        maxRetries: 2,
      });
      if (coverResult.success && coverResult.buffer) {
        fs.writeFileSync(coverFinalPath, coverResult.buffer);
        console.log("  [orchestrator] On kapak AI ile uretildi (metin dahil)");
      } else {
        // Fallback: ilk sahne + SVG overlay
        const firstIll = path.join(outputDir, "scene-01-illustration.png");
        await textRenderer.renderCoverPage({
          imagePath: fs.existsSync(firstIll) ? firstIll : null,
          title: bookData.title, childName, theme, ageGroup,
          outputPath: coverFinalPath,
        });
        console.log("  [orchestrator] On kapak SVG fallback kullanildi");
      }
    } catch (err) {
      console.error("  [orchestrator] On kapak hatasi:", err.message);
      try {
        const firstIll = path.join(outputDir, "scene-01-illustration.png");
        await textRenderer.renderCoverPage({
          imagePath: fs.existsSync(firstIll) ? firstIll : null,
          title: bookData.title, childName, theme, ageGroup,
          outputPath: coverFinalPath,
        });
      } catch (e2) { console.error("  [orchestrator] On kapak fallback da basarisiz:", e2.message); }
    }

    // 2. IC KAPAK (title page) — AI ile uretim (UrunStudio-tarzi vintage stationery)
    this.sendSSE({ type: "step", message: "İç kapak üretiliyor..." });
    const innerCoverPath = path.join(outputDir, "inner-cover.png");
    try {
      const icPrompt = coverArchitect.buildInnerCoverPrompt({
        characterDesc: bookData.characterDescription?.base || ""
      });
      const icRefs = [];
      if (fs.existsSync(coverFinalPath)) icRefs.push(coverFinalPath); // brand/typography continuity
      const icResult = await sceneGenerator.generateBackground({
        prompt: icPrompt,
        referenceImages: icRefs,
        maxRetries: 2,
      });
      if (icResult.success && icResult.buffer) {
        fs.writeFileSync(innerCoverPath, icResult.buffer);
        console.log("  [orchestrator] Ic kapak AI ile uretildi");
      } else {
        console.warn("  [orchestrator] Ic kapak AI uretilemedi, atlandi");
      }
    } catch (err) {
      console.error("  [orchestrator] Ic kapak hatasi:", err.message);
    }

    // 2.5 ITHAF (dedication) — AI ile uretim (watercolor stationery + duygusal ithaf)
    this.sendSSE({ type: "step", message: "İthaf sayfası üretiliyor..." });
    const dedicationPath = path.join(outputDir, "dedication.png");
    try {
      const dedPrompt = coverArchitect.buildDedicationPrompt();
      const dedRefs = [];
      if (fs.existsSync(coverFinalPath)) dedRefs.push(coverFinalPath); // typography/palette continuity
      const dedResult = await sceneGenerator.generateBackground({
        prompt: dedPrompt,
        referenceImages: dedRefs,
        maxRetries: 2,
      });
      if (dedResult.success && dedResult.buffer) {
        fs.writeFileSync(dedicationPath, dedResult.buffer);
        console.log("  [orchestrator] Ithaf AI ile uretildi");
      } else {
        console.warn("  [orchestrator] Ithaf AI uretilemedi, atlandi");
      }
    } catch (err) {
      console.error("  [orchestrator] Ithaf hatasi:", err.message);
    }

    // 3. HIKAYEMIZIN KAHRAMANI — AI arka plan + gercek fotograflar
    this.sendSSE({ type: "step", message: "Kahraman sayfası üretiliyor..." });
    const heroPagePath = path.join(outputDir, "hero-page.png");
    try {
      // AI ile tematik arka plan uret (metin yok, sadece cerceve/dekor)
      const heroPrompt = bookData.specialPagePrompts?.heroPage
        ? promptArchitect.buildScenePrompt(
            { prompt: bookData.specialPagePrompts.heroPage, mood: "heroic", setting: "hero-page" },
            { useProfile: true, useOutfitGrid: !!combinedOutfitRef }
          )
        : null;

      let heroBgPath = null;
      if (heroPrompt) {
        const heroRefs = [];
        if (characterProfileRef) heroRefs.push(characterProfileRef);
        // Cross-page multi-ref: front cover'i ekle (palette + brand consistency icin)
        if (fs.existsSync(coverFinalPath)) heroRefs.push(coverFinalPath);
        const heroResult = await sceneGenerator.generateBackground({
          prompt: heroPrompt,
          referenceImages: heroRefs,
          maxRetries: 2,
        });
        if (heroResult.success && heroResult.buffer) {
          heroBgPath = path.join(outputDir, "hero-page-bg.png");
          fs.writeFileSync(heroBgPath, heroResult.buffer);
          console.log("  [orchestrator] Hero page AI arka plan uretildi");
        }
      }

      // Gercek fotograflari AI arka plan uzerine yerlestir
      const heroChildPhoto = path.join(outputDir, "child-photo" + (path.extname(opts.childPhotoPath) || ".jpg"));
      await textRenderer.renderHeroPage({
        childName,
        childPhotoPath: fs.existsSync(heroChildPhoto) ? heroChildPhoto : opts.childPhotoPath,
        extraPhotoPaths: childInfo._copiedExtraPaths || [],
        theme,
        ageGroup: bookData.ageGroup,
        bookTitle: bookData.title,
        outputPath: heroPagePath,
        backgroundImagePath: heroBgPath,
      });
      console.log("  [orchestrator] Hero page tamamlandi");
    } catch (err) {
      console.error("  [orchestrator] Hero page hatasi:", err.message);
      // Fallback: SVG only
      try {
        await textRenderer.renderHeroPage({
          childName, childPhotoPath: opts.childPhotoPath, theme,
          ageGroup: bookData.ageGroup, bookTitle: bookData.title, outputPath: heroPagePath,
          extraPhotoPaths: childInfo._copiedExtraPaths || [],
        });
      } catch (e2) { console.error("  [orchestrator] Hero SVG fallback da basarisiz:", e2.message); }
    }

    // 4. ARKA KAPAK — AI ile metin dahil (referans: karakter profili)
    this.sendSSE({ type: "step", message: "Arka kapak üretiliyor..." });
    const backCoverPath = path.join(outputDir, "back-cover.png");
    try {
      const isBoyama = bookData.category === "boyama" && bookData.specialPagePrompts?.backCover;
      let bcPrompt = isBoyama
        ? bookData.specialPagePrompts.backCover
        : coverArchitect.buildBackCoverPrompt();
      // CHARACTER_DESC'yi gercek karakter tarifiyle degistir
      if (characterProfileRef && bcPrompt.includes("CHARACTER_DESC")) {
        const charBase = bookData.characterDescription?.base || "a child with the EXACT same facial features as the reference photo";
        bcPrompt = bcPrompt.replace("CHARACTER_DESC", charBase);
      }
      // Referans gorseller — karakter profili + on kapak (yuz tutarliligi icin). Boyama: +logo
      const bcRefs = [];
      if (characterProfileRef) bcRefs.push(characterProfileRef);
      if (isBoyama) {
        const logoPath = "C:/Users/ASUS/Desktop/MasalSensinUrunStudio/public/brand/masalsensin-logo.jpg";
        if (fs.existsSync(logoPath)) bcRefs.push(logoPath);
      } else {
        const coverFinalLocal = path.join(outputDir, "cover-final.png");
        if (fs.existsSync(coverFinalLocal)) bcRefs.push(coverFinalLocal);
      }
      const bcResult = await sceneGenerator.generateBackground({
        prompt: bcPrompt,
        referenceImages: bcRefs,
        maxRetries: 2,
      });
      if (bcResult.success && bcResult.buffer) {
        fs.writeFileSync(backCoverPath, bcResult.buffer);
        console.log("  [orchestrator] Arka kapak AI ile uretildi (metin dahil)");
      } else {
        await textRenderer.renderBackCoverPage({
          title: bookData.title, childName, description: bookData.description,
          lessons: bookData.lessons || [], theme, outputPath: backCoverPath,
        });
      }
    } catch (err) {
      console.error("  [orchestrator] Arka kapak hatasi:", err.message);
      try {
        await textRenderer.renderBackCoverPage({
          title: bookData.title, childName, description: bookData.description,
          lessons: bookData.lessons || [], theme, outputPath: backCoverPath,
        });
      } catch (e2) {}
    }

    // 5. GONDEREN NOTU — Her zaman uret (senderName yoksa genel not)
    {
      // senderName yoksa varsayilan deger ata
      if (!childInfo.senderName) childInfo.senderName = "Ailen";
      console.log("  [orchestrator] Not icin senderName:", childInfo.senderName);
      const isBoyamaNote = bookData.category === "boyama";
      this.sendSSE({ type: "step", message: isBoyamaNote ? "Tamamlandı sertifikası üretiliyor..." : "Gönderen notu üretiliyor..." });
      try {
        const snPrompt = await coverArchitect.buildSenderNotePrompt();
        console.log("  [orchestrator] Not prompt baslik:", snPrompt.substring(0, 200));
        // Cross-page multi-ref: front cover'i palette/typography continuity icin ekle
        const snRefs = [];
        if (fs.existsSync(coverFinalPath)) snRefs.push(coverFinalPath);
        const snResult = await sceneGenerator.generateBackground({
          prompt: snPrompt,
          referenceImages: snRefs,
          maxRetries: 2,
        });
        if (snResult.success && snResult.buffer) {
          fs.writeFileSync(path.join(outputDir, "sender-note.png"), snResult.buffer);
          console.log("  [orchestrator] Sender note AI ile uretildi (metin dahil)");
        } else {
          await textRenderer.renderSenderNotePage({
            childName, senderName: childInfo.senderName || "",
            senderNote: childInfo.customMessage || "", theme,
            outputPath: path.join(outputDir, "sender-note.png"),
          });
        }
      } catch (err) {
        console.error("  [orchestrator] Sender note hatasi:", err.message);
        try {
          await textRenderer.renderSenderNotePage({
            childName, senderName: childInfo.senderName || "",
            senderNote: childInfo.customMessage || "", theme,
            outputPath: path.join(outputDir, "sender-note.png"),
          });
        } catch (e2) {}
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

          // FunFact: AI ile metin dahil uret
          const ffPrompt = coverArchitect.buildFunFactPagePrompt(fact);
          // Cross-page multi-ref: front cover'i palette continuity icin ekle
          const ffRefs = [];
          if (fs.existsSync(coverFinalPath)) ffRefs.push(coverFinalPath);
          const ffResult = await sceneGenerator.generateBackground({
            prompt: ffPrompt,
            referenceImages: ffRefs,
            maxRetries: 1,
          });
          if (ffResult.success && ffResult.buffer) {
            fs.writeFileSync(ffPath, ffResult.buffer);
            console.log(`  [orchestrator] FunFact ${placement.afterScene} AI ile uretildi (metin dahil)`);
          } else {
            // Fallback: SVG
            await textRenderer.renderFunFactPage({ funFact: fact, theme, outputPath: ffPath });
            console.log(`  [orchestrator] FunFact ${placement.afterScene} SVG fallback`);
          }

          funFactPages.push({ afterScene: placement.afterScene, png: ffPath });
        } catch (err) {
          console.error("  [orchestrator] FunFact hatasi:", err.message);
          // SVG fallback
          try {
            const ffPath = path.join(outputDir, `funfact-after-${placement.afterScene}.png`);
            await textRenderer.renderFunFactPage({ funFact: fact, theme, outputPath: ffPath });
            funFactPages.push({ afterScene: placement.afterScene, png: ffPath });
          } catch(e2) {}
        }
      }
    }

    // MESLEK DIPLOMASI — sadece meslek-hikayeleri kategorisi icin (kapanistan once)
    let diplomaPath = null;
    if (bookData.category === "meslek-hikayeleri") {
      this.sendSSE({ type: "step", message: "Meslek diploması üretiliyor..." });
      diplomaPath = path.join(outputDir, "diploma.png");
      try {
        const diplomaPrompt = coverArchitect.buildMeslekDiplomaPrompt();
        const diplomaRefs = [];
        if (fs.existsSync(coverFinalPath)) diplomaRefs.push(coverFinalPath);
        if (characterProfileRef) diplomaRefs.push(characterProfileRef);
        const diplomaResult = await sceneGenerator.generateBackground({
          prompt: diplomaPrompt,
          referenceImages: diplomaRefs,
          maxRetries: 2,
        });
        if (diplomaResult.success && diplomaResult.buffer) {
          fs.writeFileSync(diplomaPath, diplomaResult.buffer);
          console.log("  [orchestrator] Meslek diplomasi AI ile uretildi");
        } else {
          diplomaPath = null;
          console.warn("  [orchestrator] Meslek diplomasi uretilemedi, atlandi");
        }
      } catch (err) {
        diplomaPath = null;
        console.error("  [orchestrator] Meslek diplomasi hatasi:", err.message);
      }
    }

    // KAPANIS (SON) sayfasi — AI ile uretim, arka kapaktan once
    this.sendSSE({ type: "step", message: "Kapanış sayfası üretiliyor..." });
    const endingPath = path.join(outputDir, "ending.png");
    try {
      const endPrompt = coverArchitect.buildEndingPrompt();
      const endRefs = [];
      if (fs.existsSync(coverFinalPath)) endRefs.push(coverFinalPath);
      const endResult = await sceneGenerator.generateBackground({
        prompt: endPrompt,
        referenceImages: endRefs,
        maxRetries: 2,
      });
      if (endResult.success && endResult.buffer) {
        fs.writeFileSync(endingPath, endResult.buffer);
        console.log("  [orchestrator] Kapanis AI ile uretildi");
      } else {
        console.warn("  [orchestrator] Kapanis AI uretilemedi, atlandi");
      }
    } catch (err) {
      console.error("  [orchestrator] Kapanis hatasi:", err.message);
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
        innerCoverPNG: fs.existsSync(innerCoverPath) ? innerCoverPath : null,
        heroPagePNG: path.join(outputDir, "hero-page.png"),
        dedicationPNG: fs.existsSync(dedicationPath) ? dedicationPath : null,
        senderNotePNG: fs.existsSync(path.join(outputDir, "sender-note.png")) ? path.join(outputDir, "sender-note.png") : null,
        scenePages: finalScenePaths,
        funFactPages,
        diplomaPNG: (diplomaPath && fs.existsSync(diplomaPath)) ? diplomaPath : null,
        endingPNG: fs.existsSync(endingPath) ? endingPath : null,
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
