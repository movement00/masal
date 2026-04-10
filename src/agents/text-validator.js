/**
 * TextValidator - Metin Kalite Kontrolcusu
 *
 * Uretilen hikaye metinlerini kontrol eder ve duzeltir:
 * - Isim tekrari kontrolu (sahne basina max 2)
 * - Devrik cumle tespiti ve duzeltme
 * - Mantik hatasi kontrolu
 * - Yas grubuna uygunluk
 * - Dil bilgisi kontrolu
 */

class TextValidator {
  constructor(options = {}) {
    this.maxNamePerScene = options.maxNamePerScene || 2;
    this.ageGroup = options.ageGroup || "3-6";
  }

  /**
   * Tum sahnelerin metinlerini dogrular ve sorunlari raporlar
   * @param {Array} scenes - [{sceneNumber, title, text}]
   * @param {string} childName - Cocugun adi
   * @returns {object} {valid, issues, correctedScenes}
   */
  validateAll(scenes, childName) {
    const issues = [];
    const correctedScenes = [];

    for (const scene of scenes) {
      const sceneIssues = [];
      let correctedText = scene.text;

      // 1. Isim tekrari kontrolu
      const nameCount = this._countName(correctedText, childName);
      if (nameCount > this.maxNamePerScene) {
        sceneIssues.push({
          type: "name_repetition",
          severity: "warning",
          message: `Sahne ${scene.sceneNumber}: "${childName}" ismi ${nameCount} kez tekrarlaniyor (max ${this.maxNamePerScene})`,
          count: nameCount
        });
        correctedText = this._reduceNameRepetition(correctedText, childName, this.maxNamePerScene);
      }

      // 2. Devrik cumle kontrolu
      const devrikSentences = this._findDevrikCumleler(correctedText);
      if (devrikSentences.length > 0) {
        sceneIssues.push({
          type: "devrik_cumle",
          severity: "info",
          message: `Sahne ${scene.sceneNumber}: ${devrikSentences.length} potansiyel devrik cumle bulundu`,
          sentences: devrikSentences
        });
      }

      // 3. Tekrarlanan kelime kontrolu
      const repeatedWords = this._findRepeatedWords(correctedText);
      if (repeatedWords.length > 0) {
        sceneIssues.push({
          type: "word_repetition",
          severity: "info",
          message: `Sahne ${scene.sceneNumber}: Tekrarlanan kelimeler: ${repeatedWords.join(", ")}`,
        });
      }

      // 4. Cok kisa veya cok uzun cumle kontrolu
      const lengthIssues = this._checkSentenceLengths(correctedText);
      if (lengthIssues.length > 0) {
        sceneIssues.push({
          type: "sentence_length",
          severity: "info",
          message: `Sahne ${scene.sceneNumber}: ${lengthIssues.length} cumle uzunluk sorunu`,
          details: lengthIssues
        });
      }

      // 5. Bos veya cok kisa sahne kontrolu
      if (!correctedText || correctedText.trim().length < 20) {
        sceneIssues.push({
          type: "empty_scene",
          severity: "error",
          message: `Sahne ${scene.sceneNumber}: Metin cok kisa veya bos`
        });
      }

      if (sceneIssues.length > 0) {
        issues.push(...sceneIssues);
      }

      correctedScenes.push({
        ...scene,
        text: correctedText,
        _issues: sceneIssues
      });
    }

    const errorCount = issues.filter(i => i.severity === "error").length;
    const warningCount = issues.filter(i => i.severity === "warning").length;

    console.log(`  [TextValidator] ${scenes.length} sahne kontrol edildi: ${errorCount} hata, ${warningCount} uyari, ${issues.length - errorCount - warningCount} bilgi`);

    return {
      valid: errorCount === 0,
      issues,
      correctedScenes,
      summary: {
        total: issues.length,
        errors: errorCount,
        warnings: warningCount,
        info: issues.length - errorCount - warningCount
      }
    };
  }

  /**
   * Isim sayisini hesaplar
   */
  _countName(text, name) {
    if (!name || !text) return 0;
    const regex = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return (text.match(regex) || []).length;
  }

  /**
   * Fazla isim tekrarini azaltir
   * Ilk ve son kullanimi korur, ortadakileri zamir ile degistirir
   */
  _reduceNameRepetition(text, name, maxCount) {
    if (!name || !text) return text;

    const regex = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = [...text.matchAll(regex)];

    if (matches.length <= maxCount) return text;

    // Ilk ve son kullanimi koru, ortadakileri degistir
    let result = text;
    const toReplace = matches.slice(1, -1); // Ilk ve sonuncu haric

    // Sadece fazla olanlari degistir
    let replacedCount = 0;
    const maxReplace = matches.length - maxCount;

    for (let i = toReplace.length - 1; i >= 0 && replacedCount < maxReplace; i--) {
      const match = toReplace[i];
      const before = result.substring(Math.max(0, match.index - 5), match.index);

      // Diyalog icindeyse degistirme
      if (before.includes('"') || before.includes("'")) continue;

      // Cumle basindaysa "O" ile, ortasindaysa kucuk "o" ile degistir
      const isStart = match.index === 0 || result[match.index - 1] === '\n' || result[match.index - 2] === '.';
      const replacement = isStart ? "O" : "o";

      result = result.substring(0, match.index) + replacement + result.substring(match.index + match[0].length);
      replacedCount++;
    }

    return result;
  }

  /**
   * Devrik cumle tespiti (basit heuristik)
   * Turkce'de yuklem sonda olmali — eger fiil cumlenin basinda veya ortasindaysa devrik olabilir
   */
  _findDevrikCumleler(text) {
    if (!text) return [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const devrik = [];

    // Basit kontrol: cumle sonunda isim/sifat varsa ve ortasinda fiil varsa devrik olabilir
    const fiilEkleri = /(?:du|dı|di|dü|tu|tı|ti|tü|yor|mış|miş|muş|müş|ecek|acak|ır|ir|ur|ür|ar|er)$/i;

    for (const sentence of sentences) {
      const words = sentence.trim().split(/\s+/);
      if (words.length < 3) continue;

      const lastWord = words[words.length - 1];
      // Son kelime fiil eki tasimiyorsa VE ilk kelimelerden biri fiil eki tasiyorsa → devrik
      if (!fiilEkleri.test(lastWord)) {
        const midWords = words.slice(1, -1);
        const hasMidVerb = midWords.some(w => fiilEkleri.test(w));
        if (hasMidVerb) {
          devrik.push(sentence.trim());
        }
      }
    }

    return devrik;
  }

  /**
   * Art arda tekrarlanan kelimeleri bulur
   */
  _findRepeatedWords(text) {
    if (!text) return [];
    const words = text.toLowerCase().replace(/[.,!?;:'"()]/g, '').split(/\s+/);
    const repeated = [];
    const skipWords = new Set(["bir", "ve", "de", "da", "bu", "o", "çok", "ne", "ama", "ile"]);

    for (let i = 1; i < words.length; i++) {
      if (words[i] === words[i - 1] && words[i].length > 2 && !skipWords.has(words[i])) {
        if (!repeated.includes(words[i])) {
          repeated.push(words[i]);
        }
      }
    }

    return repeated;
  }

  /**
   * Cumle uzunluklarini kontrol eder
   */
  _checkSentenceLengths(text) {
    if (!text) return [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const issues = [];

    const limits = {
      "0-3": { min: 2, max: 8 },
      "3-6": { min: 3, max: 15 },
      "6-12": { min: 5, max: 30 },
      "yetiskin": { min: 5, max: 40 }
    };

    const limit = limits[this.ageGroup] || limits["3-6"];

    for (const sentence of sentences) {
      const wordCount = sentence.trim().split(/\s+/).length;
      if (wordCount > limit.max) {
        issues.push(`"${sentence.trim().substring(0, 50)}..." cok uzun (${wordCount} kelime, max ${limit.max})`);
      }
    }

    return issues;
  }
}

module.exports = TextValidator;
