/**
 * Masal — Tukrce Text Validators (Faz 2)
 *
 * Log-only: metinleri DEĞİŞTİRMEZ, sadece sorunları döker.
 * Writer / text page çıktılarında sahne sahne kontrol eder.
 *
 * Sonuç: { ok, issues: [{ type, severity, message, snippet }] }
 */

const { FORBIDDEN_WORDS, CLICHE_STARTS, AGE_PRESETS } = require("./prompt-fragments");

// Devrik heuristik: cümle BÜYÜK harfli yer/zaman zarfıyla başlayıp,
// ardından küçük harflerle devam edip SONRA başka bir BÜYÜK harfli özel isim
// geliyorsa → muhtemelen devrik (özne araya girmiş).
// Örnek: "Deniz kenarında Toprak yürüyordu."
// Türkçe tam parsing yerine pragmatik heuristik. False-positive kabul.
const DEVRIK_HINTS = [
  // 1: locative/ablative/accusative ek almış bir yer/zaman ifadesi cümle başında,
  //    sonra lowercase kelimeler, sonra BÜYÜK harfli başlayan kelime (özne)
  /^[A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:[a-zçğıöşü]+\s+)*(?:[a-zçğıöşü]+(?:da|de|ta|te|dan|den|tan|ten|ya|ye|i|ı|u|ü)\b)\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+/u,
];

function splitSentences(text) {
  return (text || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?…])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function checkDevrik(sentence) {
  for (const pat of DEVRIK_HINTS) if (pat.test(sentence)) return true;
  return false;
}

function checkForbiddenWords(sentence) {
  const s = sentence.toLowerCase();
  const found = FORBIDDEN_WORDS.filter(w => new RegExp("\\b" + w + "\\b", "i").test(s));
  return found;
}

function checkClicheStart(sentence) {
  const s = sentence.toLowerCase();
  return CLICHE_STARTS.find(c => s.startsWith(c)) || null;
}

function countTurkishCharErrors(text) {
  // Basit kontrol: i/ı, I/İ yanlış kullanımı tipik. Isim özel hariç.
  // Skor: satır bazında "Ş", "I" gibi karakterler yerine "S", "I" çıkıyorsa problem. Heuristik.
  const suspect = (text.match(/[A-Z]{3,}/g) || []).length; // ALL CAPS Türkçe şüpheli
  return suspect;
}

function validateScene(scene, ageGroup) {
  const issues = [];
  const text = (scene.text || "").replace(/\{CHILD_NAME\}/g, scene.heroName || "Kahraman");
  const words = text.split(/\s+/).filter(Boolean).length;
  const preset = AGE_PRESETS[ageGroup];

  // Kelime sayısı (sadece 0-3 icin limit)
  if (preset?.maxWordsPerScene && words > preset.maxWordsPerScene + 5) {
    issues.push({ type: "word_count", severity: "warning", message: `${words} kelime (max ${preset.maxWordsPerScene})` });
  }

  // İsim tekrarı
  const nameMatches = (scene.text || "").match(/\{CHILD_NAME\}/g) || [];
  const nameLimit = ageGroup === "0-3" ? 2 : 3;
  if (nameMatches.length > nameLimit) {
    issues.push({ type: "name_repetition", severity: "warning", message: `{CHILD_NAME} ${nameMatches.length} kez (max ${nameLimit})` });
  }

  // Her cümle için kontroller
  for (const s of splitSentences(text)) {
    if (checkDevrik(s)) {
      issues.push({ type: "devrik", severity: "warning", message: "Devrik cümle şüphesi", snippet: s.slice(0, 80) });
    }
    const forbidden = checkForbiddenWords(s);
    if (forbidden.length) {
      issues.push({ type: "forbidden_word", severity: "info", message: "Boş sıfat: " + forbidden.join(", "), snippet: s.slice(0, 80) });
    }
    const cliche = checkClicheStart(s);
    if (cliche) {
      issues.push({ type: "cliche_start", severity: "info", message: "Klişe başlangıç: " + cliche, snippet: s.slice(0, 80) });
    }
  }

  // Diyalog kontrolü (3-6, 6-9 için)
  if (ageGroup !== "0-3") {
    const hasDialog = /["'""']/.test(text) || /[""]/.test(text);
    if (!hasDialog) {
      issues.push({ type: "no_dialog", severity: "info", message: "Bu sahnede diyalog yok (önerilir)" });
    }
  }

  // Boş metin
  if (words < 5) {
    issues.push({ type: "too_short", severity: "error", message: `Çok kısa: ${words} kelime` });
  }

  return { ok: issues.length === 0, issues, wordCount: words, sentenceCount: splitSentences(text).length };
}

function validateStory(scenes, ageGroup, heroName) {
  const report = {
    sceneReports: [],
    total: { errors: 0, warnings: 0, infos: 0 },
  };
  for (const scene of scenes) {
    const r = validateScene({ ...scene, heroName }, ageGroup);
    report.sceneReports.push({ sceneNumber: scene.sceneNumber, title: scene.title, ...r });
    for (const i of r.issues) {
      if (i.severity === "error") report.total.errors++;
      else if (i.severity === "warning") report.total.warnings++;
      else report.total.infos++;
    }
  }
  return report;
}

function formatReport(report) {
  const lines = [];
  lines.push(`=== Story Validation Report ===`);
  lines.push(`Toplam: ${report.total.errors} hata, ${report.total.warnings} uyarı, ${report.total.infos} bilgi`);
  for (const sr of report.sceneReports) {
    if (sr.issues.length === 0) continue;
    lines.push(`\nSahne ${sr.sceneNumber} "${sr.title}" (${sr.wordCount} kelime):`);
    for (const i of sr.issues) {
      const icon = i.severity === "error" ? "❌" : i.severity === "warning" ? "⚠️" : "ℹ️";
      lines.push(`  ${icon} [${i.type}] ${i.message}${i.snippet ? " — \"" + i.snippet + "...\"" : ""}`);
    }
  }
  return lines.join("\n");
}

module.exports = {
  splitSentences, checkDevrik, checkForbiddenWords, checkClicheStart, countTurkishCharErrors,
  validateScene, validateStory, formatReport,
};
