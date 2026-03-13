/**
 * SceneGenerator Agent
 *
 * Kie.ai (veya diger provider) API ile gorsel uretimi yapar.
 * Mevcut KieImageGenerator'i sariyor, prompt disaridan geliyor (PromptArchitect'ten).
 *
 * Sorumluluklar:
 *   - Cocuk fotografini yukleyip cache'lemek
 *   - Tek sahne uretimi (retry ile)
 *   - Batch paralel uretim
 *   - URL zincirleme (referans olarak onceki sahne URL'leri)
 */

const fs = require("fs");
const config = require("../config");

class SceneGenerator {
  /**
   * @param {object} imageGen - KieImageGenerator veya GoogleImageGenerator instance
   */
  constructor(imageGen) {
    this.imageGen = imageGen;
    this.childPhotoRef = null; // Yuklenip cache'lenmis cocuk foto URL/path
  }

  /**
   * Cocuk fotografini yukler (Kie.ai'ye) ve cache'ler.
   * Tum sahnelerde ayni URL kullanilir (tekrar upload yok).
   *
   * @param {string} childPhotoPath - Lokal dosya yolu
   * @returns {Promise<string>} - URL veya path
   */
  async prepareChildPhoto(childPhotoPath) {
    // Kie.ai ise upload et
    if (config.imageProvider === "kie" && this.imageGen._uploadToKie) {
      try {
        this.childPhotoRef = await this.imageGen._uploadToKie(childPhotoPath);
        console.log("  [scene-generator] Cocuk fotografi URL'si hazir");
      } catch (e) {
        console.warn("  [scene-generator] Upload basarisiz, disk path kullanilacak");
        this.childPhotoRef = childPhotoPath;
      }
    } else {
      this.childPhotoRef = childPhotoPath;
    }

    return this.childPhotoRef;
  }

  /**
   * Tek bir sahne gorseli uretir (retry ile).
   *
   * @param {object} params
   * @param {string} params.prompt           - PromptArchitect'ten gelen tam prompt
   * @param {string[]} params.referenceImages - Onceki sahnelerin URL/path'leri
   * @param {number} params.maxRetries        - Maks deneme sayisi
   * @param {function} params.onProgress      - Bekleme durumu callback
   * @returns {Promise<{buffer: Buffer, resultUrl: string|null, success: boolean}>}
   */
  async generateScene({ prompt, referenceImages = [], maxRetries = 3, onProgress = null }) {
    if (!this.childPhotoRef) {
      throw new Error("Cocuk fotografi henuz hazirlanmadi. prepareChildPhoto() cagirin.");
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          console.log(`  [scene-generator] Tekrar deneniyor (${attempt}/${maxRetries})...`);
          await new Promise((r) => setTimeout(r, 3000));
        }

        const result = await this.imageGen.generateSceneImage(
          prompt,
          this.childPhotoRef,
          referenceImages,
          onProgress,
        );

        const buffer = result.buffer || result;
        const resultUrl = result.resultUrl || null;

        return { buffer, resultUrl, success: true };
      } catch (err) {
        console.error(`  [scene-generator] Deneme ${attempt}/${maxRetries} hatasi: ${err.message}`);

        if (attempt === maxRetries) {
          return { buffer: null, resultUrl: null, success: false, error: err.message };
        }
      }
    }

    return { buffer: null, resultUrl: null, success: false, error: "Tum denemeler basarisiz" };
  }

  /**
   * Birden fazla sahneyi paralel batch halinde uretir.
   *
   * @param {object[]} sceneConfigs - Her biri { prompt, referenceImages, sceneNumber, ... }
   * @param {object} options
   * @param {number} options.batchSize     - Paralel batch boyutu (varsayilan: 7)
   * @param {function} options.onSceneDone - Her sahne tamamlandiginda cagrilir
   * @param {function} options.onProgress  - Bekleme durumu callback
   * @returns {Promise<object[]>} - Her sahne icin { sceneNumber, buffer, resultUrl, success }
   */
  async generateBatch(sceneConfigs, options = {}) {
    const { batchSize = 7, onSceneDone = null, onProgress = null } = options;
    const allResults = [];

    for (let batchStart = 0; batchStart < sceneConfigs.length; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, sceneConfigs.length);
      const batch = sceneConfigs.slice(batchStart, batchEnd);

      const batchNums = batch.map((s) => s.sceneNumber).join(", ");
      console.log(`  [scene-generator] BATCH: Sahne ${batchNums} paralel baslatiliyor...`);

      const promises = batch.map(async (sceneConfig) => {
        const result = await this.generateScene({
          prompt: sceneConfig.prompt,
          referenceImages: sceneConfig.referenceImages || [],
          maxRetries: sceneConfig.maxRetries || 3,
          onProgress,
        });

        const output = {
          sceneNumber: sceneConfig.sceneNumber,
          ...result,
        };

        if (onSceneDone) {
          onSceneDone(output);
        }

        return output;
      });

      const batchResults = await Promise.allSettled(promises);

      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          allResults.push(result.value);
        } else {
          console.error(`  [scene-generator] Batch sahne hatasi:`, result.reason);
          allResults.push({
            sceneNumber: -1,
            buffer: null,
            resultUrl: null,
            success: false,
            error: result.reason?.message || "Bilinmeyen hata",
          });
        }
      }

      console.log(`  [scene-generator] BATCH tamamlandi: ${batch.length} sahne`);
    }

    return allResults;
  }
}

module.exports = SceneGenerator;
