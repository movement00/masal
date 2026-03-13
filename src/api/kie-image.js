const fs = require("fs");
const path = require("path");
const config = require("../config");
const EventEmitter = require("events");

// Global callback registry - taskId → {resolve, reject} mapping
const callbackRegistry = new Map();
const callbackEmitter = new EventEmitter();
callbackEmitter.setMaxListeners(50);

class KieImageGenerator {
  constructor() {
    this.apiKey = config.kie.apiKey;
    this.baseUrl = "https://api.kie.ai";
    this.uploadUrl = "https://kieai.redpandaai.co";
    this.headers = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    // URL cache - ayni dosyayi tekrar yuklemekten kacin
    this._urlCache = new Map();
    // Callback URL (Railway public URL)
    this.callbackUrl = process.env.CALLBACK_URL || null;
    console.log(`  [kie.ai] Mod: ${this.callbackUrl ? "CALLBACK (" + this.callbackUrl + ")" : "POLLING"}`);
  }

  /**
   * Callback endpoint'inden gelen sonucu işle
   * Server.js'den çağrılır
   */
  static handleCallback(taskId, data) {
    const pending = callbackRegistry.get(taskId);
    if (pending) {
      callbackRegistry.delete(taskId);
      const state = data?.state;
      if (state === "success") {
        try {
          const result = JSON.parse(data.resultJson);
          const url = result.resultUrls?.[0];
          if (url) {
            console.log(`    [kie.ai] Callback: Task ${taskId} başarılı`);
            pending.resolve(url);
          } else {
            pending.reject(new Error("Callback sonucunda URL bulunamadı"));
          }
        } catch (e) {
          pending.reject(new Error(`Callback JSON parse hatası: ${e.message}`));
        }
      } else if (state === "fail") {
        pending.reject(new Error(`Kie.ai üretim başarısız: ${data.failMsg || "Bilinmeyen hata"}`));
      }
    } else {
      console.log(`    [kie.ai] Callback: Task ${taskId} - bekleyen yok (geç gelmiş olabilir)`);
    }
  }

  /**
   * Lokal dosyayi Kie.ai file upload API'ye yukler ve public URL alir
   * Dosyalar 3 gun boyunca saklanir
   */
  async _uploadToKie(imagePath, retries = 2) {
    // Eger zaten URL ise direkt dondur
    if (imagePath.startsWith("http")) return imagePath;

    // Cache kontrol
    if (this._urlCache.has(imagePath)) {
      return this._urlCache.get(imagePath);
    }

    const buffer = fs.readFileSync(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    const mimeTypes = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
    };
    const mime = mimeTypes[ext] || "image/jpeg";
    const base64Data = `data:${mime};base64,${buffer.toString("base64")}`;
    const fileName = `masal_${Date.now()}${ext}`;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(
          `${this.uploadUrl}/api/file-base64-upload`,
          {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify({
              base64Data,
              uploadPath: "masal/refs",
              fileName,
            }),
          },
        );

        let data;
        try {
          data = await response.json();
        } catch (jsonErr) {
          throw new Error(`Kie.ai upload yanıtı JSON olarak ayrıştırılamadı: ${response.status}`);
        }

        if (!data.success && data.code !== 200) {
          throw new Error(data.msg || JSON.stringify(data));
        }

        const downloadUrl = data.data?.downloadUrl;
        if (!downloadUrl) {
          throw new Error("Upload yanıtında downloadUrl bulunamadı");
        }

        // Cache'e kaydet
        this._urlCache.set(imagePath, downloadUrl);
        console.log(`    [kie.ai] Dosya yüklendi: ${fileName}`);

        return downloadUrl;
      } catch (err) {
        if (attempt < retries) {
          console.log(`    [kie.ai] Upload hatası, ${3 * (attempt + 1)}s sonra tekrar denenecek...`);
          await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
        } else {
          throw new Error(`Kie.ai dosya yükleme hatası: ${err.message}`);
        }
      }
    }
  }

  /**
   * Task olusturur ve taskId dondurur (2 deneme)
   * @param {string} prompt
   * @param {string[]} imageUrls
   * @param {string} resolution - "1K" veya "2K" (varsayilan: config'den)
   */
  async _createTask(prompt, imageUrls = [], resolution = null) {
    const res = resolution || config.output?.resolution || "2K";
    const body = {
      model: "nano-banana-2",
      input: {
        prompt,
        aspect_ratio: "3:4",
        resolution: res,
        output_format: "png",
      },
    };

    if (imageUrls.length > 0) {
      body.input.image_input = imageUrls.slice(0, 8);
    }

    // Callback URL varsa ekle
    if (this.callbackUrl) {
      body.callBackUrl = `${this.callbackUrl}/api/kie-callback`;
    }

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(`${this.baseUrl}/api/v1/jobs/createTask`, {
          method: "POST",
          headers: this.headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        let data;
        try {
          data = await response.json();
        } catch (jsonErr) {
          throw new Error(`Kie.ai createTask yanıtı JSON olarak ayrıştırılamadı: ${response.status}`);
        }

        if (data.code !== 200) {
          throw new Error(
            `Kie.ai task oluşturulamadı: ${data.msg || JSON.stringify(data)}`,
          );
        }

        return data.data.taskId;
      } catch (err) {
        console.warn(`    [kie.ai] CreateTask hatası (deneme ${attempt}/2): ${err.message}`);
        if (attempt === 2) throw err;
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  /**
   * Edit model ile task olusturur (nano-banana-edit - cok daha hizli)
   */
  async _createEditTask(prompt, imageUrls = []) {
    const body = {
      model: "google/nano-banana-edit",
      input: {
        prompt,
        image_urls: imageUrls,
      },
    };

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(`${this.baseUrl}/api/v1/jobs/createTask`, {
          method: "POST",
          headers: this.headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        let data;
        try {
          data = await response.json();
        } catch (jsonErr) {
          throw new Error(`Kie.ai editTask yanıtı JSON olarak ayrıştırılamadı: ${response.status}`);
        }

        if (data.code !== 200) {
          throw new Error(
            `Kie.ai edit task oluşturulamadı: ${data.msg || JSON.stringify(data)}`,
          );
        }

        return data.data.taskId;
      } catch (err) {
        console.warn(`    [kie.ai] EditTask hatası (deneme ${attempt}/2): ${err.message}`);
        if (attempt === 2) throw err;
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  /**
   * Task sonucunu bekler - callback varsa callback, yoksa polling
   * @param {string} taskId
   * @param {number} maxWaitMs
   * @param {function} onProgress - Bekleme durumu bilgisi
   */
  async _waitForResult(taskId, maxWaitMs = 300000, onProgress = null) {
    if (this.callbackUrl) {
      return this._waitForCallback(taskId, maxWaitMs, onProgress);
    }
    return this._waitWithPolling(taskId, maxWaitMs, onProgress);
  }

  /**
   * Callback modunda bekle - API bize POST atar
   */
  async _waitForCallback(taskId, maxWaitMs = 300000, onProgress = null) {
    const startTime = Date.now();
    console.log(`    [kie.ai] Callback modu - ${taskId} bekleniyor...`);

    return new Promise((resolve, reject) => {
      // Timeout
      const timer = setTimeout(() => {
        callbackRegistry.delete(taskId);
        // Timeout olursa polling'e fallback
        console.log(`    [kie.ai] Callback timeout - polling'e geçiliyor...`);
        this._waitWithPolling(taskId, 60000, onProgress).then(resolve).catch(reject);
      }, maxWaitMs);

      // Progress interval
      const progressInterval = onProgress ? setInterval(() => {
        const elapsedSec = Math.round((Date.now() - startTime) / 1000);
        onProgress({ elapsedSec, callback: true });
      }, 10000) : null;

      // Registry'ye ekle
      callbackRegistry.set(taskId, {
        resolve: (url) => {
          clearTimeout(timer);
          if (progressInterval) clearInterval(progressInterval);
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          console.log(`    [kie.ai] Callback ile görsel hazır (${elapsed}s)`);
          resolve(url);
        },
        reject: (err) => {
          clearTimeout(timer);
          if (progressInterval) clearInterval(progressInterval);
          reject(err);
        }
      });
    });
  }

  /**
   * Polling modunda bekle (fallback)
   */
  async _waitWithPolling(taskId, maxWaitMs = 300000, onProgress = null) {
    const startTime = Date.now();
    const pollInterval = 2000;
    let consecutiveErrors = 0;

    while (Date.now() - startTime < maxWaitMs) {
      if (onProgress) {
        const elapsedSec = Math.round((Date.now() - startTime) / 1000);
        onProgress({ elapsedSec, polling: true });
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        const response = await fetch(
          `${this.baseUrl}/api/v1/jobs/recordInfo?taskId=${taskId}`,
          {
            headers: { Authorization: `Bearer ${this.apiKey}` },
            signal: controller.signal,
          },
        );
        clearTimeout(timeout);

        let data;
        try {
          data = await response.json();
        } catch (jsonErr) {
          consecutiveErrors++;
          console.warn(`    [kie.ai] Polling JSON parse hatası (${consecutiveErrors})`);
          if (consecutiveErrors >= 6) throw new Error("Kie.ai polling yanıtları ayrıştırılamıyor");
          await new Promise((r) => setTimeout(r, pollInterval));
          continue;
        }
        const state = data.data?.state;
        consecutiveErrors = 0;

        if (state === "success") {
          let result;
          try {
            result = JSON.parse(data.data.resultJson);
          } catch (parseErr) {
            throw new Error(`Kie.ai sonuç JSON parse hatası: ${(data.data.resultJson || "").substring(0, 100)}`);
          }
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          console.log(`    [kie.ai] Gorsel hazir (${elapsed}s)`);
          return result.resultUrls[0];
        }

        if (state === "fail") {
          throw new Error(`Kie.ai üretim başarısız: ${data.data.failMsg || "Bilinmeyen hata"}`);
        }

        if (state) {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          if (elapsed % 10 < 3) console.log(`    [kie.ai] Durum: ${state} (${elapsed}s / ${Math.round(maxWaitMs/1000)}s)`);
        }
      } catch (err) {
        if (err.message.includes("üretim başarısız")) throw err;
        consecutiveErrors++;
        console.warn(`    [kie.ai] Polling hatası (${consecutiveErrors}): ${err.message}`);
        if (consecutiveErrors >= 6) throw new Error(`Kie.ai bağlantı hatası: ${consecutiveErrors} ardışık hata`);
      }

      await new Promise((r) => setTimeout(r, pollInterval));
    }

    throw new Error(`Kie.ai zaman aşımı (${Math.round(maxWaitMs / 60000)} dakika)`);
  }

  /**
   * Uretilen gorseli indirir (3 deneme, timeout korumalı)
   */
  async _downloadImage(url) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Bos veya cok kucuk gorsel kontrolu
        if (buffer.length < 1000) {
          throw new Error(`Görsel çok küçük (${buffer.length} byte), muhtemelen bozuk`);
        }

        return buffer;
      } catch (err) {
        console.warn(`    [kie.ai] İndirme hatası (deneme ${attempt}/3): ${err.message}`);
        if (attempt === 3) throw new Error(`Görsel indirilemedi: ${err.message}`);
        await new Promise((r) => setTimeout(r, 3000 * attempt));
      }
    }
  }

  /**
   * Sahne gorseli uretir
   * @param {string} prompt
   * @param {string} childPhotoPath
   * @param {string[]} referenceImages
   * @param {function} onProgress - Bekleme durumu callback
   */
  async generateSceneImage(prompt, childPhotoPath, referenceImages = [], onProgress = null) {
    const imageUrls = [];

    // 1. Cocuk fotografi yukle
    console.log("    [kie.ai] 1/4 Referans fotoğraf yükleniyor...");
    try {
      const childUrl = await this._uploadToKie(childPhotoPath);
      imageUrls.push(childUrl);
      console.log("    [kie.ai] 1/4 Çocuk fotoğrafı OK");
    } catch (err) {
      console.error("    [kie.ai] HATA: Çocuk fotoğrafı yüklenemedi:", err.message);
      throw err;
    }

    // 2. Referans gorseller: karakter profili + onceki sahne (maks 3)
    console.log(`    [kie.ai] 2/4 ${referenceImages.length} referans görsel yükleniyor...`);
    const maxRefs = Math.min(referenceImages.length, 3);
    for (let i = referenceImages.length - maxRefs; i < referenceImages.length; i++) {
      try {
        const refUrl = await this._uploadToKie(referenceImages[i]);
        imageUrls.push(refUrl);
        console.log(`    [kie.ai] 2/4 Referans ${i + 1} OK`);
      } catch (uploadErr) {
        console.warn(`    [kie.ai] Referans yükleme atlandı: ${uploadErr.message}`);
      }
    }

    // 3. Task oluştur
    const currentRes = config.output?.resolution || "1K";
    console.log(`    [kie.ai] 3/4 Task oluşturuluyor (nano-banana-2, ${currentRes}, ${imageUrls.length} referans)...`);
    try {
      const taskId = await this._createTask(prompt, imageUrls);
      console.log(`    [kie.ai] 3/4 Task ID: ${taskId}`);

      // 4. Sonucu bekle
      console.log("    [kie.ai] 4/4 Görsel üretiliyor...");
      const resultUrl = await this._waitForResult(taskId, 300000, onProgress);
      console.log("    [kie.ai] 4/4 Görsel hazır, indiriliyor...");

      const buffer = await this._downloadImage(resultUrl);
      console.log(`    [kie.ai] TAMAM (${Math.round(buffer.length / 1024)}KB)`);
      return { buffer, resultUrl };
    } catch (err) {
      console.error(`    [kie.ai] HATA: ${err.message}`);
      throw err;
    }
  }

  /**
   * Metin sayfası arka planı üretir (karakter fotoğrafı OLMADAN)
   * AI pastel/soft tarz arka plan
   */
  async generateTextBackground(prompt, outputPath) {
    const fullPrompt = `Create a soft, dreamy children's book background illustration.
No characters, no people, no faces, no text.
Just a beautiful, gentle background suitable for overlaying story text.
The background should be: ${prompt}
Style: Soft pastel watercolor, dreamy atmosphere, gentle gradients, children's book illustration, high quality.`;

    console.log("    [kie.ai] Metin arka planı task oluşturuluyor...");
    const taskId = await this._createTask(fullPrompt, []);
    console.log(`    [kie.ai] Text BG Task ID: ${taskId}`);

    console.log("    [kie.ai] Metin arka planı üretiliyor...");
    const resultUrl = await this._waitForResult(taskId);
    console.log("    [kie.ai] Metin arka planı hazır, indiriliyor...");

    const buffer = await this._downloadImage(resultUrl);

    if (outputPath) {
      fs.writeFileSync(outputPath, buffer);
    }

    return buffer;
  }

  /**
   * Karakter referans sayfasi
   */
  async generateCharacterSheet(childPhotoPath, styleDescription) {
    console.log("    [kie.ai] Karakter fotoğrafı yükleniyor...");
    const childUrl = await this._uploadToKie(childPhotoPath);

    const prompt = `Create a 3D Pixar-style character turnaround reference sheet.
Image 1 is the real child - preserve their EXACT facial features.
Show 4 views on white background: front view, 3/4 angle, side profile, back view.
Style: ${styleDescription}
The character face must look EXACTLY like the child in Image 1.
Clean professional character sheet layout.`;

    console.log("    [kie.ai] Karakter sheet task oluşturuluyor...");
    const taskId = await this._createTask(prompt, [childUrl]);
    console.log(`    [kie.ai] Task ID: ${taskId}`);

    console.log("    [kie.ai] Karakter sheet üretiliyor (2K)...");
    const resultUrl = await this._waitForResult(taskId);
    console.log("    [kie.ai] Karakter sheet hazır!");

    const buffer = await this._downloadImage(resultUrl);
    return { buffer, resultUrl };
  }
}

module.exports = KieImageGenerator;
