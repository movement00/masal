/**
 * PromptArchitect Agent — v2.0 (Sinema Yonetmeni)
 *
 * Profesyonel gorsel yonetmen gibi calisir.
 * Kisa, etkili, sinema kalitesinde promptlar uretir.
 *
 * ILKE: book.json'daki sahne prompt'u YILDIZDIR.
 * PromptArchitect sadece referans baglami ve karakter tutarliligi ekler.
 * Gereksiz tekrar, uzun talimat ve "CRITICAL/MUST" spam'i YAPMAZ.
 *
 * Kullanilan veriler:
 *   - bookData.style              → Gorsel stil
 *   - bookData.characterDescription → Karakter tarifi
 *   - bookData.outfit             → Sabit kiyafet (varsa)
 *   - scene.prompt                → Sahne gorsel aciklamasi (EN ONEMLI)
 *   - scene.mood                  → Duygu yonlendirmesi
 *   - childInfo                   → Yas/cinsiyet/isim
 */

class PromptArchitect {
  /**
   * @param {object} bookData  - book.json icerigi
   * @param {object} childInfo - { name, gender, age }
   */
  constructor(bookData, childInfo) {
    this.bookData = bookData;
    this.childInfo = childInfo;
    this.genderDesc = childInfo.gender === "erkek" ? "boy" : "girl";
    this.ageDesc = `${childInfo.age}-year-old`;
    this.style =
      bookData.style ||
      "3D Pixar/Disney animated movie style, vibrant colors, warm cinematic lighting, subsurface scattering, high detail render quality";
  }

  // ══════════════════════════════════════════════════════════════
  // KARAKTER PROFILI PROMPT'U
  // ══════════════════════════════════════════════════════════════

  /**
   * Karakter profili promptu olusturur.
   * Herhangi bir sahne uretilmeden ONCE, cocugun 3D karakter versiyonunu
   * olusturmak icin kullanilir. Bu profil tum sahnelerde referans olacak.
   *
   * @returns {string}
   */
  buildCharacterProfilePrompt() {
    const parts = [];

    // Ana direktif — net ve guçlu
    parts.push(
      `Image 1 is a REAL PHOTO of a ${this.ageDesc} ${this.genderDesc}. ` +
        `Transform this child into a breathtaking 3D animated character for a children's picture book.`
    );
    parts.push("");

    // Stil — kitabin stili
    parts.push(`ART STYLE: ${this.style}`);
    parts.push("");

    // Karakter donusumu kurallari
    parts.push("CHARACTER TRANSFORMATION:");
    parts.push(
      "- Reproduce the child's EXACT facial geometry: face shape, eye shape/color/spacing, nose bridge, mouth, chin, jawline"
    );
    parts.push(
      "- Match skin tone, hair color, hair texture, hair length and hairstyle precisely"
    );
    parts.push(
      "- If the child wears GLASSES → 3D character MUST have identical style glasses"
    );
    parts.push(
      "- Preserve ALL accessories: headbands, hair clips, earrings, hearing aids"
    );

    // Karakter stili (book.json'dan)
    const charBase = this.bookData.characterDescription?.base;
    if (charBase) {
      parts.push(`- Character rendering: ${charBase}`);
    }

    // Sabit kiyafet (varsa — bazi kitaplarda outfit tanimli)
    const outfit = this.bookData.outfit;
    if (outfit && outfit.description) {
      let outfitDesc = outfit.description.replace(
        /\{CHILD_NAME\}/g,
        this.childInfo.name
      );
      parts.push(`- Wearing: ${outfitDesc}`);
    }

    parts.push("");

    // Kompozisyon — 4 açıdan turntable referans sayfası
    parts.push("COMPOSITION — CHARACTER TURNTABLE REFERENCE SHEET:");
    parts.push(
      "- Create a 2x2 grid showing the SAME character from 4 different angles on a single image"
    );
    parts.push(
      "- TOP-LEFT: Front view — full body, head to feet, facing the camera directly with a warm genuine smile"
    );
    parts.push(
      "- TOP-RIGHT: 3/4 view (three-quarter angle) — full body, slightly turned to the right, showing depth and dimension of the face and body"
    );
    parts.push(
      "- BOTTOM-LEFT: Side profile view — full body, facing left, showing the silhouette, nose profile, and hair from the side"
    );
    parts.push(
      "- BOTTOM-RIGHT: 3/4 back view — full body, turned away showing the back and hair from behind at a three-quarter angle, head slightly turned to show partial profile"
    );
    parts.push(
      "- All 4 poses: natural relaxed standing pose, same outfit, same proportions, same height, consistent lighting across all views"
    );
    parts.push(
      "- Each character fills ~80% of its grid cell, evenly spaced with thin dividing lines"
    );
    parts.push(
      "- Background: clean soft warm gradient (cream/light beige) behind each view, NO scenery, NO objects"
    );
    parts.push(
      "- Face well-lit, richly detailed with expressive eyes in every view where the face is visible"
    );
    parts.push("");

    // Amac
    parts.push(
      "PURPOSE: This is the MASTER CHARACTER TURNTABLE REFERENCE SHEET. " +
        "It shows the character from all key angles so every future scene maintains perfect consistency in appearance, proportions, and details from any camera angle."
    );

    return parts.join("\n");
  }

  // ══════════════════════════════════════════════════════════════
  // SAHNE PROMPT'U
  // ══════════════════════════════════════════════════════════════

  /**
   * Sahne icin tam prompt olusturur.
   *
   * Referans gorunum sirasi:
   *   Image 1: Cocuk fotografi (gercek foto — her zaman)
   *   Image 2: Karakter profili (varsa)
   *   Image 3: Onceki sahne (varsa)
   *
   * @param {object} scene   - { sceneNumber, prompt, mood, setting, ... }
   * @param {object} options - { isAnchor, hasCharacterProfile, hasPreviousScene }
   * @returns {string}
   */
  buildScenePrompt(scene, options = {}) {
    const parts = [];

    // ── Referans baglami (kisa, net, etkili) ──
    parts.push("IMAGE REFERENCES:");
    parts.push(
      "- Image 1: Real child photo → reproduce this exact face in 3D style"
    );

    if (options.hasOutfitProfile) {
      parts.push(
        "- Image 2: Outfit Character Reference → match this exact 3D character appearance AND outfit"
      );
    } else if (options.hasCharacterProfile) {
      parts.push(
        "- Image 2: 3D Character Profile → match this exact 3D appearance, proportions, and rendering quality"
      );
    }
    if (options.hasPreviousScene) {
      const n = (options.hasOutfitProfile || options.hasCharacterProfile) ? 3 : 2;
      parts.push(
        `- Image ${n}: Previous scene → maintain character look, outfit, and art style continuity`
      );
    }

    // Gozluk/aksesuar — TEK SATIR, etkili
    parts.push(
      "- RULE: If the child has glasses or accessories in the photo, they MUST appear in this scene"
    );
    parts.push("");

    // ── Sabit kiyafet (sadece tanimli kitaplarda) ──
    const outfit = this.bookData.outfit;
    if (outfit && outfit.description) {
      let outfitDesc = outfit.description.replace(
        /\{CHILD_NAME\}/g,
        this.childInfo.name
      );
      parts.push(`FIXED OUTFIT (same in every scene): ${outfitDesc}`);
      if (outfit.nameVisible && outfit.nameLocation) {
        const nameLocDesc = outfit.nameLocation.replace(
          /\{CHILD_NAME\}/g,
          this.childInfo.name
        );
        parts.push(`Name "${this.childInfo.name}" visible ${nameLocDesc}.`);
      }
      parts.push("");
    }

    // ── ANA SAHNE PROMPT'U (book.json'dan — en onemli kisim) ──
    // CHARACTER_DESC → gorsel karakter tarifi ile degistir
    // {CHILD_NAME} → cocugun gercek ismiyle degistir (forma, tabelalar vs.)
    const characterDesc = `a ${this.ageDesc} ${this.genderDesc} with the exact same face, hair, skin tone, and all accessories (including glasses if worn) as the child in the reference photo`;
    const processedPrompt = scene.prompt
      .replace(/CHARACTER_DESC/g, characterDesc)
      .replace(/\{CHILD_NAME\}/g, this.childInfo.name);
    parts.push(processedPrompt);

    // ── Yuz ifadesi (mood'dan turetilir) ──
    if (scene.mood) {
      const faceExpr = this._mapMoodToExpression(scene.mood);
      if (faceExpr) {
        parts.push("");
        parts.push(`FACIAL EXPRESSION: ${faceExpr}`);
      }
    }

    // ── Kompozisyon (tek satir) ──
    parts.push("");
    parts.push(
      "FRAMING: Place all characters and important action in the upper 65% of the image. " +
        "Keep the bottom 35% as simple ground/background for text overlay space."
    );

    return parts.join("\n");
  }

  // ══════════════════════════════════════════════════════════════
  // DUZELTME PROMPT'U
  // ══════════════════════════════════════════════════════════════

  /**
   * Validasyon basarisiz oldugunda duzeltme prompt'u olusturur.
   *
   * @param {object} scene            - Orijinal sahne verisi
   * @param {object} promptOptions    - buildScenePrompt icin options
   * @param {object} validationResult - QualityValidator sonucu
   * @returns {string}
   */
  buildCorrectionPrompt(scene, promptOptions, validationResult) {
    const parts = [];

    // Temel prompt
    const basePrompt = this.buildScenePrompt(scene, promptOptions);
    parts.push(basePrompt);
    parts.push("");

    // Duzeltme talimatlari — kisa ve spesifik
    parts.push("=== CORRECTION — FIX THESE SPECIFIC ISSUES ===");

    const checks = validationResult.checks || {};

    if (checks.outfitConsistency && checks.outfitConsistency.score < 70) {
      parts.push(
        `OUTFIT (${checks.outfitConsistency.score}/100): ${checks.outfitConsistency.feedback}`
      );
    }

    if (checks.styleQuality && checks.styleQuality.score < 65) {
      parts.push(
        `STYLE (${checks.styleQuality.score}/100): ${checks.styleQuality.feedback}`
      );
    }

    if (checks.sceneAccuracy && checks.sceneAccuracy.score < 60) {
      parts.push(
        `SCENE (${checks.sceneAccuracy.score}/100): ${checks.sceneAccuracy.feedback}`
      );
    }

    if (checks.compositionRule && checks.compositionRule.score < 50) {
      parts.push(
        `COMPOSITION (${checks.compositionRule.score}/100): ${checks.compositionRule.feedback}`
      );
    }

    if (checks.faceConsistency && checks.faceConsistency.score < 60) {
      parts.push(
        `FACE (${checks.faceConsistency.score}/100): ${checks.faceConsistency.feedback}`
      );
      parts.push(
        "  → Character face MUST match the reference photo. Highest priority fix."
      );
    }

    parts.push("");
    parts.push(
      "Generate an IMPROVED version fixing ALL issues above while maintaining everything that was correct."
    );

    return parts.join("\n");
  }

  // ══════════════════════════════════════════════════════════════
  // KIYAFET PROFILI SISTEMI
  // ══════════════════════════════════════════════════════════════

  /**
   * Sahne prompt'undan kiyafet tarifini cikarir.
   * Pattern: "wearing [KIYAFET], [aksiyon fiili]"
   *
   * @param {string} prompt - Sahne prompt'u
   * @returns {string|null}
   */
  extractSceneOutfit(prompt) {
    const text = prompt.replace(/CHARACTER_DESC\s*/i, "");

    // "wearing" veya "in the/a" ile basliyor
    let outfitStart = -1;
    const wearIdx = text.toLowerCase().indexOf("wearing ");
    if (wearIdx >= 0) {
      outfitStart = wearIdx + 8;
    } else {
      const inTheIdx = text.toLowerCase().indexOf("in the ");
      if (inTheIdx >= 0 && inTheIdx < 20) outfitStart = inTheIdx;
      else {
        const inAIdx = text.toLowerCase().indexOf("in a ");
        if (inAIdx >= 0 && inAIdx < 20) outfitStart = inAIdx;
      }
    }
    if (outfitStart < 0) return null;

    const afterOutfit = text.substring(outfitStart);

    // Kiyafet tarifi, aksiyon fiili ile biter
    const actionPattern =
      /,\s*(?:standing|sitting|walking|running|captured|playing|practicing|making|dribbling|facing|performing|mid-jump|in the middle of|on the center|as the (?:clear|undeniable)|at the (?:entrance|free)|near the|directly in|curiously toward|mouth open|now with|completely still|with both hands|arms raised|the (?:entire|jersey|ball))/i;

    const match = afterOutfit.match(actionPattern);
    if (match) {
      return afterOutfit.substring(0, match.index).trim();
    }

    // Fallback: ilk 150 karakter
    return afterOutfit.substring(0, 150).trim();
  }

  /**
   * Kitaptaki benzersiz kiyafetleri gruplar.
   * Her sahnenin outfitId alanina bakar.
   * outfitId yoksa veya global outfit tanimliysa bos dizi doner.
   *
   * @returns {Array<{outfitId: string, description: string, sceneNumbers: number[]}>}
   */
  getUniqueOutfits() {
    const scenes = this.bookData.scenes;
    if (!scenes) return [];

    // Global outfit varsa kiyafet profili sistemi gereksiz
    if (this.bookData.outfit && this.bookData.outfit.description) return [];

    // outfitId olan sahne var mi?
    const hasOutfitIds = scenes.some((s) => s.outfitId);
    if (!hasOutfitIds) return [];

    // outfitId'ye gore grupla
    const groups = new Map();
    for (const scene of scenes) {
      const id = scene.outfitId;
      if (!id) continue;

      if (!groups.has(id)) {
        // Ilk sahnenin prompt'undan kiyafet tarifini cikart
        const desc = this.extractSceneOutfit(scene.prompt) || id;
        groups.set(id, {
          outfitId: id,
          description: desc,
          sceneNumbers: [scene.sceneNumber],
        });
      } else {
        groups.get(id).sceneNumbers.push(scene.sceneNumber);
      }
    }

    return Array.from(groups.values());
  }

  /**
   * Kiyafet-bazli karakter profili prompt'u olusturur.
   * Cocuk foto (Image 1) + master karakter profili (Image 2) referans alinir.
   *
   * @param {string} outfitDescription - Kiyafet tarifi
   * @returns {string}
   */
  buildOutfitProfilePrompt(outfitDescription) {
    const parts = [];

    // {CHILD_NAME} varsa cocugun ismiyle degistir
    const resolvedOutfit = outfitDescription.replace(
      /\{CHILD_NAME\}/g,
      this.childInfo.name
    );

    parts.push(
      `Image 1 is a REAL PHOTO of a ${this.ageDesc} ${this.genderDesc}. ` +
        `Image 2 is the 3D CHARACTER PROFILE of this same child.`
    );
    parts.push("");
    parts.push(
      `Create a full body 3D character portrait of this exact character wearing: ${resolvedOutfit}`
    );
    parts.push("");
    parts.push(`ART STYLE: ${this.style}`);
    parts.push("");
    parts.push(
      "CHARACTER: Match Image 2 exactly — same face, same hair, same proportions, same 3D rendering quality."
    );
    parts.push(
      "OUTFIT: Render with photorealistic fabric wrinkles, accurate colors and patterns, proper fit on the character body."
    );
    parts.push(
      "If the child wears GLASSES in Image 1 → character MUST have identical glasses."
    );
    parts.push("");
    parts.push("COMPOSITION:");
    parts.push("- Full body portrait, head to feet visible");
    parts.push("- Front-facing, natural standing pose with a warm smile");
    parts.push("- Character centered, filling ~70% of the frame");
    parts.push(
      "- Clean soft warm gradient background (cream/light beige), NO scenery, NO objects"
    );
    parts.push("");
    parts.push(
      "PURPOSE: This is the OUTFIT REFERENCE for scenes where this character wears this specific clothing."
    );

    return parts.join("\n");
  }

  /**
   * Tum kiyafetleri tek bir izgara gorselinde birlestiren prompt olusturur.
   * 5 kiyafet icin 2x3 (veya 3x2) grid, her hucrede farkli kiyafetle ayni karakter.
   * Bu sayede 5 ayri gorsel yerine tek gorsel uretilir → kredi tasarrufu.
   *
   * @param {Array<{outfitId: string, description: string}>} outfits
   * @returns {string}
   */
  buildCombinedOutfitGridPrompt(outfits) {
    const parts = [];

    // {CHILD_NAME} cikar
    const resolvedOutfits = outfits.map((o) => ({
      ...o,
      description: o.description.replace(/\{CHILD_NAME\}/g, this.childInfo.name),
    }));

    parts.push(
      `Image 1 is a REAL PHOTO of a ${this.ageDesc} ${this.genderDesc}. ` +
        `Image 2 is the 3D CHARACTER TURNTABLE PROFILE of this same child.`
    );
    parts.push("");
    parts.push(
      `Create a single OUTFIT REFERENCE GRID IMAGE showing the SAME 3D character in ${resolvedOutfits.length} DIFFERENT OUTFITS arranged in a clean grid layout.`
    );
    parts.push("");
    parts.push(`ART STYLE: ${this.style}`);
    parts.push("");
    parts.push(
      "CHARACTER: Match Image 2 exactly — same face, same hair, same proportions, same 3D rendering quality in EVERY grid cell."
    );
    parts.push(
      "If the child wears GLASSES in Image 1 → character MUST have identical glasses in every cell."
    );
    parts.push("");

    // Grid layout tanimla
    const count = resolvedOutfits.length;
    let gridDesc;
    if (count <= 4) gridDesc = "2x2 grid (2 columns, 2 rows)";
    else if (count <= 6) gridDesc = "3x2 grid (3 columns, 2 rows)";
    else gridDesc = "4x2 grid (4 columns, 2 rows)";

    parts.push(`GRID LAYOUT: ${gridDesc} with clear thin white dividing lines between cells.`);
    parts.push("");

    // Her kiyafeti konumuyla tanimla
    const positions = [
      "TOP-LEFT", "TOP-CENTER", "TOP-RIGHT",
      "BOTTOM-LEFT", "BOTTOM-CENTER", "BOTTOM-RIGHT",
      "ROW3-LEFT", "ROW3-CENTER",
    ];

    parts.push("OUTFITS IN GRID (each cell shows full body, head to feet, front-facing, natural standing pose):");
    for (let i = 0; i < resolvedOutfits.length; i++) {
      const pos = positions[i] || `CELL-${i + 1}`;
      const outfit = resolvedOutfits[i];
      parts.push(`- ${pos} [${outfit.outfitId}]: wearing ${outfit.description}`);
    }
    parts.push("");

    parts.push("COMPOSITION RULES:");
    parts.push("- Each character fills ~85% of its grid cell height");
    parts.push("- All characters same size, same proportions, evenly spaced");
    parts.push("- Clean soft warm gradient background (cream/light beige) in every cell");
    parts.push("- NO scenery, NO objects — only the character in different outfits");
    parts.push("- Each outfit rendered with photorealistic fabric wrinkles, accurate colors and patterns");
    parts.push("- Small label text below each cell showing the outfit name is optional");
    parts.push("");
    parts.push(
      "PURPOSE: This is the MASTER OUTFIT REFERENCE SHEET. " +
        "One single image showing all costume changes for this character throughout the book. " +
        "Each scene will reference this grid to maintain outfit consistency."
    );

    return parts.join("\n");
  }

  // ══════════════════════════════════════════════════════════════
  // MOOD → YÜZ İFADESİ
  // ══════════════════════════════════════════════════════════════

  /**
   * Mood string'ini sinematik yuz ifadesi tarifine donusturur.
   * @param {string} mood
   * @returns {string|null}
   */
  _mapMoodToExpression(mood) {
    if (!mood) return null;
    const m = mood.toLowerCase();

    const expressionMap = {
      dreamy:
        "soft gentle smile, eyes gazing slightly upward with wonder, peaceful serene face",
      "nervous-excited":
        "wide eyes with visible anticipation, lips pressed together, a charming mix of worry and determination",
      joyful:
        "radiant beaming smile showing teeth, sparkling eyes full of happiness, cheeks lifted high",
      mysterious:
        "wide curious eyes, slightly parted lips in awe, head tilted forward with fascination",
      magical:
        "serene peaceful expression, eyes softly closed or half-lidded, subtle ethereal smile",
      "magical-epic":
        "eyes blown wide in absolute amazement, mouth open in stunned wonder, face lit up with overwhelming awe",
      determined:
        "intense focused eyes, firm jaw, concentrated gaze, slight furrowed brow showing raw effort",
      reflective:
        "thoughtful calm expression, eyes gazing to the side, gentle knowing smile",
      triumphant:
        "huge victorious grin, shining proud eyes, chin up with supreme confidence",
      "triumphant-emotional":
        "enormous ecstatic beaming smile, bright sparkling eyes full of pride and pure happiness, radiating joy and triumph",
      inspirational:
        "bright hopeful eyes looking upward, warm genuine smile radiating pure admiration",
      intense:
        "sharp focused eyes, confident competitive smile, sweat on forehead, total athletic tunnel-vision focus",
      climactic:
        "eyes closed in deep meditation, calm steady focused face before the defining moment, serene inner confidence",
      curious:
        "tilted head, raised eyebrows, eager bright eyes full of questions",
      excited:
        "bouncing energy, huge open smile, eyes wide and bright with pure enthusiasm",
      sad: "downturned mouth corners, glistening watery eyes, slumped shoulders",
      scared:
        "wide fearful eyes, tight pressed lips, slightly pulled back posture",
      proud:
        "chin lifted, confident satisfied smile, shoulders squared back, eyes bright with quiet achievement",
    };

    // Dogrudan eslesme
    if (expressionMap[m]) return expressionMap[m];

    // Parcali eslesme
    for (const [key, expr] of Object.entries(expressionMap)) {
      if (m.includes(key) || key.includes(m)) return expr;
    }

    return null;
  }
}

module.exports = PromptArchitect;
