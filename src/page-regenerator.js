/**
 * PageRegenerator — single-page regeneration for an existing book output.
 *
 * Used by: /api/regenerate-page (HTTP) and CLI scripts.
 *
 * Supported pageTypes:
 *   - cover         → cover-final.png
 *   - back-cover    → back-cover.png
 *   - hero          → hero-page.png (full composite with real photos)
 *   - hero-bg       → hero-page-bg.png (AI background only)
 *   - diploma       → diploma.png
 *   - sender-note   → sender-note.png
 *   - funfact       → funfact-after-{sceneNumber}.png (sceneNumber REQUIRED)
 *   - scene-illustration → scene-{NN}-illustration.png + scene-{NN}-final.png
 *   - scene-text    → scene-{NN}-text.png
 *
 * Each call: loads book.json + meta.json + existing refs (character-profile, outfit-grid, cover-final)
 * and regenerates JUST the requested page. Backs up previous version with .bak-{timestamp}.
 */

const fs = require("fs");
const path = require("path");
const CoverPromptArchitect = require("./agents/cover-prompt-architect");
const SceneGenerator = require("./agents/scene-generator");
const PromptArchitect = require("./agents/prompt-architect");

// Morphology helper (same as orchestrator — kept in sync)
function getVowelHarmony(name) {
  const vowels = (name || "").toLowerCase().match(/[aeıioöuü]/g) || ["a"];
  const last = vowels[vowels.length - 1];
  const narrow = { a:"ı", ı:"ı", e:"i", i:"i", o:"u", u:"u", ö:"ü", ü:"ü" }[last] || "ı";
  const wide   = { a:"a", ı:"a", e:"e", i:"e", o:"a", u:"a", ö:"e", ü:"e" }[last] || "a";
  const endsInVowel = /[aeıioöuü]$/i.test(name || "");
  return { narrow, wide, endsInVowel };
}
function regenerateTurkishSuffix(oldSuffix, newName) {
  const h = getVowelHarmony(newName);
  const bY = h.endsInVowel ? "y" : "";
  const bN = h.endsInVowel ? "n" : "";
  const s = (oldSuffix || "").toLowerCase();
  if (/^n?[ıiuü]n$/.test(s))    return bN + h.narrow + "n";
  if (/^l[ae]r$/.test(s))        return "l" + h.wide + "r";
  if (/^[dt][ae]n$/.test(s))     return "d" + h.wide + "n";
  if (/^[dt][ae]$/.test(s))      return "d" + h.wide;
  if (/^y?l[ae]$/.test(s))       return bY + "l" + h.wide;
  if (/^y?[ae]$/.test(s))        return bY + h.wide;
  if (/^y?[ıiuü]$/.test(s))      return bY + h.narrow;
  if (/^s?[ıiuü]$/.test(s))      return (h.endsInVowel ? "s" : "") + h.narrow;
  return oldSuffix;
}
function applyMorphologySubs(text, childName, templateHeroName) {
  if (typeof text !== "string") return text;
  let out = text;
  out = out.replace(/\{CHILD_NAME\}(['’]([a-zçğıöşüA-ZÇĞİÖŞÜ]+))?/g, (_m, apo, suf) => {
    if (!suf) return childName;
    return childName + apo + regenerateTurkishSuffix(suf, childName);
  });
  if (templateHeroName && templateHeroName !== childName) {
    const esc = templateHeroName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("\\b" + esc + "\\b(?:(['’])([a-zçğıöşüA-ZÇĞİÖŞÜ]+))?", "g");
    out = out.replace(re, (_m, apo, suf) => {
      if (!suf) return childName;
      return childName + apo + regenerateTurkishSuffix(suf, childName);
    });
  }
  return out;
}
function personalizeBookData(bookData, childName) {
  const templateHero = bookData.templateHeroName || bookData.heroName || null;
  const apply = (s) => applyMorphologySubs(s, childName, templateHero);
  if (bookData.title) bookData.title = apply(bookData.title);
  if (bookData.coverTitle) bookData.coverTitle = apply(bookData.coverTitle);
  if (bookData.description) bookData.description = apply(bookData.description);
  if (bookData.specialPagePrompts) {
    for (const k in bookData.specialPagePrompts) bookData.specialPagePrompts[k] = apply(bookData.specialPagePrompts[k]);
  }
  if (Array.isArray(bookData.scenes)) {
    for (const sc of bookData.scenes) {
      if (sc.title) sc.title = apply(sc.title);
      if (sc.text) sc.text = apply(sc.text);
      if (sc.prompt) sc.prompt = apply(sc.prompt);
    }
  }
  return bookData;
}

function backupFile(p) {
  if (!fs.existsSync(p)) return null;
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const bak = p + ".bak-" + ts;
  fs.copyFileSync(p, bak);
  return bak;
}

/**
 * Single-page regenerate.
 *
 * @param {object} opts
 * @param {string} opts.outputDir   - Absolute path to book output dir
 * @param {string} opts.bookId      - Book ID (to load book.json)
 * @param {string} opts.srcRoot     - Masal src root dir (for finding stories/)
 * @param {string} opts.assetsRoot  - Masal assets root (for brand logo)
 * @param {object} opts.meta        - meta.json contents: { childName, childGender, childAge, ... }
 * @param {object} opts.imageGen    - instantiated image generator (KIE/Google)
 * @param {string} opts.pageType    - one of the supported types
 * @param {number} [opts.sceneNumber] - 1-based scene number for scene-* / funfact
 * @param {string} [opts.customInstruction] - extra instruction appended to prompt
 * @param {object} [opts.childInfoExtra] - { senderName, giftSenderName, giftSenderRelation, ... }
 */
async function regeneratePage(opts) {
  const { outputDir, bookId, srcRoot, assetsRoot, meta, imageGen, pageType, sceneNumber, customInstruction, childInfoExtra } = opts;
  if (!fs.existsSync(outputDir)) throw new Error("Output directory not found: " + outputDir);

  const bookPath = path.join(srcRoot, "stories", bookId, "book.json");
  if (!fs.existsSync(bookPath)) throw new Error("Book not found: " + bookId);
  const bookData = personalizeBookData(JSON.parse(fs.readFileSync(bookPath, "utf-8")), meta.childName);

  const childInfo = {
    name: meta.childName,
    gender: meta.childGender || "kiz",
    age: meta.childAge || "5",
    senderName: (childInfoExtra && childInfoExtra.senderName) || meta.senderName || "",
    giftSenderName: (childInfoExtra && childInfoExtra.giftSenderName) || meta.giftSenderName || "",
    giftSenderRelation: (childInfoExtra && childInfoExtra.giftSenderRelation) || meta.giftSenderRelation || "",
  };

  const architect = new CoverPromptArchitect(bookData, childInfo);
  const sg = new SceneGenerator(imageGen);
  const promptArchitect = new PromptArchitect(bookData, childInfo);

  const characterProfileRef = path.join(outputDir, "character-profile.png");
  const outfitGridRef = path.join(outputDir, "outfit-grid.png");
  const coverFinalPath = path.join(outputDir, "cover-final.png");
  const logoPath = path.join(assetsRoot, "brand", "masalsensin-logo.jpg");

  const appendInstr = (p) => customInstruction ? (p + "\n\nEXTRA INSTRUCTION (user-provided): " + customInstruction) : p;

  switch (pageType) {
    case "cover": {
      // UrunStudio coverAgent — Masal listing ile tek kaynak (F1 iconic scene + F4 prefix strip).
      // Face ref: user'ın ORİJİNAL iPhone foto (child-photo.*) — 4-pose Pixar grid DEĞİL.
      const { generateCoverImage } = require("./urunstudio-port/coverAgent");
      const { buildFakeConcept, resolveCategory } = require("./urunstudio-port/masal-adapter");
      const stCat = resolveCategory(bookData.category);
      const childInfo = { age: meta.childAge, gender: meta.childGender, childName: meta.childName };
      const fakeConcept = buildFakeConcept(bookData, childInfo);
      let childPhotoForCover = null;
      for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
        const p = path.join(outputDir, "child-photo" + ext);
        if (fs.existsSync(p)) { childPhotoForCover = p; break; }
      }
      const faceRef = childPhotoForCover
        ? `data:image/${path.extname(childPhotoForCover).slice(1) || "jpeg"};base64,${fs.readFileSync(childPhotoForCover).toString("base64")}`
        : (fs.existsSync(characterProfileRef)
            ? `data:image/png;base64,${fs.readFileSync(characterProfileRef).toString("base64")}`
            : undefined);
      const out = path.join(outputDir, "cover-final.png");
      backupFile(out);
      const r = await generateCoverImage(stCat, fakeConcept, faceRef);
      if (!r?.imageUrl) throw new Error("cover gen failed: no imageUrl");
      const m = r.imageUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
      if (!m) throw new Error("cover gen failed: invalid data url");
      fs.writeFileSync(out, Buffer.from(m[1], "base64"));
      return { success: true, pagePath: out };
    }
    case "back-cover": {
      // UrunStudio generateBackCover — front cover referans, kazanım kartları.
      const { generateBackCover } = require("./urunstudio-port/coverAgent");
      const { buildFakeConcept, resolveCategory } = require("./urunstudio-port/masal-adapter");
      const stCat = resolveCategory(bookData.category);
      const childInfo = { age: meta.childAge, gender: meta.childGender, childName: meta.childName };
      const fakeConcept = buildFakeConcept(bookData, childInfo);
      const frontRef = fs.existsSync(coverFinalPath)
        ? `data:image/png;base64,${fs.readFileSync(coverFinalPath).toString("base64")}`
        : (fs.existsSync(characterProfileRef)
            ? `data:image/png;base64,${fs.readFileSync(characterProfileRef).toString("base64")}`
            : null);
      if (!frontRef) throw new Error("back-cover: no front cover or character profile reference");
      const out = path.join(outputDir, "back-cover.png");
      backupFile(out);
      const r = await generateBackCover(fakeConcept, frontRef, stCat);
      if (!r?.imageUrl) throw new Error("back-cover gen failed: no imageUrl");
      const m = r.imageUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
      if (!m) throw new Error("back-cover gen failed: invalid data url");
      fs.writeFileSync(out, Buffer.from(m[1], "base64"));
      return { success: true, pagePath: out };
    }
    case "hero-bg":
    case "hero": {
      // V2 unified backdrop + category-aware decor band.
      const prompt = appendInstr(architect.buildHeroPagePromptV2());
      const refs = []; // NO refs — cover ref biases KIE toward cover layout.
      const bgOut = path.join(outputDir, "hero-page-bg.png");
      backupFile(bgOut);
      const r = await sg.generateBackground({ prompt, referenceImages: refs, maxRetries: 2 });
      if (!r.success || !r.buffer) throw new Error("hero gen failed: " + (r.error || "unknown"));
      fs.writeFileSync(bgOut, r.buffer);

      // If pageType is "hero", also run full composite via text-page-renderer
      if (pageType === "hero") {
        const TextPageRenderer = require("./text-page-renderer");
        const renderer = new TextPageRenderer();
        const heroOut = path.join(outputDir, "hero-page.png");
        backupFile(heroOut);
        const childPhoto = fs.readdirSync(outputDir).find(f => /^child-photo\./i.test(f));
        const childPhotoPath = childPhoto ? path.join(outputDir, childPhoto) : null;
        // Extra photos — scan dir for extras if saved
        const extraPhotoPaths = fs.readdirSync(outputDir)
          .filter(f => /^extra-photo-\d+\./i.test(f))
          .map(f => path.join(outputDir, f));
        await renderer.renderHeroPage({
          childName: meta.childName,
          childPhotoPath,
          extraPhotoPaths,
          theme: bookData.theme || {},
          bookTitle: bookData.title || "",
          backgroundImagePath: bgOut,
          outputPath: heroOut,
        });
        return { success: true, pagePath: heroOut };
      }
      return { success: true, pagePath: bgOut, note: "hero-page-bg.png written; use pageType=hero for full composite" };
    }
    case "diploma": {
      const prompt = appendInstr(architect.buildCategoryDiplomaPrompt());
      const refs = [];
      if (fs.existsSync(coverFinalPath)) refs.push(coverFinalPath);
      if (fs.existsSync(characterProfileRef)) refs.push(characterProfileRef);
      const out = path.join(outputDir, "diploma.png");
      backupFile(out);
      const r = await sg.generateBackground({ prompt, referenceImages: refs, maxRetries: 2 });
      if (!r.success || !r.buffer) throw new Error("diploma gen failed: " + (r.error || "unknown"));
      fs.writeFileSync(out, r.buffer);
      return { success: true, pagePath: out };
    }
    case "sender-note": {
      // UrunStudio generateNotePage — Masal listing ile tek kaynak.
      const { generateNotePage } = require("./urunstudio-port/productVisualsAgent");
      const { buildFakeConcept, resolveCategory } = require("./urunstudio-port/masal-adapter");
      const stCat = resolveCategory(bookData.category);
      const childInfo = { age: meta.childAge, gender: meta.childGender, childName: meta.childName };
      const fakeConcept = buildFakeConcept(bookData, childInfo);
      const out = path.join(outputDir, "sender-note.png");
      backupFile(out);
      const r = await generateNotePage(fakeConcept, stCat);
      if (!r?.imageUrl) throw new Error("sender-note gen failed");
      const m = r.imageUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
      if (!m) throw new Error("sender-note: invalid data url");
      fs.writeFileSync(out, Buffer.from(m[1], "base64"));
      return { success: true, pagePath: out };
    }
    case "funfact": {
      if (!sceneNumber) throw new Error("sceneNumber required for funfact");
      const placement = (bookData.funFactPlacements || []).find(p => p.afterScene === sceneNumber);
      if (!placement) throw new Error("No funfact placement after scene " + sceneNumber);
      const fact = (bookData.funFacts || []).find(f => f.id === placement.factId);
      if (!fact) throw new Error("Fact not found: " + placement.factId);
      if (typeof architect.buildFunFactPagePrompt !== "function") throw new Error("buildFunFactPagePrompt missing in architect");
      const prompt = appendInstr(architect.buildFunFactPagePrompt(fact));
      const refs = [];
      if (fs.existsSync(coverFinalPath)) refs.push(coverFinalPath);
      const out = path.join(outputDir, `funfact-after-${sceneNumber}.png`);
      backupFile(out);
      const r = await sg.generateBackground({ prompt, referenceImages: refs, maxRetries: 2 });
      if (!r.success || !r.buffer) throw new Error("funfact gen failed: " + (r.error || "unknown"));
      fs.writeFileSync(out, r.buffer);
      return { success: true, pagePath: out };
    }
    case "scene-illustration": {
      if (!sceneNumber) throw new Error("sceneNumber required for scene-illustration");
      const scene = (bookData.scenes || []).find(s => s.sceneNumber === sceneNumber);
      if (!scene) throw new Error("Scene not found: " + sceneNumber);
      const outfitGridExists = fs.existsSync(outfitGridRef);
      const prompt = appendInstr(promptArchitect.buildScenePrompt(scene, { useProfile: true, useOutfitGrid: outfitGridExists }));
      const refs = [];
      if (fs.existsSync(characterProfileRef)) refs.push(characterProfileRef);
      if (outfitGridExists) refs.push(outfitGridRef);
      const pad = String(sceneNumber).padStart(2, "0");
      const illOut = path.join(outputDir, `scene-${pad}-illustration.png`);
      const finalOut = path.join(outputDir, `scene-${pad}-final.png`);
      backupFile(illOut);
      backupFile(finalOut);
      const r = await sg.generateBackground({ prompt, referenceImages: refs, maxRetries: 2 });
      if (!r.success || !r.buffer) throw new Error("scene gen failed: " + (r.error || "unknown"));
      fs.writeFileSync(illOut, r.buffer);
      fs.copyFileSync(illOut, finalOut);
      return { success: true, pagePath: finalOut };
    }
    case "scene-text": {
      if (!sceneNumber) throw new Error("sceneNumber required for scene-text");
      const scene = (bookData.scenes || []).find(s => s.sceneNumber === sceneNumber);
      if (!scene) throw new Error("Scene not found: " + sceneNumber);
      const pad = String(sceneNumber).padStart(2, "0");
      const finalPath = path.join(outputDir, `scene-${pad}-final.png`);
      let sceneOutfit = "";
      if (scene.prompt) {
        const m = scene.prompt.match(/wearing\s+([^,]+)/i);
        if (m) sceneOutfit = m[1].trim();
      }
      const prompt = appendInstr(architect.buildTextPagePrompt(
        { title: scene.title, text: scene.text, mood: scene.mood || "warm", setting: scene.setting || "" },
        { sceneOutfit, sceneAction: scene.title, setting: scene.setting || "" }
      ));
      const refs = [];
      if (fs.existsSync(characterProfileRef)) refs.push(characterProfileRef);
      if (fs.existsSync(outfitGridRef)) refs.push(outfitGridRef);
      if (fs.existsSync(finalPath)) refs.push(finalPath);
      const out = path.join(outputDir, `scene-${pad}-text.png`);
      backupFile(out);
      const r = await sg.generateBackground({ prompt, referenceImages: refs, maxRetries: 2 });
      if (!r.success || !r.buffer) throw new Error("scene-text gen failed: " + (r.error || "unknown"));
      fs.writeFileSync(out, r.buffer);
      return { success: true, pagePath: out };
    }
    default:
      throw new Error("Unsupported pageType: " + pageType);
  }
}

module.exports = { regeneratePage, applyMorphologySubs, personalizeBookData };
