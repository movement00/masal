/**
 * QualityValidator Agent
 *
 * Uretilen her gorseli Gemini Vision ile analiz eder.
 * 5 kontrol yapar:
 *   1. outfitConsistency  - Kiyafet book.json ile uyumlu mu?
 *   2. styleQuality       - 3D Pixar kalitesi korunmus mu?
 *   3. sceneAccuracy      - Sahne icerigi prompt ile uyumlu mu?
 *   4. compositionRule    - Alt %35'te onemli icerik var mi?
 *   5. faceConsistency    - Karakter yuzu referans fotoya benziyor mu?
 *
 * Model: gemini-2.0-flash (hizli, ucuz, vision destekli)
 */

const { GoogleGenAI } = require("@google/genai");
const config = require("../config");
const {
  VALIDATION_OUTFIT_THRESHOLD,
  VALIDATION_STYLE_THRESHOLD,
  VALIDATION_OVERALL_THRESHOLD,
  VALIDATION_COMPOSITION_THRESHOLD,
  VALIDATION_FACE_THRESHOLD,
} = require("../constants");

class QualityValidator {
  /**
   * @param {object} options
   * @param {boolean} options.enabled - Validasyon aktif mi? (config'den)
   */
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.client = null;

    if (this.enabled && config.google.apiKey) {
      this.client = new GoogleGenAI({ apiKey: config.google.apiKey });
    } else {
      this.enabled = false;
      console.log("  [quality-validator] Devre disi (API key yok veya disabled)");
    }
  }

  /**
   * Tek bir gorseli analiz eder.
   *
   * @param {Buffer} imageBuffer       - Uretilen gorsel
   * @param {object} expectations      - Beklenen ozellikler
   * @param {string} expectations.outfitDescription  - Kiyafet tarifi
   * @param {string} expectations.style              - Beklenen stil
   * @param {string} expectations.mood               - Sahne duygusu
   * @param {string} expectations.setting            - Sahne mekani
   * @param {string} expectations.scenePrompt        - Orijinal sahne prompt'u
   * @param {Buffer} [expectations.childPhotoBuffer] - Cocuk referans fotografi (yuz karsilastirmasi)
   * @param {Buffer} [anchorImageBuffer] - Anchor sahne gorseli (stil karsilastirmasi)
   * @returns {Promise<object>} - { passed, overallScore, checks }
   */
  async validateScene(imageBuffer, expectations, anchorImageBuffer = null) {
    if (!this.enabled || !this.client) {
      return this._passResult("Validasyon devre disi");
    }

    try {
      // 5 kontrolu paralel calistir
      const checkPromises = [
        expectations.outfitDescription
          ? this._checkOutfit(imageBuffer, expectations.outfitDescription)
          : Promise.resolve({ score: 100, feedback: "Outfit tanimlanmamis, atlaniyor" }),
        this._checkStyle(imageBuffer, expectations.style, anchorImageBuffer),
        this._checkSceneAccuracy(imageBuffer, expectations.scenePrompt, expectations.mood, expectations.setting),
        this._checkComposition(imageBuffer),
        expectations.childPhotoBuffer
          ? this._checkFaceConsistency(imageBuffer, expectations.childPhotoBuffer)
          : Promise.resolve({ score: 100, feedback: "Referans foto yok, atlaniyor" }),
      ];

      const [outfitResult, styleResult, sceneResult, compositionResult, faceResult] = await Promise.all(checkPromises);

      const checks = {
        outfitConsistency: outfitResult,
        styleQuality: styleResult,
        sceneAccuracy: sceneResult,
        compositionRule: compositionResult,
        faceConsistency: faceResult,
      };

      // Gecis kurali
      const hasOutfit = !!expectations.outfitDescription;
      const outfitPassed = !hasOutfit || outfitResult.score >= VALIDATION_OUTFIT_THRESHOLD;
      const stylePassed = styleResult.score >= VALIDATION_STYLE_THRESHOLD;
      const hasChildPhoto = !!expectations.childPhotoBuffer;
      const facePassed = !hasChildPhoto || faceResult.score >= VALIDATION_FACE_THRESHOLD;

      const allScores = [outfitResult.score, styleResult.score, sceneResult.score, compositionResult.score, faceResult.score];
      const avgScore = Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length);

      const passed = outfitPassed && stylePassed && facePassed && avgScore >= VALIDATION_OVERALL_THRESHOLD;

      console.log(
        `  [quality-validator] Skor: outfit=${outfitResult.score} style=${styleResult.score} ` +
        `scene=${sceneResult.score} comp=${compositionResult.score} face=${faceResult.score} avg=${avgScore} → ${passed ? "GECTI" : "KALDI"}`
      );

      return { passed, overallScore: avgScore, checks };
    } catch (err) {
      console.warn(`  [quality-validator] Hata, gecis kabul ediliyor: ${err.message}`);
      return this._passResult(`Validasyon hatasi: ${err.message}`);
    }
  }

  /**
   * Iki gorseli karsilastirir, hangisinin daha iyi oldugunu belirler.
   *
   * @param {Buffer} imageA - Ilk gorsel
   * @param {Buffer} imageB - Ikinci gorsel
   * @param {object} expectations
   * @returns {Promise<object>} - { aScore, bScore, betterImage: "a"|"b" }
   */
  async compareScenes(imageA, imageB, expectations, anchorImageBuffer = null) {
    if (!this.enabled || !this.client) {
      return { aScore: 75, bScore: 75, betterImage: "a" };
    }

    try {
      const [resultA, resultB] = await Promise.all([
        this.validateScene(imageA, expectations, anchorImageBuffer),
        this.validateScene(imageB, expectations, anchorImageBuffer),
      ]);

      return {
        aScore: resultA.overallScore,
        bScore: resultB.overallScore,
        betterImage: resultA.overallScore >= resultB.overallScore ? "a" : "b",
        resultA,
        resultB,
      };
    } catch (err) {
      console.warn(`  [quality-validator] Karsilastirma hatasi: ${err.message}`);
      return { aScore: 75, bScore: 75, betterImage: "a" };
    }
  }

  // ─────────────────────────────────────────
  // Ozel kontrol metodlari
  // ─────────────────────────────────────────

  /**
   * Kiyafet kontrolu
   */
  async _checkOutfit(imageBuffer, outfitDescription) {
    const prompt = `Analyze this image of a character. The character should be wearing the following outfit:
"${outfitDescription}"

Score from 0-100 how well the character's clothing matches this description.
Consider: correct clothing items, colors, patterns, accessories, and name visibility if mentioned.

Respond in JSON only:
{"score": <number 0-100>, "feedback": "<brief explanation of what matches and what doesn't>"}`;

    return this._askVision(imageBuffer, prompt);
  }

  /**
   * Stil kalitesi kontrolu
   */
  async _checkStyle(imageBuffer, expectedStyle, anchorBuffer = null) {
    const styleTxt = expectedStyle ||
      "3D Pixar animated movie style, vibrant colors, warm lighting, cinematic composition, high detail";

    let prompt = `Analyze this illustration's visual quality and style.
Expected style: "${styleTxt}"

Score from 0-100 based on:
- Is this a high-quality 3D rendered illustration (not 2D, not sketch)?
- Are colors vibrant and lighting warm/cinematic?
- Does it look like a professional Pixar/Disney quality render?
- Are character proportions and details well-rendered?`;

    if (anchorBuffer) {
      prompt += `\n\nImage 2 is the STYLE REFERENCE (anchor scene). How well does Image 1 match the visual style of Image 2?`;
    }

    prompt += `\n\nRespond in JSON only:
{"score": <number 0-100>, "feedback": "<brief explanation>"}`;

    const images = [imageBuffer];
    if (anchorBuffer) images.push(anchorBuffer);

    return this._askVision(images, prompt);
  }

  /**
   * Sahne dogrulugu kontrolu
   */
  async _checkSceneAccuracy(imageBuffer, scenePrompt, mood, setting) {
    let prompt = `Analyze this illustration and evaluate how well it matches the intended scene description.

Scene prompt: "${(scenePrompt || "").substring(0, 500)}"`;

    if (mood) prompt += `\nIntended mood: ${mood}`;
    if (setting) prompt += `\nIntended setting: ${setting}`;

    prompt += `\n\nScore from 0-100 based on:
- Does the scene contain the described characters and actions?
- Is the setting/location correct?
- Does the mood/atmosphere match?
- Are key objects and details present?

Respond in JSON only:
{"score": <number 0-100>, "feedback": "<brief explanation of what matches and what's missing>"}`;

    return this._askVision(imageBuffer, prompt);
  }

  /**
   * Yuz tutarliligi kontrolu - uretilen gorseldeki karakter yuzu
   * referans fotodaki cocugun yuzune benziyor mu?
   */
  async _checkFaceConsistency(imageBuffer, childPhotoBuffer) {
    const prompt = `You are given two images.

Image 1 is a 3D animated illustration of a child character.
Image 2 is the REAL PHOTO of the child this character is based on.

Compare the facial features of the character in Image 1 with the real child in Image 2.

Score from 0-100 how well the 3D character's face matches the real child's face:
- Face shape and proportions (round/oval/etc.)
- Eye shape, size and relative position
- Nose shape and size
- Mouth/lip shape
- Skin tone similarity
- Hair color and general style
- GLASSES: Does the real child (Image 2) wear glasses? If YES, the character (Image 1) MUST also wear glasses. Missing glasses = automatic score below 30.
- Other accessories (headband, hair clips, etc.) must also be preserved
- Overall "looks like the same person" impression

CRITICAL: If the child in Image 2 wears glasses but the character in Image 1 does NOT wear glasses, the score MUST be 25 or below. This is a major identity failure.

NOTE: The character is 3D animated (stylized), so expect some stylization. Focus on whether the character is RECOGNIZABLY the same child, not pixel-perfect match.

Respond in JSON only:
{"score": <number 0-100>, "feedback": "<brief explanation of similarities and differences>"}`;

    return this._askVision([imageBuffer, childPhotoBuffer], prompt);
  }

  /**
   * Kompozisyon kontrolu (alt %35 bos olmali)
   */
  async _checkComposition(imageBuffer) {
    const prompt = `Analyze the composition of this children's book illustration.

RULE: All important content (characters, faces, action, key objects) should be in the TOP 65% of the image.
The BOTTOM 35% should only contain simple background elements (ground, grass, floor).

Score from 0-100:
- 100 = All important content is in top 65%, bottom is clear
- 50 = Some content in bottom but not critical
- 0 = Main character's face or important action is in the bottom third

Respond in JSON only:
{"score": <number 0-100>, "feedback": "<brief explanation>"}`;

    return this._askVision(imageBuffer, prompt);
  }

  // ─────────────────────────────────────────
  // Yardimci metodlar
  // ─────────────────────────────────────────

  /**
   * Gemini Vision API cagrisi
   * @param {Buffer|Buffer[]} imageInput - Tek buffer veya buffer dizisi
   * @param {string} prompt
   * @returns {Promise<{score: number, feedback: string}>}
   */
  async _askVision(imageInput, prompt) {
    const parts = [];

    // Gorsel(ler)i ekle
    const images = Array.isArray(imageInput) ? imageInput : [imageInput];
    for (const buf of images) {
      parts.push({
        inlineData: {
          mimeType: "image/png",
          data: buf.toString("base64"),
        },
      });
    }

    // Metin prompt ekle
    parts.push({ text: prompt });

    try {
      const response = await this.client.models.generateContent({
        model: config.geminiVision?.model || "gemini-2.0-flash",
        contents: [{ role: "user", parts }],
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";

      // JSON parse - bazen markdown code bloklari ile sarilmis olabiliyor
      let cleaned = text.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
      }

      const result = JSON.parse(cleaned);
      return {
        score: Math.max(0, Math.min(100, parseInt(result.score) || 0)),
        feedback: result.feedback || "",
      };
    } catch (err) {
      console.warn(`  [quality-validator] Vision API hatasi: ${err.message}`);
      // Hata durumunda orta skor ver (bloke etmesin)
      return { score: 65, feedback: `API hatasi: ${err.message}` };
    }
  }

  /**
   * Validasyon yapilmadan gecis sonucu olusturur
   */
  _passResult(reason) {
    return {
      passed: true,
      overallScore: 100,
      checks: {
        outfitConsistency: { score: 100, feedback: reason },
        styleQuality: { score: 100, feedback: reason },
        sceneAccuracy: { score: 100, feedback: reason },
        compositionRule: { score: 100, feedback: reason },
        faceConsistency: { score: 100, feedback: reason },
      },
    };
  }
}

module.exports = QualityValidator;
