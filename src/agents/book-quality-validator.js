/**
 * BookQualityValidator - Kitap Kalite Kontrolcusu
 *
 * book.json dosyalarini uretim ONCESINDE kontrol eder ve sorunlari raporlar/duzeltir.
 * Bu validator, scene prompt'larinin gorsel AI tarafindan dogru islenmesini saglar.
 *
 * Kontrol Kategorileri:
 * 1. CHARACTER_DESC — Karakter kisisellestirilmesi
 * 2. Kamera acisi cesitliligi
 * 3. Style suffix tutarliligi
 * 4. Outfit tutarliligi
 * 5. Prompt teknik kalitesi (Turkce karakter, uzunluk)
 * 6. Metin-prompt uyumu
 * 7. Mantik/fizik kontrolleri
 * 8. Turkce metin kalitesi (diacritik)
 */

class BookQualityValidator {
  constructor(bookData, options = {}) {
    this.book = bookData;
    this.scenes = bookData.scenes || [];
    this.autoFix = options.autoFix !== false; // Varsayilan: otomatik duzelt
    this.strict = options.strict || false; // Katı mod: uyarilar da hata sayilir
    this.issues = [];
    this.fixes = [];
  }

  /**
   * Tum kontrolleri calistir
   * @returns {object} {valid, issues, fixes, fixedBook}
   */
  validate() {
    this.issues = [];
    this.fixes = [];

    this._checkCharacterDesc();
    this._checkCameraAngles();
    this._checkStyleSuffix();
    this._checkOutfitConsistency();
    this._checkPromptTechnical();
    this._checkTextQuality();
    this._checkLogicPhysics();
    this._checkCoverSpecialPrompts();

    const errors = this.issues.filter(i => i.severity === "error");
    const warnings = this.issues.filter(i => i.severity === "warning");

    return {
      valid: errors.length === 0 && (!this.strict || warnings.length === 0),
      errors: errors.length,
      warnings: warnings.length,
      issues: this.issues,
      fixes: this.fixes,
      fixedBook: this.autoFix ? this.book : null,
    };
  }

  // =====================================================
  // 1. CHARACTER_DESC KONTROLU
  // =====================================================
  _checkCharacterDesc() {
    const isAnimalStory = this._isAnimalStory();
    const isColoringBook = (this.book.id || "").includes("boyama");

    for (const scene of this.scenes) {
      const prompt = scene.prompt || "";

      // Hayvan/boyama hikayeleri icin CHARACTER_DESC gerekmez
      if (isAnimalStory || isColoringBook) continue;

      if (!prompt.startsWith("CHARACTER_DESC")) {
        this._addIssue("error", "character_desc_missing", scene.sceneNumber,
          `Sahne ${scene.sceneNumber}: prompt CHARACTER_DESC ile baslamiyor. Kisisellestirilme calismaz.`,
          () => {
            // Otomatik duzeltme: basta CHARACTER_DESC ekle
            scene.prompt = "CHARACTER_DESC " + prompt;
            return `Sahne ${scene.sceneNumber}: CHARACTER_DESC eklendi`;
          }
        );
      }
    }

    // Cover prompt kontrolu
    const coverPrompt = this.book.coverPrompt || "";
    if (!isAnimalStory && !isColoringBook && !coverPrompt.startsWith("CHARACTER_DESC")) {
      this._addIssue("warning", "cover_character_desc", 0,
        "coverPrompt CHARACTER_DESC ile baslamiyor."
      );
    }
  }

  // =====================================================
  // 2. KAMERA ACISI CESITLILIGI
  // =====================================================
  _checkCameraAngles() {
    const cameraPattern = /CAMERA\s+(LOW|HIGH|FROM|BEHIND|CLOSE|WIDE|OVERHEAD|TRACKING|AT\s+EYE|AT\s+PITCH|AT\s+COURT|POV|DYNAMIC|MEDIUM)/i;
    const scenesWithoutCamera = [];
    const usedAngles = [];

    for (const scene of this.scenes) {
      const prompt = scene.prompt || "";
      const match = prompt.match(cameraPattern);

      if (!match) {
        scenesWithoutCamera.push(scene.sceneNumber);
      } else {
        usedAngles.push({ scene: scene.sceneNumber, angle: match[0] });
      }
    }

    if (scenesWithoutCamera.length > 0) {
      this._addIssue(
        scenesWithoutCamera.length > this.scenes.length / 2 ? "error" : "warning",
        "camera_missing",
        0,
        `${scenesWithoutCamera.length}/${this.scenes.length} sahnede kamera acisi yok: [${scenesWithoutCamera.join(", ")}]. Gorsel monotonluk riski.`,
        () => {
          // Otomatik duzeltme: eksik sahnelere varsayilan kamera acisi ekle
          const defaultAngles = [
            "CAMERA FROM BEHIND looking over the shoulder",
            "CAMERA LOW ANGLE from ground level looking slightly upward",
            "CAMERA FROM THE SIDE at a dynamic three-quarter angle",
            "CAMERA WIDE ESTABLISHING SHOT",
            "CAMERA CLOSE-UP focusing on face and upper body",
            "CAMERA HIGH ANGLE from slightly above",
            "CAMERA FROM FRONT LOW ANGLE looking up",
            "CAMERA AT EYE LEVEL from slight diagonal",
            "CAMERA TRACKING from behind following the character",
            "CAMERA OVERHEAD looking down",
          ];
          let angleIdx = 0;
          const fixedScenes = [];
          for (const sceneNum of scenesWithoutCamera) {
            const scene = this.scenes.find(s => s.sceneNumber === sceneNum);
            if (scene) {
              const angle = defaultAngles[angleIdx % defaultAngles.length];
              // Mood'a gore daha iyi aci secimi
              const bestAngle = this._selectAngleForMood(scene.mood, angleIdx);
              // CHARACTER_DESC'den sonra ekle
              if (scene.prompt.startsWith("CHARACTER_DESC")) {
                scene.prompt = scene.prompt.replace(
                  "CHARACTER_DESC",
                  "CHARACTER_DESC " + bestAngle + ","
                );
              } else {
                scene.prompt = bestAngle + ", " + scene.prompt;
              }
              fixedScenes.push(sceneNum);
              angleIdx++;
            }
          }
          return `Sahnelere kamera acisi eklendi: [${fixedScenes.join(", ")}]`;
        }
      );
    }

    // Ardisik ayni aci kontrolu
    for (let i = 1; i < usedAngles.length; i++) {
      if (usedAngles[i].angle === usedAngles[i - 1].angle) {
        this._addIssue("warning", "camera_repetition", usedAngles[i].scene,
          `Sahne ${usedAngles[i - 1].scene} ve ${usedAngles[i].scene} ayni kamera acisini kullaniyor: "${usedAngles[i].angle}"`
        );
      }
    }
  }

  // =====================================================
  // 3. STYLE SUFFIX TUTARLILIGI
  // =====================================================
  _checkStyleSuffix() {
    const bookStyle = this.book.style || "";
    const isStandardStyle = bookStyle.includes("Ice Age") || bookStyle.includes("3D CGI");
    const isWatercolor = bookStyle.includes("watercolor");
    const isPopArt = bookStyle.includes("pop art");

    // Ozel stil kullanan hikayeler icin farkli suffix kabul et
    if (isWatercolor || isPopArt) return;

    const expectedSuffix = "Ice Age and Shrek style 3D CGI animation";

    for (const scene of this.scenes) {
      const prompt = scene.prompt || "";
      if (!prompt.includes(expectedSuffix) && !prompt.includes("Ice Age") && !prompt.includes("Shrek")) {
        this._addIssue("warning", "style_suffix_missing", scene.sceneNumber,
          `Sahne ${scene.sceneNumber}: "Ice Age and Shrek style" suffix eksik.`,
          () => {
            // Sondaki "3D Pixar animated movie style..." yerine dogru suffix koy
            const pixarPattern = /3D Pixar animated movie style[^"]*$/;
            if (pixarPattern.test(scene.prompt)) {
              scene.prompt = scene.prompt.replace(pixarPattern,
                "Ice Age and Shrek style 3D CGI animation with exaggerated cute proportions, hyper-detailed textures, subsurface skin scattering, volumetric lighting, vibrant warm color palette, cinematic composition, Disney Pixar render quality"
              );
            } else {
              scene.prompt += ", Ice Age and Shrek style 3D CGI animation with exaggerated cute proportions, hyper-detailed textures, volumetric lighting, cinematic composition, Disney Pixar render quality";
            }
            return `Sahne ${scene.sceneNumber}: style suffix duzeltildi`;
          }
        );
      }
    }
  }

  // =====================================================
  // 4. OUTFIT TUTARLILIGI
  // =====================================================
  _checkOutfitConsistency() {
    if (this._isAnimalStory()) return;

    const outfit = this.book.outfit;
    const charDesc = this.book.characterDescription;
    const hasOutfitDef = outfit && outfit.description;
    const hasOutfitNotes = charDesc && charDesc.notes;

    // outfitId kontrolu
    const scenesWithoutOutfitId = this.scenes.filter(s => !s.outfitId);
    if (scenesWithoutOutfitId.length > 0 && hasOutfitNotes) {
      this._addIssue("warning", "outfit_id_missing", 0,
        `${scenesWithoutOutfitId.length} sahnede outfitId eksik. Kiyafet gruplama sistemi calismaz.`
      );
    }

    // Outfit tanimi varsa prompt'ta gecmeli
    if (hasOutfitDef) {
      for (const scene of this.scenes) {
        const prompt = (scene.prompt || "").toLowerCase();
        const outfitKeyword = outfit.description.split(" ").slice(1, 4).join(" ").toLowerCase();
        if (!prompt.includes("wearing") && !prompt.includes(outfitKeyword)) {
          this._addIssue("warning", "outfit_not_in_prompt", scene.sceneNumber,
            `Sahne ${scene.sceneNumber}: Outfit tanimi var ama prompt'ta kiyafet tarifi yok. AI her sahnede farkli kiyafet uretir.`
          );
        }
      }
    }
  }

  // =====================================================
  // 5. PROMPT TEKNIK KALITESI
  // =====================================================
  _checkPromptTechnical() {
    const turkishChars = /[şçğüöıİŞÇĞÜÖ]/;

    for (const scene of this.scenes) {
      const prompt = scene.prompt || "";

      // Turkce karakter kontrolu (prompt'ta olmamali)
      if (turkishChars.test(prompt)) {
        // {CHILD_NAME} icindeki Turkce harfler kabul edilebilir
        const cleanPrompt = prompt.replace(/\{CHILD_NAME\}/g, "");
        if (turkishChars.test(cleanPrompt)) {
          this._addIssue("warning", "turkish_in_prompt", scene.sceneNumber,
            `Sahne ${scene.sceneNumber}: prompt icinde Turkce karakter var. Gorsel AI karistirabilir.`
          );
        }
      }

      // Prompt uzunlugu kontrolu
      const wordCount = prompt.split(/\s+/).length;
      if (wordCount < 50) {
        this._addIssue("warning", "prompt_too_short", scene.sceneNumber,
          `Sahne ${scene.sceneNumber}: prompt cok kisa (${wordCount} kelime). Detaysiz gorsel uretilir. Min 100 kelime onerilir.`
        );
      }
      if (wordCount > 500) {
        this._addIssue("warning", "prompt_too_long", scene.sceneNumber,
          `Sahne ${scene.sceneNumber}: prompt cok uzun (${wordCount} kelime). Token israfi. Max 350 kelime onerilir.`
        );
      }

      // 3D'de calismayan kavramlar
      if (/thought bubble/i.test(prompt)) {
        this._addIssue("error", "thought_bubble_3d", scene.sceneNumber,
          `Sahne ${scene.sceneNumber}: "thought bubble" 3D CGI'da calismaz. "magical glowing orb" veya "translucent flashback vision" kullanin.`,
          () => {
            scene.prompt = scene.prompt.replace(
              /thought bubble[s]?\s*(showing|with|containing)/gi,
              "magical glowing crystal orb $1"
            );
            return `Sahne ${scene.sceneNumber}: thought bubble -> crystal orb`;
          }
        );
      }
    }
  }

  // =====================================================
  // 6. METIN KALITESI (TURKCE DIACRITIK)
  // =====================================================
  _checkTextQuality() {
    const turkishChars = /[şçğüöıİŞÇĞÜÖ]/;

    for (const scene of this.scenes) {
      const text = scene.text || "";

      // Turkce diacritik kontrolu — metin Turkce ise ozel karakter icermeli
      if (text.length > 50 && !turkishChars.test(text)) {
        this._addIssue("error", "text_missing_diacritics", scene.sceneNumber,
          `Sahne ${scene.sceneNumber}: Turkce metin diacritik karakter icermiyor (s,c,g,u,o,i yerine ş,ç,ğ,ü,ö,ı olmali). Metin sayfalarinda yanlis karakterler cikacak.`
        );
      }

      // Yazi hatalari — cift karakter
      const doubleLetterPattern = /([a-zşçğüöı])\1{2,}/gi;
      const doubles = text.match(doubleLetterPattern);
      if (doubles) {
        this._addIssue("warning", "text_double_chars", scene.sceneNumber,
          `Sahne ${scene.sceneNumber}: Olasi yazi hatasi — ust uste tekrarlanan harfler: ${doubles.join(", ")}`
        );
      }

      // Bosluk hatalari
      if (/\w\s{2,}\w/.test(text)) {
        this._addIssue("warning", "text_double_space", scene.sceneNumber,
          `Sahne ${scene.sceneNumber}: Metinde cift bosluk var.`
        );
      }
    }
  }

  // =====================================================
  // 7. MANTIK / FIZIK KONTROLLERI
  // =====================================================
  _checkLogicPhysics() {
    for (const scene of this.scenes) {
      const prompt = scene.prompt || "";
      const text = scene.text || "";
      const mood = scene.mood || "";

      // Duygu uyumu kontrolu — metin uzgun ama prompt mutlu
      const sadTextKeywords = /üzül|ağla|kork|yapayalnız|yalnız|düştü|kaybetti|hüzün/i;
      const happyPromptKeywords = /biggest happiest smile|jumping with joy|celebrating|triumphant/i;

      if (sadTextKeywords.test(text) && happyPromptKeywords.test(prompt)) {
        this._addIssue("warning", "mood_mismatch", scene.sceneNumber,
          `Sahne ${scene.sceneNumber}: Metin uzgun/korkulu ama prompt mutlu/kutlama iceriyor. Duygu uyumsuzlugu.`
        );
      }

      // Top/kale yonu — kale sahnelerinde net yon belirtilmeli
      if (/goal|net|basket|hoop/i.test(prompt) && /hit|enter|score|slam/i.test(prompt)) {
        if (!/behind|front|from|toward|into|through/i.test(prompt)) {
          this._addIssue("warning", "ball_direction_unclear", scene.sceneNumber,
            `Sahne ${scene.sceneNumber}: Top/kale sahnesi ama yon belirsiz. AI topu tersten gosterebilir. Kamera acisi ve top yonu net belirtilmeli.`
          );
        }
      }
    }
  }

  // =====================================================
  // 8. COVER / SPECIAL PROMPT KONTROLLERI
  // =====================================================
  _checkCoverSpecialPrompts() {
    const specialPrompts = this.book.specialPagePrompts || {};
    const bookId = this.book.id || "";

    // Cover prompt var mi?
    if (!this.book.coverPrompt) {
      this._addIssue("error", "cover_missing", 0, "coverPrompt eksik.");
    }

    // Tema-mekan uyumu — cover/special prompt'lar hikaye mekanina uygun mu?
    const allSpecialText = [
      this.book.coverPrompt || "",
      specialPrompts.heroPage || "",
      specialPrompts.funFactBg || "",
      specialPrompts.senderNoteBg || "",
      specialPrompts.backCover || "",
    ].join(" ").toLowerCase();

    // Jungle/tropical kontrolu — cogu hikaye icin yanlis
    if (allSpecialText.includes("jungle") && !bookId.includes("jungle") && !bookId.includes("safari")) {
      this._addIssue("error", "setting_mismatch", 0,
        "Cover/special prompt'larda 'jungle' referansi var ama hikaye orman/safari hikayesi degil. Mekan uyumsuzlugu."
      );
    }
  }

  // =====================================================
  // YARDIMCI FONKSIYONLAR
  // =====================================================

  _isAnimalStory() {
    const charType = this.book.characterType || "";
    const charDesc = this.book.characterDescription;
    if (charType === "animal") return true;
    // Tractor, raindrop gibi insan olmayan ana karakterler
    if (charDesc && charDesc.base && !charDesc.base.includes("child")) return true;
    return false;
  }

  _selectAngleForMood(mood, index) {
    const moodAngles = {
      "dreamy": "CAMERA FROM BEHIND looking over the shoulder",
      "hopeful": "CAMERA FROM BEHIND looking over the shoulder",
      "nervous": "CAMERA LOW ANGLE from ground level looking slightly upward",
      "nervous-excited": "CAMERA LOW ANGLE from ground level looking slightly upward",
      "joyful": "CAMERA FROM THE SIDE at a dynamic three-quarter angle",
      "triumphant": "CAMERA LOW ANGLE from ground level looking slightly upward",
      "triumphant-emotional": "CAMERA LOW ANGLE from ground level looking slightly upward",
      "mysterious": "CAMERA FROM THE SIDE at a dramatic angle",
      "magical": "CAMERA WIDE ESTABLISHING SHOT",
      "magical-epic": "CAMERA WIDE ESTABLISHING SHOT showing the full transformation",
      "determined": "CAMERA FROM FRONT LOW ANGLE looking up",
      "reflective": "CAMERA HIGH ANGLE from slightly above",
      "inspirational": "CAMERA FROM BEHIND at the child's height looking forward",
      "intense": "CAMERA AT GROUND LEVEL from a dynamic diagonal angle",
      "climactic": "CAMERA CLOSE-UP focusing on face and upper body",
      "sad": "CAMERA HIGH ANGLE from above looking down",
      "lonely": "CAMERA HIGH ANGLE from above looking down",
      "warm": "CAMERA AT EYE LEVEL from slight diagonal",
      "cozy": "CAMERA CLOSE-UP focusing on face and upper body",
      "playful": "CAMERA FROM THE SIDE at a dynamic three-quarter angle",
      "excited": "CAMERA LOW ANGLE from ground level",
      "peaceful": "CAMERA WIDE ESTABLISHING SHOT",
    };

    const defaultAngles = [
      "CAMERA FROM BEHIND looking over the shoulder",
      "CAMERA LOW ANGLE from ground level looking slightly upward",
      "CAMERA FROM THE SIDE at a dynamic three-quarter angle",
      "CAMERA WIDE ESTABLISHING SHOT",
      "CAMERA CLOSE-UP focusing on face and upper body",
      "CAMERA HIGH ANGLE from slightly above",
      "CAMERA FROM FRONT LOW ANGLE looking up",
      "CAMERA AT EYE LEVEL from slight diagonal",
      "CAMERA TRACKING from behind following the character",
      "CAMERA OVERHEAD looking down",
    ];

    return moodAngles[mood] || defaultAngles[index % defaultAngles.length];
  }

  _addIssue(severity, code, sceneNumber, message, autoFixFn) {
    const issue = { severity, code, sceneNumber, message };
    this.issues.push(issue);

    if (this.autoFix && autoFixFn) {
      try {
        const fixMessage = autoFixFn();
        this.fixes.push({ code, sceneNumber, fix: fixMessage });
      } catch (e) {
        // Fix basarisiz — devam et
      }
    }
  }

  /**
   * Ozet rapor dondur
   */
  getSummary() {
    const result = this.validate();
    const lines = [];
    lines.push(`=== KALITE KONTROLU: ${this.book.title || this.book.id} ===`);
    lines.push(`Sahneler: ${this.scenes.length}`);
    lines.push(`Hatalar: ${result.errors} | Uyarilar: ${result.warnings}`);
    lines.push(`Durum: ${result.valid ? "GECTI ✅" : "BASARISIZ ❌"}`);

    if (result.issues.length > 0) {
      lines.push("");
      lines.push("Sorunlar:");
      for (const issue of result.issues) {
        const prefix = issue.severity === "error" ? "❌" : "⚠️";
        lines.push(`  ${prefix} [${issue.code}] ${issue.message}`);
      }
    }

    if (result.fixes.length > 0) {
      lines.push("");
      lines.push("Otomatik Duzeltmeler:");
      for (const fix of result.fixes) {
        lines.push(`  ✅ ${fix.fix}`);
      }
    }

    return lines.join("\n");
  }
}

module.exports = BookQualityValidator;
