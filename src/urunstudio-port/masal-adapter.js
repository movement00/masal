// Masal bookData → UrunStudio concept shape adapter.
// Centralizes the fakeConcept build so cover/back-cover/note generation
// share identical inputs between book-orchestrator and page-regenerator.
//
// Also applies two critical guards:
//   F1: iconic-scene selector — picks the scene whose title+text best matches
//       the book title keywords, places it first in sahneler so UrunStudio
//       coverAgent's implicit "sahneler[0] = iconic beat" contract holds.
//   F4: title prefix sanity-strip — removes any "Name:" / "Name —" prefix
//       that may have leaked in, so it can't get echoed back into the cover.

const UStudioCategories = require("./categories");

const TURKISH_STOPWORDS = new Set([
  "ve", "ile", "bir", "bu", "su", "şu", "o", "icin", "için",
  "de", "da", "ki", "mi", "mu", "ne", "ama", "fakat", "veya",
  "gibi", "ama", "en", "her", "hem", "ya", "ki",
]);

// Remove Turkish diacritics for fuzzy word comparison.
function _deacc(s) {
  if (!s) return "";
  return String(s).toLowerCase()
    .replace(/ı/g, "i").replace(/İ/g, "i")
    .replace(/ş/g, "s").replace(/Ş/g, "s")
    .replace(/ç/g, "c").replace(/Ç/g, "c")
    .replace(/ğ/g, "g").replace(/Ğ/g, "g")
    .replace(/ü/g, "u").replace(/Ü/g, "u")
    .replace(/ö/g, "o").replace(/Ö/g, "o");
}

// Strip Turkish possessive / genitive suffixes to get the word stem.
// Handles: 'nın/nin/nun/nün/ın/in/un/ün/'nın/'nin... and 's/'si/'sı/'su/'sü
// Good enough for keyword matching — NOT a full morphology analyzer.
function _stem(word) {
  if (!word) return "";
  let w = _deacc(word).replace(/['’]/g, "");
  // Drop common suffixes from longest to shortest
  const suffixes = [
    "lerinin", "larinin", "lerini", "larini", "lerden", "lardan",
    "leri", "lari", "lere", "lara", "lerde", "larda",
    "nin", "nun", "nun", "nun", "nin", "nun", "nun",
    "sin", "sun", "sun", "sin",
    "in", "un", "un", "in",
    "si", "su", "su", "si",
    "e", "a", "i", "u",
  ];
  for (const suf of suffixes) {
    if (w.length > suf.length + 2 && w.endsWith(suf)) {
      w = w.slice(0, -suf.length);
      break;
    }
  }
  return w;
}

// Extract meaningful content words from a title string.
// Drops the child's name token, Turkish stopwords, and short tokens.
function _titleKeywords(title, childName) {
  if (!title) return [];
  const nameStem = _stem(childName || "");
  return String(title)
    .split(/[\s\-—:'’]+/)
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => _stem(t))
    .filter(t => t.length >= 3)
    .filter(t => !TURKISH_STOPWORDS.has(t))
    .filter(t => !nameStem || t !== nameStem);
}

// F1: score a scene by how many title keywords appear in its title+text.
function _scoreScene(scene, keywords) {
  if (!scene || keywords.length === 0) return 0;
  const hay = _deacc((scene.title || "") + " " + (scene.text || ""));
  let hits = 0;
  for (const kw of keywords) {
    if (!kw) continue;
    // word-boundary-ish match on the deaccented haystack
    const re = new RegExp("\\b" + kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    if (re.test(hay)) hits += 1;
  }
  return hits;
}

// F1: reorder scenes so the iconic (best-title-match) scene is first.
// Ties → keep original order among tied scenes. Zero matches → original order.
function pickIconicScenesFirst(scenes, title, childName, limit = 6) {
  const arr = Array.isArray(scenes) ? scenes.slice(0, 14) : [];
  if (arr.length <= 1) return arr.slice(0, limit);
  const keywords = _titleKeywords(title, childName);
  if (keywords.length === 0) return arr.slice(0, limit);
  const scored = arr.map((s, i) => ({ s, i, score: _scoreScene(s, keywords) }));
  const topScore = Math.max(...scored.map(x => x.score));
  if (topScore === 0) return arr.slice(0, limit);
  // Best-scoring scene first (earliest index among ties), then the rest in original order
  scored.sort((a, b) => (b.score - a.score) || (a.i - b.i));
  const best = scored[0];
  const rest = arr.filter((_, i) => i !== best.i);
  return [best.s, ...rest].slice(0, limit);
}

// F4: strip a leading "Name:" / "Name —" / "Name -" prefix from the title.
// These are hallucinated prefixes that sometimes leak from upstream cover renders
// getting re-personalized through import-concept. The book title should stand alone.
function stripNamePrefix(title, childName) {
  if (!title || !childName) return title;
  const t = String(title);
  const n = childName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // matches "Name:", "Name —", "Name -", "Name's" prefix at start (case-insensitive)
  const re = new RegExp("^\\s*" + n + "\\s*['’]?\\s*[:\\-—]\\s+", "i");
  return t.replace(re, "").trim();
}

// Main entry: build the concept shape UrunStudio agents expect from masal bookData.
//
// @param bookData  - masal book.json structure
// @param childInfo - { age, gender, senderName, ... }
// @param opts      - { childName?: string, sceneLimit?: number }
// @returns concept — { baslik, kahraman, ozet, sahneler, kazanimlar, yasGrubu, mood }
function buildFakeConcept(bookData, childInfo, opts = {}) {
  const childName = opts.childName || childInfo?.childName || childInfo?.name || "";
  const limit = opts.sceneLimit || 6;

  const rawTitle = bookData.title || "";
  const cleanedTitle = stripNamePrefix(rawTitle, childName);

  const orderedScenes = pickIconicScenesFirst(bookData.scenes || [], cleanedTitle, childName, limit);
  const sahneler = orderedScenes.map(s => {
    const title = (s.title || "").trim();
    const text = (s.text || "").slice(0, 180);
    return title ? `${title} — ${text}` : text;
  });

  const genderTr = (childInfo?.gender === "kiz" || childInfo?.childGender === "kiz") ? "kız" : "erkek";
  const age = parseInt(childInfo?.age || childInfo?.childAge || 5, 10) || 5;

  // Sender bilgileri — not sayfasi icin kesin secim yapilmasi lazim.
  const senderGender = (childInfo?.senderGender || "").toLowerCase();
  const giftSenderRelation = (childInfo?.giftSenderRelation || "").toLowerCase();
  const senderName = childInfo?.giftSenderName || childInfo?.senderName || "";

  return {
    baslik: cleanedTitle,
    kahraman: {
      isim: childName,
      yas: age,
      cinsiyet: genderTr,
      fizikselOzellikler: bookData.characterDescription?.base || "Turkish child from reference photo",
      kiyafet: bookData.outfit?.description || "age-appropriate casual clothes",
    },
    ozet: bookData.description || "",
    sahneler,
    kazanimlar: bookData.lessons || [],
    yasGrubu: bookData.ageGroup || "3-6",
    mood: bookData.theme?.icon || "warm",
    // Customer-provided sender info (for deterministic sender note selection)
    gonderen: {
      ad: senderName,
      cinsiyet: senderGender,          // "kadin" | "erkek" | ""
      iliski: giftSenderRelation,      // "Anne" | "Baba" | "Teyze" | "Dayı" | ...
    },
  };
}

// Resolve a UrunStudio Category object from a masal category id, with a safe fallback.
function resolveCategory(categoryId) {
  return UStudioCategories.find(c => c.id === categoryId) || {
    id: categoryId, group: "hikaye", name: categoryId || "hikaye",
    visualStyle: "pixar-3d", moodKeywords: [],
  };
}

module.exports = {
  buildFakeConcept,
  resolveCategory,
  pickIconicScenesFirst,
  stripNamePrefix,
};
