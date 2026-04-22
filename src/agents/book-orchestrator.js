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
const { retryWithBackoff } = require("../util/retry-with-backoff");

// Set MASAL_FORCE_CANVAS_FALLBACK=1 to keep legacy behaviour (silent SVG fallback).
// Default: AI failure → degraded book (kitap-degraded.pdf + pages-failed.json).
const FORCE_CANVAS_FALLBACK = process.env.MASAL_FORCE_CANVAS_FALLBACK === "1";

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
    // Per-run state: pages that exhausted AI retries. On non-empty: book is marked degraded.
    this.degradedPages = [];

    const { bookId, childPhotoPath, childName, childGender, childAge, outputDir, dirName, recipientName, senderName, customMessage, recipientNickname, senderGender, sharedActivity, recipientHobby, specialMemory, extraPhotoPaths, giftSenderName, giftSenderRelation } = opts;
    const childInfo = {
      name: childName, gender: childGender, age: childAge,
      recipientName, senderName, customMessage, recipientNickname, senderGender,
      sharedActivity, recipientHobby, specialMemory,
      extraPhotoPaths: extraPhotoPaths || [],
      // Webhook'tan gelen hediyeyi hazırlayan bilgisi (not sayfasinda kullanilir)
      giftSenderName: giftSenderName || senderName || "",
      giftSenderRelation: giftSenderRelation || "",
    };

    // ──────────────────────────────────────────
    // FAZ 1: BASLANGIC
    // ──────────────────────────────────────────
    const bookPath = path.join(__dirname, "..", "stories", bookId, "book.json");
    if (!fs.existsSync(bookPath)) throw new Error(`Kitap bulunamadi: ${bookId}`);
    const bookData = JSON.parse(fs.readFileSync(bookPath, "utf-8"));

    // ── TITLE/HERO NAME PERSONALIZATION ──
    // Iki durum:
    // 1) book.json'da templateHeroName (ör. "Mira") varsa → childName ile swap (legacy book.json).
    // 2) book.json'da {CHILD_NAME} placeholder varsa → childName ile substitute (yeni format — altin-basketbol tarzi).
    // Her iki durumda title, coverTitle, description, specialPagePrompts, scene.title/text/prompt isleniyor.
    const personalizeFields = (pairs) => {
      const apply = (s) => {
        if (typeof s !== "string") return s;
        let out = s;
        for (const [pattern, replacement] of pairs) out = out.replace(pattern, replacement);
        return out;
      };
      if (bookData.title) bookData.title = apply(bookData.title);
      if (bookData.coverTitle) bookData.coverTitle = apply(bookData.coverTitle);
      if (bookData.description) bookData.description = apply(bookData.description);
      if (bookData.specialPagePrompts) {
        for (const k in bookData.specialPagePrompts) {
          bookData.specialPagePrompts[k] = apply(bookData.specialPagePrompts[k]);
        }
      }
      if (Array.isArray(bookData.scenes)) {
        for (const sc of bookData.scenes) {
          if (sc.title) sc.title = apply(sc.title);
          if (sc.text) sc.text = apply(sc.text);
          if (sc.prompt) sc.prompt = apply(sc.prompt);
        }
      }
    };

    // ── TURKISH MORPHOLOGY HELPERS (BASELINE RULE 1) ──
    // Simple "Ada" → "Yaren" string replace breaks suffixes ("Ada'nın" → "Yaren'nın" instead of "Yaren'in").
    // This helper detects the Turkish case suffix after the apostrophe and regenerates it for the new name.
    const getVowelHarmony = (name) => {
      const vowels = (name || "").toLowerCase().match(/[aeıioöuü]/g) || ["a"];
      const last = vowels[vowels.length - 1];
      const narrow = { a:"ı", ı:"ı", e:"i", i:"i", o:"u", u:"u", ö:"ü", ü:"ü" }[last] || "ı";
      const wide   = { a:"a", ı:"a", e:"e", i:"e", o:"a", u:"a", ö:"e", ü:"e" }[last] || "a";
      const endsInVowel = /[aeıioöuü]$/i.test(name || "");
      return { narrow, wide, endsInVowel };
    };
    const regenerateTurkishSuffix = (oldSuffix, newName) => {
      const h = getVowelHarmony(newName);
      const bY = h.endsInVowel ? "y" : "";
      const bN = h.endsInVowel ? "n" : "";
      const s = (oldSuffix || "").toLowerCase();
      // Genitive: nın/nin/nun/nün/ın/in/un/ün
      if (/^n?[ıiuü]n$/.test(s))    return bN + h.narrow + "n";
      // Plural: lar/ler
      if (/^l[ae]r$/.test(s))        return "l" + h.wide + "r";
      // Ablative: dan/den/tan/ten
      if (/^[dt][ae]n$/.test(s))     return "d" + h.wide + "n";
      // Locative: da/de/ta/te
      if (/^[dt][ae]$/.test(s))      return "d" + h.wide;
      // Instrumental with-la: yla/yle/la/le
      if (/^y?l[ae]$/.test(s))       return bY + "l" + h.wide;
      // Dative: ya/ye/a/e
      if (/^y?[ae]$/.test(s))        return bY + h.wide;
      // Accusative: yı/yi/yu/yü/ı/i/u/ü
      if (/^y?[ıiuü]$/.test(s))      return bY + h.narrow;
      // Possessive 3rd-person: sı/si/su/sü/ı/i/u/ü (similar to accusative shape)
      if (/^s?[ıiuü]$/.test(s))      return (h.endsInVowel ? "s" : "") + h.narrow;
      return oldSuffix; // unknown — keep as-is
    };
    const buildMorphologyAwareReplacer = (oldName, newName) => {
      // Match: \b<oldName>(['’]<suffix>)? where suffix is Turkish letters
      const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp("\\b" + escaped + "\\b(?:(['’])([a-zçğıöşüA-ZÇĞİÖŞÜ]+))?", "g");
      return (input) => input.replace(re, (_m, apo, suf) => {
        if (!suf) return newName;
        const newSuf = regenerateTurkishSuffix(suf, newName);
        return newName + apo + newSuf;
      });
    };

    // Apply placeholder + hero-name substitutions with morphology awareness
    const pairs = [];
    // {CHILD_NAME} placeholder (yeni format) — direct substitution, handle suffix too
    pairs.push([buildMorphologyAwareReplacer("\\{CHILD_NAME\\}", childName), true]);
    // templateHeroName legacy swap (e.g., "Ada" → "Yaren") — with morphology
    const templateHeroName = bookData.templateHeroName || bookData.heroName || null;
    if (templateHeroName && templateHeroName !== childName) {
      console.log(`  [orchestrator] Hero name swap: "${templateHeroName}" -> "${childName}" (morphology-aware)`);
      pairs.push([buildMorphologyAwareReplacer(templateHeroName, childName), true]);
    }
    // Re-run personalizeFields with function replacers
    // ── GENDER SANITIZER (for EN scene prompts) ──
    // Some templates have English prompts with hardcoded "the boy" / "his" / "he" that don't match the customer's child gender.
    // Swap them to the actual gender. Turkish story text is gender-neutral so we only touch EN image prompts.
    const gender = (childGender || "").toLowerCase();
    const toFemale = gender === "kiz" || gender === "kız";
    const toMale = gender === "erkek";
    const genderSanitize = (s) => {
      if (typeof s !== "string" || (!toFemale && !toMale)) return s;
      let out = s;
      if (toFemale) {
        // boy → girl variants, keep article/adjective
        out = out.replace(/\b(A|a|The|the|young|Young|little|Little)\s+boy\b/g, "$1 girl");
        out = out.replace(/\bboys\b/g, "girls");
        out = out.replace(/\bBoys\b/g, "Girls");
        // Pronouns (case-preserving with word boundaries — safe within English prompts)
        out = out.replace(/\bhe\b/g, "she").replace(/\bHe\b/g, "She");
        out = out.replace(/\bhis\b/g, "her").replace(/\bHis\b/g, "Her");
        out = out.replace(/\bhim\b/g, "her").replace(/\bHim\b/g, "Her");
        out = out.replace(/\bhimself\b/g, "herself").replace(/\bHimself\b/g, "Herself");
      } else if (toMale) {
        out = out.replace(/\b(A|a|The|the|young|Young|little|Little)\s+girl\b/g, "$1 boy");
        out = out.replace(/\bgirls\b/g, "boys");
        out = out.replace(/\bGirls\b/g, "Boys");
        out = out.replace(/\bshe\b/g, "he").replace(/\bShe\b/g, "He");
        // "her" → either "his" (possessive) or "him" (object). Too ambiguous — safest bet: possessive "his" (more common in prompts)
        out = out.replace(/\bher\b/g, "his").replace(/\bHer\b/g, "His");
        out = out.replace(/\bherself\b/g, "himself").replace(/\bHerself\b/g, "Himself");
      }
      return out;
    };

    // Strip legacy literal-bleed phrases from scene prompts.
    // These made sense as STYLE DIRECTION in concept generation but AI renders them literally
    // ("Ice Age posters" on walls, "Bedtime!" English signs). Sanitize at order time so templates
    // not yet migrated still produce clean output.
    const sanitizeScenePrompt = (s) => {
      if (typeof s !== "string") return s;
      let out = s;
      // CRITICAL: Strip "(physical features that MUST be preserved ...)" parenthetical blocks.
      // UrunStudio conceptAgent embeds child-specific physical traits here, causing drift.
      out = out.replace(/\s*\(\s*physical\s+features\s+that\s+MUST\s+be\s+preserved[^)]*\)/gi, "");
      out = out.replace(/\s*\(physical\s+features[^)]*\)/gi, "");
      // Brand-name style bleed → generic Pixar
      out = out.replace(/\bIce\s+Age\s+and\s+Shrek\s+style\b/gi, "Pixar 3D CGI animation style");
      out = out.replace(/\bIce\s+Age\s*(?:and|\/|,)\s*Shrek\b/gi, "Pixar 3D CGI");
      out = out.replace(/\bin\s+the\s+style\s+of\s+(?:Ice\s+Age|Shrek|Disney|Pixar)\b/gi, "in premium 3D CGI style");
      out = out.replace(/\b(Shrek|Ice\s+Age)\s+(?:style|film|movie|like)\b/gi, "premium 3D CGI style");
      // English action/command words that AI renders as literal wall text.
      out = out.replace(/\bBedtime!\s*/g, "");
      out = out.replace(/\bWake\s+up!\s*/g, "");
      out = out.replace(/\bHurry!\s*/g, "");
      out = out.replace(/\s+/g, " ").replace(/\s([.,!?])/g, "$1").trim();
      return out;
    };

    const applyAll = (s) => {
      if (typeof s !== "string") return s;
      let out = s;
      // Placeholder replace with Turkish-morphology-aware suffix handling.
      // Regex captures: group 1 = apostrophe (single or smart), group 2 = Turkish suffix.
      // Bug fix (2026-04-21): previously apo captured apo+suf together, causing "Yiğit'ınin" (double suffix).
      out = out.replace(/\{CHILD_NAME\}(['’])([a-zçğıöşüA-ZÇĞİÖŞÜ]+)?/g, (_m, apo, suf) => {
        if (!suf) return childName; // no suffix after apostrophe — just use name (keep lone apostrophe if present)
        return childName + apo + regenerateTurkishSuffix(suf, childName);
      });
      // Bare {CHILD_NAME} without apostrophe — just substitute the name.
      out = out.replace(/\{CHILD_NAME\}/g, childName);
      if (templateHeroName && templateHeroName !== childName) {
        out = buildMorphologyAwareReplacer(templateHeroName, childName)(out);
      }
      return out;
    };
    const personalizeFieldsMorpho = () => {
      if (bookData.title) bookData.title = applyAll(bookData.title);
      if (bookData.coverTitle) bookData.coverTitle = applyAll(bookData.coverTitle);
      if (bookData.description) bookData.description = applyAll(bookData.description);
      if (bookData.specialPagePrompts) {
        for (const k in bookData.specialPagePrompts) {
          // Image prompts are EN — also sanitize gender references
          bookData.specialPagePrompts[k] = genderSanitize(applyAll(bookData.specialPagePrompts[k]));
        }
      }
      if (bookData.coverPrompt) bookData.coverPrompt = genderSanitize(applyAll(bookData.coverPrompt));
      if (Array.isArray(bookData.scenes)) {
        for (const sc of bookData.scenes) {
          if (sc.title) sc.title = applyAll(sc.title);
          if (sc.text) sc.text = applyAll(sc.text);
          // Scene prompt is EN — sanitize gender + brand/English bleed AFTER name swap
          if (sc.prompt) sc.prompt = sanitizeScenePrompt(genderSanitize(applyAll(sc.prompt)));
        }
      }
    };
    personalizeFieldsMorpho();

    // ── OUTFIT GUARD ──
    // If a scene has no outfitId AND book has no global outfit, assign "casual" default so
    // Phase 2.5 includes the scene in the outfit-grid and scene prompts receive a ref.
    // Without this, the scene renders with whatever clothes the AI invents (drift risk).
    {
      const KNOWN_OUTFIT_LABELS = new Set(["casual", "default", "pajamas", "pro-uniform", "school-uniform", "sport-uniform"]);
      const hasGlobalOutfit = !!(bookData.outfit && bookData.outfit.description);
      if (!hasGlobalOutfit && Array.isArray(bookData.scenes)) {
        let defaulted = 0;
        let unknownLabel = 0;
        for (const sc of bookData.scenes) {
          if (!sc.outfitId) {
            sc.outfitId = "casual";
            defaulted++;
          } else if (!KNOWN_OUTFIT_LABELS.has(String(sc.outfitId).toLowerCase())) {
            const hasWearingInPrompt = /\bwearing\s+/i.test(sc.prompt || "");
            if (!hasWearingInPrompt) {
              unknownLabel++;
              console.warn(`  [orchestrator] Outfit guard: scene ${sc.sceneNumber} has outfitId="${sc.outfitId}" but no "wearing ..." in prompt and label unknown — grid will render it as raw label.`);
            }
          }
        }
        if (defaulted > 0) {
          console.warn(`  [orchestrator] Outfit guard: ${defaulted} scene(s) had missing outfitId → defaulted to "casual".`);
        }
        if (unknownLabel > 0) {
          console.warn(`  [orchestrator] Outfit guard: ${unknownLabel} scene(s) have unknown outfitId label with no "wearing" clause — visual consistency at risk.`);
        }
      }
    }

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
      // F3: Karakter profili gender guard — Gemini vision ile cinsiyet kontrolu.
      // Yanlis cinsiyet uretildiyse guclu direktifle 2 kere retry.
      const expectedGender = childInfo.gender === "kiz" ? "kiz" : "erkek";
      const genderLabelTr = expectedGender === "kiz" ? "kız" : "erkek";
      let currentBuffer = profileResult.buffer;
      let currentResultUrl = profileResult.resultUrl;
      for (let genderAttempt = 1; genderAttempt <= 2; genderAttempt++) {
        const genderCheck = await qualityValidator.checkGenderMatch(currentBuffer, expectedGender).catch(e => ({
          match: true, perceived: "unclear", confidence: 0, feedback: "check failed: " + e.message,
        }));
        console.log(`  [orchestrator] Karakter cinsiyet kontrolu (deneme ${genderAttempt}): beklenen=${expectedGender}, algilanan=${genderCheck.perceived}, confidence=${genderCheck.confidence}, match=${genderCheck.match}`);
        if (genderCheck.match || genderCheck.perceived === "unclear") break;
        if (genderAttempt === 2) {
          console.warn(`  [orchestrator] Gender guard: 2 denemede de duzelmedi, mevcut profil ile devam ediliyor`);
          break;
        }
        // Mismatch: retry with reinforced gender directive
        const reinforcement = `\n\n⚠️ CRITICAL GENDER OVERRIDE — READ BEFORE RENDERING:\n` +
          `The previous attempt produced a character that looked like a ${genderCheck.perceived === "kiz" ? "girl" : "boy"}, which is WRONG.\n` +
          `This child MUST be rendered as UNAMBIGUOUSLY ${genderLabelTr === "kız" ? "FEMININE (a girl)" : "MASCULINE (a boy)"} — readable at a glance by any parent.\n` +
          `${genderLabelTr === "kız"
            ? "Feminine facial proportions (softer jawline, fuller cheeks), longer hair OR clearly feminine short cut, feminine clothing silhouette and color palette appropriate for a Turkish girl."
            : "Masculine facial proportions, shorter boyish haircut, masculine clothing silhouette and color palette appropriate for a Turkish boy."}\n` +
          `Do NOT produce an androgynous or opposite-gender rendering. If the reference photo is ambiguous, still bias firmly toward ${genderLabelTr}.`;
        const retryPrompt = profilePrompt + reinforcement;
        console.log(`  [orchestrator] Karakter profili cinsiyet retry basliyor (deneme ${genderAttempt + 1})...`);
        const retryResult = await sceneGenerator.generateScene({
          prompt: retryPrompt, referenceImages: [], maxRetries: 1,
        }).catch(e => ({ success: false, error: e.message }));
        if (retryResult.success && retryResult.buffer) {
          currentBuffer = retryResult.buffer;
          currentResultUrl = retryResult.resultUrl;
        } else {
          console.warn(`  [orchestrator] Gender retry basarisiz: ${retryResult.error || "unknown"}, mevcut profil korunuyor`);
          break;
        }
      }

      // Karakter profilini diske yaz (gender-guard sonrasi final buffer)
      const profilePath = path.join(outputDir, "character-profile.png");
      fs.writeFileSync(profilePath, currentBuffer);
      characterProfileBuffer = currentBuffer;
      characterProfileRef = currentResultUrl || profilePath;
      console.log(`  [orchestrator] Karakter profili TAMAM (ref: ${currentResultUrl ? "URL" : "disk"})`);

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
    // FAZ 2.6: SIDEKICK (PET) PROFILI
    // book.json'da `sidekick: { name, species, description }` varsa turntable uret.
    // Bu ref her sahneye gecer — yan karakter (ornek Minnos) sahneler arasinda
    // tur/renk/desen degismesini engeller.
    // ──────────────────────────────────────────
    let sidekickProfileRef = null;
    let sidekickProfileBuffer = null;
    const sidekick = bookData.sidekick;
    if (sidekick && sidekick.description) {
      this.sendSSE({ type: "step", message: `${sidekick.name || "Sidekick"} referansi hazirlaniyor...` });
      console.log(`  [orchestrator] FAZ 2.6: Sidekick profili uretiliyor (${sidekick.name || "(isimsiz)"} — ${sidekick.species || "pet"})...`);
      const sidekickStart = Date.now();
      const sidekickPrompt = promptArchitect.buildSidekickProfilePrompt(sidekick);
      try {
        const sidekickResult = await retryWithBackoff(async () => {
          const r = await sceneGenerator.generateScene({
            prompt: sidekickPrompt, referenceImages: [], maxRetries: 2,
          });
          if (!r.success || !r.buffer) throw new Error("sidekick profile: no buffer");
          return r;
        }, { label: "sidekick-profile" });
        const sidekickPath = path.join(outputDir, "sidekick-profile.png");
        fs.writeFileSync(sidekickPath, sidekickResult.buffer);
        sidekickProfileRef = sidekickPath;
        sidekickProfileBuffer = sidekickResult.buffer;
        const sidekickElapsed = Math.round((Date.now() - sidekickStart) / 1000);
        console.log(`  [orchestrator] FAZ 2.6 TAMAMLANDI: Sidekick profili hazir (${sidekickElapsed}s)`);
        this.sendSSE({
          type: "scene_done",
          sceneNumber: "sidekick-profile",
          title: `${sidekick.name || "Yan Karakter"} Referansi`,
          imagePath: `/output/${dirName}/sidekick-profile.png`,
          imageType: "sidekick",
        });
      } catch (err) {
        console.error(`  [orchestrator] FAZ 2.6 BASARISIZ: ${err.message} — sahneler sidekick ref olmadan uretilecek (sadece text enforcement)`);
        this.degradedPages.push({ page: "sidekick-profile", reason: err.message });
      }
    }

    // ──────────────────────────────────────────
    // FAZ 3: PARALEL BATCH SAHNE URETIMI
    // ──────────────────────────────────────────
    const BATCH_SIZE = 7; // Ayni anda max 7 sahne

    // Labirent sahnelerini programatik uret (AI yerine)
    const mazeScenes = bookData.scenes.filter(s => s.specialType === "maze");
    const nonMazeScenes = bookData.scenes.filter(s => s.specialType !== "maze");

    console.log(`  [orchestrator] FAZ 3: ${nonMazeScenes.length} sahne PARALEL uretilecek + ${mazeScenes.length} labirent programatik (batch: ${BATCH_SIZE})...`);

    const outfitStepOffset = hasOutfitSystem ? 1 : 0;
    this.sendSSE({
      type: "step",
      step: 4 + outfitStepOffset,
      total: TOTAL_STEPS,
      message: `${sceneCount} sahne paralel uretiliyor...`,
    });
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

      // Sidekick profili (Minnos gibi yan karakter) — her sahneye gecer ki
      // kedinin turu/rengi sahneler arasinda degismesin.
      if (sidekickProfileRef) {
        referenceImages.push(sidekickProfileRef);
      }

      if (hasOutfitProfile) {
        console.log(`    → Sahne ${scene.sceneNumber}: Kiyafet profili: ${scene.outfitId}`);
      }

      const promptOptions = {
        isAnchor: i === 0,
        hasCharacterProfile,
        hasOutfitProfile,
        hasSidekickProfile: !!sidekickProfileRef,
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
          // Karakter yuzu + outfit profili + sahne-final PNG reference olarak.
          // Sahne PNG'yi de ref olarak vermek: text page arka plani sahne ile tutarli olsun.
          const textPageRefs = [];
          if (characterProfileRef) textPageRefs.push(characterProfileRef);
          if (sceneOutfitProfile?.ref) textPageRefs.push(sceneOutfitProfile.ref);
          if (sidekickProfileRef) textPageRefs.push(sidekickProfileRef);
          if (fs.existsSync(finalPath)) textPageRefs.push(finalPath);

          // Google content-filter vurunca prompt'u yumusatip yeniden dene
          const softenPrompt = (txt) => txt
            .replace(/pajamas?/gi, "comfortable home clothes")
            .replace(/pijama/gi, "rahat ev kiyafeti")
            .replace(/bedroom/gi, "home room")
            .replace(/yatak odas[iı]/gi, "ev")
            .replace(/\bbed\b/gi, "couch")
            .replace(/sleepwear/gi, "home clothes")
            .replace(/undressed|naked|bare/gi, "clothed");
          // TEXT PAGE AI GEN — wrapped in retryWithBackoff so network blackouts (fetch failed)
          // don't silently fall to Canvas. Policy-filter soften pass runs INSIDE the retry.
          // On exhausted retries, push to degradedPages and SKIP Canvas (unless FORCE_CANVAS_FALLBACK=1).
          let textResult = null;
          let softened = false;
          try {
            textResult = await retryWithBackoff(async () => {
              // Up to 2 internal attempts (plain + softened) before throwing for outer backoff
              for (let attempt = 1; attempt <= 2; attempt++) {
                let promptToUse = coverArchitect.buildTextPagePrompt({
                  title: textEntry?.title || scene.title,
                  text: textEntry?.text || scene.text,
                  mood: scene.mood || "warm",
                  setting: scene.setting || "",
                  sceneAction: scene.title || "",
                  sceneOutfit: softened ? softenPrompt(sceneOutfit) : sceneOutfit,
                });
                if (softened) promptToUse = softenPrompt(promptToUse);
                const r = await sceneGenerator.generateBackground({
                  prompt: promptToUse,
                  referenceImages: textPageRefs,
                  maxRetries: 1,
                });
                if (r?.success && r?.buffer) return r;
                const errLower = String(r?.error || "").toLowerCase();
                const isPolicy = errLower.includes("prohibited") || errLower.includes("filtered") || errLower.includes("policy");
                if (attempt === 1 && isPolicy && !softened) {
                  softened = true;
                  continue;
                }
                throw new Error(`text-page scene ${sceneNum}: ${r?.error || "no buffer"}`);
              }
              throw new Error(`text-page scene ${sceneNum}: exhausted inner attempts`);
            }, { label: `text-page-${sceneNum}` });
          } catch (exhausted) {
            // All 3 backoff retries failed. Don't silently Canvas — mark degraded.
            console.error(`  [orchestrator] Sahne ${sceneNum} metin AI basarisiz (retry-with-backoff sonrasi):`, exhausted.message);
            this.degradedPages.push({ page: `scene-${sceneNum}-text`, reason: exhausted.message });
            if (FORCE_CANVAS_FALLBACK) {
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
                console.log(`  [orchestrator] Sahne ${sceneNum} text Canvas fallback (FORCE_CANVAS_FALLBACK=1)`);
              } catch (e2) { console.error(`  [orchestrator] Sahne ${sceneNum} canvas fallback da basarisiz:`, e2.message); }
            }
          }
          if (textResult?.success && textResult?.buffer) {
            fs.writeFileSync(textPagePath, textResult.buffer);
            console.log(`  [orchestrator] Sahne ${sceneNum} metin sayfasi AI ile uretildi${softened ? ' (softened)' : ''}`);
          }
        } catch (textErr) {
          console.error(`  [orchestrator] Sahne ${sceneNum} metin hatasi:`, textErr.message);
          this.degradedPages.push({ page: `scene-${sceneNum}-text`, reason: textErr.message });
          if (FORCE_CANVAS_FALLBACK) {
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

    // 1. ON KAPAK — UrunStudio coverAgent port kullanılıyor (Masal listing ile aynı kalite + başlık-tema uyumu).
    // AI: 3 deneme (30s/60s/120s backoff). Hepsi patlarsa degradedPages + (istege bagli) Canvas fallback.
    this.sendSSE({ type: "step", message: "Ön kapak üretiliyor..." });
    const coverFinalPath = path.join(outputDir, "cover-final.png");
    try {
      await retryWithBackoff(async () => {
        if (bookData.category === "boyama" && bookData.coverPrompt) {
          const coverRefs = [];
          if (characterProfileRef) coverRefs.push(characterProfileRef);
          const coverResult = await sceneGenerator.generateBackground({
            prompt: bookData.coverPrompt, referenceImages: coverRefs, maxRetries: 2,
          });
          if (!coverResult.success || !coverResult.buffer) throw new Error("boyama cover: no buffer");
          fs.writeFileSync(coverFinalPath, coverResult.buffer);
          console.log("  [orchestrator] On kapak AI ile uretildi (boyama)");
        } else {
          const { generateCoverImage } = require("../urunstudio-port/coverAgent");
          const { buildFakeConcept, resolveCategory } = require("../urunstudio-port/masal-adapter");
          const stCat = resolveCategory(bookData.category);
          const fakeConcept = buildFakeConcept(bookData, { ...childInfo, childName });
          let childPhotoForCover = null;
          for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
            const p = path.join(outputDir, "child-photo" + ext);
            if (fs.existsSync(p)) { childPhotoForCover = p; break; }
          }
          if (!childPhotoForCover && opts.childPhotoPath && fs.existsSync(opts.childPhotoPath)) {
            childPhotoForCover = opts.childPhotoPath;
          }
          const childPhotoRef = childPhotoForCover
            ? `data:image/${path.extname(childPhotoForCover).slice(1) || "jpeg"};base64,${fs.readFileSync(childPhotoForCover).toString("base64")}`
            : undefined;
          const result = await generateCoverImage(stCat, fakeConcept, childPhotoRef);
          if (!result?.imageUrl) throw new Error("cover: no imageUrl from generateCoverImage");
          const m = result.imageUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
          if (!m) throw new Error("cover: invalid data url");
          fs.writeFileSync(coverFinalPath, Buffer.from(m[1], "base64"));
          console.log("  [orchestrator] On kapak UrunStudio coverAgent ile uretildi (iPhone foto ref)");
        }
        if (!fs.existsSync(coverFinalPath) || fs.statSync(coverFinalPath).size < 10000) {
          throw new Error("cover: file missing or too small after AI call");
        }
      }, { label: "cover" });
    } catch (err) {
      console.error("  [orchestrator] On kapak AI basarisiz (retry sonrasi):", err.message);
      this.degradedPages.push({ page: "cover", reason: err.message });
      if (FORCE_CANVAS_FALLBACK) {
        try {
          const firstIll = path.join(outputDir, "scene-01-illustration.png");
          await textRenderer.renderCoverPage({
            imagePath: fs.existsSync(firstIll) ? firstIll : null,
            title: bookData.title, childName, theme, ageGroup,
            outputPath: coverFinalPath,
          });
          console.log("  [orchestrator] On kapak SVG fallback kullanildi (FORCE_CANVAS_FALLBACK=1)");
        } catch (e2) { console.error("  [orchestrator] On kapak fallback da basarisiz:", e2.message); }
      }
    }

    // NOT: Ic kapak ve Ithaf sayfalari KALDIRILDI (kullanici konseptinde yer almiyor).
    // Akis: Kapak -> Hero page -> Sahneler -> Diploma -> Not -> Arka kapak

    // 3. HIKAYEMIZIN KAHRAMANI — AI bg (V2: unified backdrop + category-aware decor band)
    //    + gercek fotograflar (sharp ile frame+shadow komposit)
    this.sendSSE({ type: "step", message: "Kahraman sayfası üretiliyor..." });
    const heroPagePath = path.join(outputDir, "hero-page.png");
    let heroBgPath = null;
    try {
      const heroPrompt = coverArchitect.buildHeroPagePromptV2();
      heroBgPath = await retryWithBackoff(async () => {
        const heroResult = await sceneGenerator.generateBackground({
          prompt: heroPrompt, referenceImages: [], maxRetries: 2,
        });
        if (!heroResult.success || !heroResult.buffer) throw new Error("hero bg: no buffer");
        const p = path.join(outputDir, "hero-page-bg.png");
        fs.writeFileSync(p, heroResult.buffer);
        return p;
      }, { label: "hero-bg" });
      console.log("  [orchestrator] Hero page AI arka plan uretildi (V2)");
    } catch (err) {
      console.error("  [orchestrator] Hero AI arka plan basarisiz (retry sonrasi):", err.message);
      this.degradedPages.push({ page: "hero-bg", reason: err.message });
      heroBgPath = null;
    }

    // Composite step does not call AI — runs regardless so hero page still renders.
    try {
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
      console.error("  [orchestrator] Hero page komposit hatasi:", err.message);
      this.degradedPages.push({ page: "hero", reason: err.message });
    }

    // 4. ARKA KAPAK — UrunStudio coverAgent port (generateBackCover) kullanılıyor.
    // Masal listing ile tek kaynak: aynı layout, aynı kalite.
    // Boyama için bundle'daki specialPagePrompts.backCover kullanılır (coloring-book-writer).
    this.sendSSE({ type: "step", message: "Arka kapak üretiliyor..." });
    const backCoverPath = path.join(outputDir, "back-cover.png");
    try {
      await retryWithBackoff(async () => {
        const isBoyamaWithBundle = bookData.category === "boyama" && bookData.specialPagePrompts?.backCover;
        if (isBoyamaWithBundle) {
          const bcRefs = [];
          if (characterProfileRef) bcRefs.push(characterProfileRef);
          const coverFinalLocal = path.join(outputDir, "cover-final.png");
          if (fs.existsSync(coverFinalLocal)) bcRefs.push(coverFinalLocal);
          const bcLogoPath = path.join(__dirname, "..", "..", "assets", "brand", "masalsensin-logo.jpg");
          if (fs.existsSync(bcLogoPath)) bcRefs.push(bcLogoPath);
          const bcResult = await sceneGenerator.generateBackground({
            prompt: bookData.specialPagePrompts.backCover,
            referenceImages: bcRefs,
            maxRetries: 2,
          });
          if (!bcResult.success || !bcResult.buffer) throw new Error("boyama back-cover: no buffer");
          fs.writeFileSync(backCoverPath, bcResult.buffer);
          console.log("  [orchestrator] Arka kapak AI ile uretildi (boyama bundle)");
        } else {
          const { generateBackCover } = require("../urunstudio-port/coverAgent");
          const { buildFakeConcept, resolveCategory } = require("../urunstudio-port/masal-adapter");
          const stCat = resolveCategory(bookData.category);
          const fakeConcept = buildFakeConcept(bookData, { ...childInfo, childName });
          const coverFinalLocal = path.join(outputDir, "cover-final.png");
          const frontCoverDataUrl = fs.existsSync(coverFinalLocal)
            ? `data:image/png;base64,${fs.readFileSync(coverFinalLocal).toString("base64")}`
            : (characterProfileRef ? `data:image/png;base64,${fs.readFileSync(characterProfileRef).toString("base64")}` : null);
          if (!frontCoverDataUrl) throw new Error("no front cover or character profile for back-cover ref");
          const bcResult = await generateBackCover(fakeConcept, frontCoverDataUrl, stCat);
          if (!bcResult?.imageUrl) throw new Error("back-cover: no imageUrl from generateBackCover");
          const m = bcResult.imageUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
          if (!m) throw new Error("back-cover: invalid data url");
          fs.writeFileSync(backCoverPath, Buffer.from(m[1], "base64"));
          console.log("  [orchestrator] Arka kapak UrunStudio generateBackCover ile uretildi");
        }
      }, { label: "back-cover" });
    } catch (err) {
      console.error("  [orchestrator] Arka kapak AI basarisiz (retry sonrasi):", err.message);
      this.degradedPages.push({ page: "back-cover", reason: err.message });
      if (FORCE_CANVAS_FALLBACK) {
        try {
          await textRenderer.renderBackCoverPage({
            title: bookData.title, childName, description: bookData.description,
            lessons: bookData.lessons || [], theme, outputPath: backCoverPath,
          });
          console.log("  [orchestrator] Arka kapak SVG fallback kullanildi (FORCE_CANVAS_FALLBACK=1)");
        } catch (e2) { console.error("  [orchestrator] Arka kapak SVG fallback da basarisiz:", e2.message); }
      }
    }

    // 5. GONDEREN NOTU — Her zaman uret (senderName yoksa genel not)
    {
      // senderName yoksa varsayilan deger ata
      if (!childInfo.senderName) childInfo.senderName = "Ailen";
      console.log("  [orchestrator] Not icin senderName:", childInfo.senderName);
      const isBoyamaNote = bookData.category === "boyama";
      this.sendSSE({ type: "step", message: isBoyamaNote ? "Tamamlandı sertifikası üretiliyor..." : "Gönderen notu üretiliyor..." });
      try {
        await retryWithBackoff(async () => {
          const { generateNotePage } = require("../urunstudio-port/productVisualsAgent");
          const { buildFakeConcept, resolveCategory } = require("../urunstudio-port/masal-adapter");
          const stCat2 = resolveCategory(bookData.category);
          const fakeConcept2 = buildFakeConcept(bookData, { ...childInfo, childName });
          const snNoteResult = await generateNotePage(fakeConcept2, stCat2);
          if (!snNoteResult?.imageUrl) throw new Error("sender-note: no imageUrl from generateNotePage");
          const m = snNoteResult.imageUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
          if (!m) throw new Error("sender-note: invalid data url");
          fs.writeFileSync(path.join(outputDir, "sender-note.png"), Buffer.from(m[1], "base64"));
          console.log("  [orchestrator] Sender note UrunStudio generateNotePage ile uretildi");
        }, { label: "sender-note" });
      } catch (err) {
        console.error("  [orchestrator] Sender note AI basarisiz (retry sonrasi):", err.message);
        this.degradedPages.push({ page: "sender-note", reason: err.message });
        if (FORCE_CANVAS_FALLBACK) {
          try {
            await textRenderer.renderSenderNotePage({
              childName, senderName: childInfo.senderName || "",
              senderNote: childInfo.customMessage || "", theme,
              outputPath: path.join(outputDir, "sender-note.png"),
            });
            console.log("  [orchestrator] Sender note SVG fallback kullanildi (FORCE_CANVAS_FALLBACK=1)");
          } catch (e2) { console.error("  [orchestrator] Sender note SVG fallback da basarisiz:", e2.message); }
        }
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

          const ffPrompt = coverArchitect.buildFunFactPagePrompt(fact);
          const ffRefs = [];
          if (fs.existsSync(coverFinalPath)) ffRefs.push(coverFinalPath);
          await retryWithBackoff(async () => {
            const ffResult = await sceneGenerator.generateBackground({
              prompt: ffPrompt, referenceImages: ffRefs, maxRetries: 1,
            });
            if (!ffResult.success || !ffResult.buffer) throw new Error(`funfact ${placement.afterScene}: no buffer`);
            fs.writeFileSync(ffPath, ffResult.buffer);
            console.log(`  [orchestrator] FunFact ${placement.afterScene} AI ile uretildi (metin dahil)`);
          }, { label: `funfact-${placement.afterScene}` });
          funFactPages.push({ afterScene: placement.afterScene, png: ffPath });
        } catch (err) {
          console.error(`  [orchestrator] FunFact ${placement.afterScene} AI basarisiz (retry sonrasi):`, err.message);
          this.degradedPages.push({ page: `funfact-${placement.afterScene}`, reason: err.message });
          if (FORCE_CANVAS_FALLBACK) {
            try {
              const ffPath = path.join(outputDir, `funfact-after-${placement.afterScene}.png`);
              await textRenderer.renderFunFactPage({ funFact: fact, theme, outputPath: ffPath });
              funFactPages.push({ afterScene: placement.afterScene, png: ffPath });
              console.log(`  [orchestrator] FunFact ${placement.afterScene} SVG fallback (FORCE_CANVAS_FALLBACK=1)`);
            } catch (e2) {}
          }
        }
      }
    }

    // DIPLOMA / KATEGORI SERTIFIKASI — TUM KATEGORILER icin, not sayfasindan hemen once
    // Kategoriye gore baslik + semboller degisir (hayvan-dostum, gunluk-degerler, duygu-kontrolleri,
    // meslek, yeni-kardes, boyama, 23-nisan, bebek vb.)
    this.sendSSE({ type: "step", message: "Sertifika / diploma üretiliyor..." });
    const diplomaPath = path.join(outputDir, "diploma.png");
    let diplomaSuccess = false;
    try {
      const diplomaPrompt = coverArchitect.buildCategoryDiplomaPrompt();
      const diplomaRefs = [];
      if (fs.existsSync(coverFinalPath)) diplomaRefs.push(coverFinalPath);
      if (characterProfileRef) diplomaRefs.push(characterProfileRef);
      await retryWithBackoff(async () => {
        const diplomaResult = await sceneGenerator.generateBackground({
          prompt: diplomaPrompt, referenceImages: diplomaRefs, maxRetries: 2,
        });
        if (!diplomaResult.success || !diplomaResult.buffer) throw new Error("diploma: no buffer");
        fs.writeFileSync(diplomaPath, diplomaResult.buffer);
        diplomaSuccess = true;
        console.log("  [orchestrator] Kategori sertifikasi AI ile uretildi");
      }, { label: "diploma" });
    } catch (err) {
      console.error("  [orchestrator] Sertifika AI basarisiz (retry sonrasi):", err.message);
      this.degradedPages.push({ page: "diploma", reason: err.message });
    }

    // NOT: Kapanis (SON) sayfasi KALDIRILDI (kullanici konseptinde yok).

    // PDF olustur
    this.sendSSE({ type: "step", step: TOTAL_STEPS - 1, total: TOTAL_STEPS, message: "PDF olusturuluyor..." });
    console.log("  [orchestrator] PDF olusturuluyor...");
    const pdfBuilder = new PDFBuilder();
    const pdfPath = path.join(outputDir, "kitap.pdf");

    try {
      await pdfBuilder.build({
        pdfPath,
        title: bookData.title,
        childName,
        coverPNG: path.join(outputDir, "cover-final.png"),
        heroPagePNG: path.join(outputDir, "hero-page.png"),
        scenePages: finalScenePaths,
        funFactPages,
        senderNotePNG: fs.existsSync(path.join(outputDir, "sender-note.png")) ? path.join(outputDir, "sender-note.png") : null,
        diplomaPNG: (diplomaSuccess && diplomaPath && fs.existsSync(diplomaPath)) ? diplomaPath : null,
        backCoverPNG: path.join(outputDir, "back-cover.png"),
      });
      let finalPdfPath = pdfPath;
      if (this.degradedPages && this.degradedPages.length > 0) {
        const degradedPath = path.join(outputDir, "kitap-degraded.pdf");
        try {
          fs.renameSync(pdfPath, degradedPath);
          finalPdfPath = degradedPath;
        } catch (e) {
          console.error("  [orchestrator] PDF rename icin renameSync basarisiz:", e.message);
        }
        const failedJsonPath = path.join(outputDir, "pages-failed.json");
        fs.writeFileSync(failedJsonPath, JSON.stringify({
          bookId, childName, timestamp: new Date().toISOString(),
          failedPages: this.degradedPages,
          forceCanvasFallback: FORCE_CANVAS_FALLBACK,
        }, null, 2));
        this.sendSSE({
          type: "degraded",
          failedPages: this.degradedPages,
          pdfPath: `/output/${dirName}/${path.basename(finalPdfPath)}`,
          message: `Kitap degraded: ${this.degradedPages.length} sayfa AI ile uretilemedi (${this.degradedPages.map(p => p.page).join(", ")}).`,
        });
        console.warn(`  [orchestrator] KITAP DEGRADED: ${this.degradedPages.length} sayfa basarisiz — ${finalPdfPath}`);
      } else {
        this.sendSSE({ type: "pdf_ready", pdfPath: `/output/${dirName}/kitap.pdf`, message: "PDF hazir!" });
      }
      const pdfStat = fs.statSync(finalPdfPath);
      console.log(`  [orchestrator] PDF hazir: ${finalPdfPath} (${(pdfStat.size / 1024 / 1024).toFixed(1)} MB)`);
    } catch (err) {
      this.sendSSE({ type: "error", message: `PDF hatasi: ${err.message}` });
      console.error("  [orchestrator] PDF BASARISIZ:", err.message);
      console.error(err.stack);
    }

    // Tamamlandi
    const successCount = finalScenePaths.filter((s) => s.finalPNG).length;
    this.sendSSE({ type: "complete", outputDir: `/output/${dirName}`, pdfPath: `/output/${dirName}/kitap.pdf` });
    console.log(`  [orchestrator] KITAP TAMAMLANDI: ${successCount}/${sceneCount} sahne basarili`);

    return { success: true, outputDir, imageCount: successCount };
  }
}

module.exports = BookOrchestrator;
