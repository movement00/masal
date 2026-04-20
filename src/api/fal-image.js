const { fal } = require("@fal-ai/client");
const fs = require("fs");
const path = require("path");
const config = require("../config");

class FalImageGenerator {
  constructor() {
    fal.config({ credentials: config.fal.apiKey });
  }

  /**
   * Gorsel dosyasini fal.ai'ye yukler ve URL alir
   */
  async _uploadImage(imagePath) {
    const imageBuffer = fs.readFileSync(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    const mimeType =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : "image/jpeg";

    const url = await fal.storage.upload(
      new Blob([imageBuffer], { type: mimeType }),
    );
    return url;
  }

  /**
   * Tek bir sahne gorseli uretir (fal.ai edit endpoint ile)
   *
   * @param {string} prompt - Sahne prompt'u
   * @param {string} childPhotoPath - Cocuk fotografinin yolu
   * @param {string[]} referenceImages - Onceki sahnelerin gorselleri
   * @returns {Promise<Buffer>} - Uretilen gorsel buffer'i
   */
  async generateSceneImage(prompt, childPhotoPath, referenceImages = []) {
    // Tum referans gorselleri yukle
    const imageUrls = [];

    // 1. Cocuk fotografi
    const childUrl = await this._uploadImage(childPhotoPath);
    imageUrls.push(childUrl);

    // 2. Onceki sahne gorselleri (maks 5)
    const maxRefs = Math.min(referenceImages.length, 5);
    for (let i = 0; i < maxRefs; i++) {
      const refUrl = await this._uploadImage(referenceImages[i]);
      imageUrls.push(refUrl);
    }

    const fullPrompt = this._buildPrompt(prompt, referenceImages.length);

    // fal.ai edit endpoint'i ile gorsel uret
    const result = await fal.subscribe(config.fal.editModel, {
      input: {
        prompt: fullPrompt,
        image_urls: imageUrls,
        resolution: config.output.resolution,
        aspect_ratio: "3:4", // Kitap sayfasi orani
        output_format: config.output.format,
        sync_mode: true,
      },
    });

    // Gorseli indir
    if (result.data?.images?.[0]?.url) {
      const response = await fetch(result.data.images[0].url);
      const arrayBuffer = await response.arrayBuffer();
      return { buffer: Buffer.from(arrayBuffer), resultUrl: null };
    }

    throw new Error("fal.ai yanıtında görsel bulunamadı");
  }

  /**
   * Prompt olusturur
   */
  _buildPrompt(scenePrompt, refCount) {
    let prompt = "";

    prompt +=
      "IMPORTANT: Image 1 is the child's reference photo. ";
    prompt +=
      "Keep the child's facial features EXACTLY the same as Image 1. ";
    prompt +=
      "Same face, same eyes, same skin tone, same hair. ";

    if (refCount > 0) {
      prompt += `Images 2-${refCount + 1} show previous scenes - match the art style. `;
    }

    prompt += "\n\n" + scenePrompt;

    return prompt;
  }

  /**
   * Text-to-image endpoint ile gorsel uretir (referanssiz)
   */
  async generateFromText(prompt) {
    const result = await fal.subscribe(config.fal.model, {
      input: {
        prompt,
        resolution: config.output.resolution,
        aspect_ratio: "3:4",
        output_format: config.output.format,
        sync_mode: true,
      },
    });

    if (result.data?.images?.[0]?.url) {
      const response = await fetch(result.data.images[0].url);
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    throw new Error("fal.ai yanıtında görsel bulunamadı");
  }

  // ──────────────────────────────────────────────────────────────
  // KIE-compat shim: scene-generator.generateBackground() çağrıları
  // (_createTask, _uploadToKie, _waitForResult, _downloadImage) için.
  // Fal sync_mode'da çalıştığından _createTask tüm üretimi yapar ve
  // sonucu bir cache'te taskId ile tutar; diğer method'lar cache'i okur.
  // ──────────────────────────────────────────────────────────────

  async _uploadToKie(imagePath) {
    return this._uploadImage(imagePath);
  }

  async _createTask(prompt, imageUrls = []) {
    const hasRefs = Array.isArray(imageUrls) && imageUrls.length > 0;
    const model = hasRefs ? config.fal.editModel : config.fal.model;
    const input = {
      prompt,
      resolution: config.output.resolution,
      aspect_ratio: "3:4",
      output_format: config.output.format,
      sync_mode: true,
    };
    if (hasRefs) input.image_urls = imageUrls;
    const result = await fal.subscribe(model, { input });
    const url = result.data?.images?.[0]?.url;
    if (!url) throw new Error("fal.ai yanıtında görsel bulunamadı (_createTask)");
    const response = await fetch(url);
    const buffer = Buffer.from(await response.arrayBuffer());
    const taskId = `fal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (!this._taskCache) this._taskCache = new Map();
    this._taskCache.set(taskId, { url, buffer });
    return taskId;
  }

  async _waitForResult(taskId, timeoutMs = 300000, onProgress = null) {
    const entry = this._taskCache?.get(taskId);
    if (!entry) throw new Error(`fal shim: taskId cache'te yok: ${taskId}`);
    if (typeof onProgress === "function") {
      try { onProgress({ status: "completed", elapsed: 0 }); } catch {}
    }
    return entry.url;
  }

  async _downloadImage(resultUrl) {
    if (this._taskCache) {
      for (const entry of this._taskCache.values()) {
        if (entry.url === resultUrl) return entry.buffer;
      }
    }
    const response = await fetch(resultUrl);
    return Buffer.from(await response.arrayBuffer());
  }

  /**
   * Karakter referans sayfasi olusturur
   */
  async generateCharacterSheet(childPhotoPath, styleDescription) {
    const childUrl = await this._uploadImage(childPhotoPath);

    const prompt = `Create a character turnaround reference sheet.
Image 1 is the real child - preserve their EXACT facial features.
Show 4 views: front, 3/4 angle, side profile, back view.
Style: ${styleDescription}
White background, clean character sheet layout.
The character face must look EXACTLY like the child in Image 1.`;

    const result = await fal.subscribe(config.fal.editModel, {
      input: {
        prompt,
        image_urls: [childUrl],
        resolution: "2K",
        aspect_ratio: "16:9",
        output_format: "png",
        sync_mode: true,
      },
    });

    if (result.data?.images?.[0]?.url) {
      const response = await fetch(result.data.images[0].url);
      const arrayBuffer = await response.arrayBuffer();
      return { buffer: Buffer.from(arrayBuffer), resultUrl: null };
    }

    throw new Error("Karakter sayfası oluşturulamadı");
  }
}

module.exports = FalImageGenerator;
