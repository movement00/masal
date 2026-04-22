const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");
const path = require("path");
const config = require("../config");

class GoogleImageGenerator {
  constructor() {
    this.client = new GoogleGenAI({ apiKey: config.google.apiKey });
  }

  /**
   * Referans fotografi base64'e cevirir
   */
  _imageToBase64(imagePath) {
    const imageBuffer = fs.readFileSync(imagePath);
    return imageBuffer.toString("base64");
  }

  /**
   * Dosya uzantisindan MIME type belirler
   */
  _getMimeType(imagePath) {
    const ext = path.extname(imagePath).toLowerCase();
    const mimeTypes = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
    };
    return mimeTypes[ext] || "image/jpeg";
  }

  /**
   * Tek bir sahne gorseli uretir
   *
   * @param {string} prompt - Sahne prompt'u
   * @param {string} childPhotoPath - Cocuk fotografinin yolu
   * @param {string[]} referenceImages - Onceki sahnelerin gorselleri (tutarlilik icin)
   * @returns {Promise<Buffer>} - Uretilen gorsel buffer'i
   */
  async generateSceneImage(prompt, childPhotoPath, referenceImages = []) {
    const childBase64 = this._imageToBase64(childPhotoPath);
    const childMime = this._getMimeType(childPhotoPath);

    // Icerik parcalarini olustur
    const contents = [];

    // 1. Cocuk referans fotografi (en yuksek oncelik - ilk 6 gorsel high fidelity)
    contents.push({
      inlineData: {
        mimeType: childMime,
        data: childBase64,
      },
    });

    // 2. Onceki sahnelerden referans gorseller (karakter tutarliligi icin)
    // Maksimum 5 referans gorsel ekle (toplam 6 ile sinirli kalsin)
    const maxRefs = Math.min(referenceImages.length, 5);
    for (let i = 0; i < maxRefs; i++) {
      const refBase64 = this._imageToBase64(referenceImages[i]);
      const refMime = this._getMimeType(referenceImages[i]);
      contents.push({
        inlineData: {
          mimeType: refMime,
          data: refBase64,
        },
      });
    }

    // 3. Metin prompt'u
    const fullPrompt = this._buildPrompt(prompt, referenceImages.length);
    contents.push({ text: fullPrompt });

    // API cagrisi — aspectRatio: "3:4" portrait, A4 sayfalarla tutarli (memory: 2026-04-22 aspect fix)
    const response = await this.client.models.generateContent({
      model: config.google.model,
      contents: [{ role: "user", parts: contents }],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: "3:4", imageSize: config.output.resolution || "2K" },
      },
    });

    // Yanit dogrulama
    if (!response.candidates || response.candidates.length === 0) {
      throw new Error("API yanıtı boş (candidates yok) - muhtemelen içerik filtresi devreye girdi");
    }
    if (!response.candidates[0].content?.parts) {
      throw new Error("API yanıtında content.parts bulunamadı");
    }

    // Gorseli response'dan cikar
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return { buffer: Buffer.from(part.inlineData.data, "base64"), resultUrl: null };
      }
    }

    throw new Error("API yanıtında görsel bulunamadı");
  }

  /**
   * Karakter tutarliligi icin detayli prompt olusturur
   */
  _buildPrompt(scenePrompt, refCount) {
    let prompt = "";

    prompt += "CRITICAL INSTRUCTIONS FOR CHARACTER CONSISTENCY:\n";
    prompt += "- Image 1 is the REFERENCE PHOTO of the child character.\n";
    prompt += "- You MUST keep the child's facial features EXACTLY the same as Image 1.\n";
    prompt += "- Same face shape, same eyes, same nose, same mouth, same skin tone.\n";
    prompt += "- The character should be recognizably the SAME child throughout.\n";

    if (refCount > 0) {
      prompt += `- Images 2-${refCount + 1} are previous scenes for style and character consistency.\n`;
      prompt += "- Match the art style and character design from these reference scenes.\n";
    }

    prompt += "\nSCENE TO GENERATE:\n";
    prompt += scenePrompt;

    return prompt;
  }

  /**
   * Karakter referans sayfasi olusturur (ilk adim)
   * Birden fazla acidan karakter gorseli uretir
   */
  async generateCharacterSheet(childPhotoPath, styleDescription) {
    const childBase64 = this._imageToBase64(childPhotoPath);
    const childMime = this._getMimeType(childPhotoPath);

    const prompt = `Create a character turnaround reference sheet for a children's book character.

REFERENCE PHOTO: Image 1 shows the real child. You MUST preserve their exact facial features.

Generate a 3D Pixar-style character sheet showing the child from 4 angles:
- Front view (facing camera, neutral happy expression)
- 3/4 view (slightly turned, smiling)
- Side profile (looking left)
- Back view

Style: ${styleDescription}

CRITICAL: The character's face must look EXACTLY like the child in Image 1.
Keep consistent proportions, outfit, and style across all 4 views.
White/light grey background. Clean professional character sheet layout.`;

    const response = await this.client.models.generateContent({
      model: config.google.model,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: childMime, data: childBase64 } },
            { text: prompt },
          ],
        },
      ],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    });

    if (!response.candidates || response.candidates.length === 0) {
      throw new Error("Karakter sayfası API yanıtı boş - içerik filtresi devreye girmiş olabilir");
    }
    if (!response.candidates[0].content?.parts) {
      throw new Error("Karakter sayfası yanıtında content.parts bulunamadı");
    }

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return { buffer: Buffer.from(part.inlineData.data, "base64"), resultUrl: null };
      }
    }

    throw new Error("Karakter sayfası oluşturulamadı");
  }

  /**
   * Background/ozel sayfa uretir — cocuk fotografi OLMADAN.
   * Kapak, ic kapak, ithaf, hero bg, sender note, fun fact, diploma, kapanis, arka kapak icin.
   * referenceImages: opsiyonel ref goerselleri (front cover, karakter profili vs.)
   *
   * scene-generator.js'in generateBackground metodunun Google tarafi.
   */
  async generateBackground(prompt, referenceImages = []) {
    const parts = [];
    // Referans gorseller varsa once onlar (max 4 ref — palette/karakter tutarliligi icin)
    const maxRefs = Math.min(referenceImages.length, 4);
    for (let i = 0; i < maxRefs; i++) {
      const refPath = referenceImages[i];
      try {
        const b64 = this._imageToBase64(refPath);
        const mime = this._getMimeType(refPath);
        parts.push({ inlineData: { mimeType: mime, data: b64 } });
      } catch (e) {
        console.warn(`  [google-image] Ref yuklenemedi (${refPath}):`, e.message);
      }
    }
    // Metin prompt'u
    parts.push({ text: prompt });

    const response = await this.client.models.generateContent({
      model: config.google.model,
      contents: [{ role: "user", parts }],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: "3:4", imageSize: config.output.resolution || "2K" },
      },
    });

    if (!response.candidates || response.candidates.length === 0) {
      throw new Error("Background API yanıtı boş - içerik filtresi devreye girmiş olabilir");
    }
    if (!response.candidates[0].content?.parts) {
      throw new Error("Background yanıtında content.parts bulunamadı");
    }

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return { buffer: Buffer.from(part.inlineData.data, "base64"), resultUrl: null };
      }
    }
    throw new Error("Background yanıtında görsel bulunamadı");
  }
}

module.exports = GoogleImageGenerator;
