/**
 * MASALSENSIN KATEGORI KATALOGU
 *
 * UrunStudio'daki categories.ts'ten port edilmistir. Kategori ekleme/cikarma
 * yapildiginda hem UrunStudio hem Masal app'te ayni anda guncellenmelidir.
 *
 * Bu modul, sayfa formati seciminde (meslek diploma vs hikaye not vs boyama
 * sertifika) ve fulfilment akisinda book.json template seciminde kullanilir.
 *
 * Kullanim:
 *   const { getCategoryById, getPageFormat } = require("./rules/categories");
 *   const cat = getCategoryById(bookData.category);
 *   if (getPageFormat(cat).hasDiploma) { ... }
 */

// CategoryGroup: "hikaye" | "boyama" | "ozel-gun"

const CATEGORIES = [
  // ═══ HIKAYE KITAPLARI — YAS BAZLI (3D Pixar) ═══
  {
    id: "bebek-masallari",
    group: "hikaye",
    groupLabel: "Hikaye Kitaplari",
    name: "Bebek Masallari",
    description: "1-3 yas bebekler icin basit, sevgi dolu masallar — hayvan, renk, aile, uyku, duyusal kesif",
    ageRange: "1-3",
    visualStyle: "pixar-3d",
    emoji: "\uD83C\uDF7C",
    moodKeywords: ["tatli", "sevgi", "basit", "hayvan", "aile", "uyku", "duyusal"],
  },
  {
    id: "okul-oncesi-masallari",
    group: "hikaye",
    groupLabel: "Hikaye Kitaplari",
    name: "Okul Oncesi Masallari",
    description: "3-6 yas anaokulu cagi icin hayal gucu, arkadaslik, basit macera, duygu ogrenme",
    ageRange: "3-6",
    visualStyle: "pixar-3d",
    emoji: "\uD83E\uDDF8",
    moodKeywords: ["hayal", "arkadaslik", "merak", "basit macera", "duygu"],
  },
  {
    id: "ilkokul-masallari",
    group: "hikaye",
    groupLabel: "Hikaye Kitaplari",
    name: "Ilkokul Masallari",
    description: "6-10 yas ilkokul cagi icin heyecanli macera, cesaret, dostluk, ogrenme",
    ageRange: "6-10",
    visualStyle: "pixar-3d",
    emoji: "\uD83D\uDCDA",
    moodKeywords: ["macera", "cesaret", "dostluk", "kesif", "ogrenme", "gercek hayat"],
  },

  // ═══ BOYAMA KITAPLARI ═══
  {
    id: "ilk-renkler",
    group: "boyama",
    groupLabel: "Boyama Kitaplari",
    name: "Ilk Renkler",
    description: "Basit, buyuk, boyamasi kolay sahneler",
    ageRange: "2-5",
    visualStyle: "coloring-simple",
    emoji: "\uD83D\uDD8D\uFE0F",
    moodKeywords: ["basit", "buyuk sekiller", "sevimli", "temel"],
  },
  {
    id: "renk-ustalari",
    group: "boyama",
    groupLabel: "Boyama Kitaplari",
    name: "Renk Ustalari",
    description: "Detayli, karmasik boyama sayfalari",
    ageRange: "6-10",
    visualStyle: "coloring-detailed",
    emoji: "\uD83C\uDFA8",
    moodKeywords: ["detayli", "karmasik", "yaratici", "zorlayici"],
  },

  // ═══ OZEL GUN HEDIYELERI ═══
  {
    id: "dogum-gunu",
    group: "ozel-gun",
    groupLabel: "Ozel Gun Hediyeleri",
    name: "Dogum Gunu",
    description: "Dogum gunu kutlamasi temali ozel kitap",
    ageRange: "3-12",
    visualStyle: "gift-emotional",
    emoji: "\uD83C\uDF82",
    moodKeywords: ["kutlama", "neseli", "pasta", "hediye", "surpriz"],
  },
  {
    id: "anneler-gunu",
    group: "ozel-gun",
    groupLabel: "Ozel Gun Hediyeleri",
    name: "Anneler Gunu",
    description: "Anneye sevgi ve tesekkur temali",
    ageRange: "3-12",
    visualStyle: "gift-emotional",
    emoji: "\uD83D\uDC90",
    moodKeywords: ["sevgi", "anne", "tesekkur", "sicak", "duygusal"],
  },
  {
    id: "babalar-gunu",
    group: "ozel-gun",
    groupLabel: "Ozel Gun Hediyeleri",
    name: "Babalar Gunu",
    description: "Babaya sevgi ve paylasim temali",
    ageRange: "3-12",
    visualStyle: "gift-emotional",
    emoji: "\uD83D\uDC68\u200D\uD83D\uDC67",
    moodKeywords: ["baba", "paylasim", "guc", "sevgi", "kahraman"],
  },
  {
    id: "mezuniyet",
    group: "ozel-gun",
    groupLabel: "Ozel Gun Hediyeleri",
    name: "Mezuniyet",
    description: "Basari ve yeni donem hediyesi",
    ageRange: "5-18",
    visualStyle: "gift-emotional",
    emoji: "\uD83C\uDF93",
    moodKeywords: ["basari", "gurur", "kep", "diploma", "yolculuk"],
  },
  {
    id: "sevgililer-gunu",
    group: "ozel-gun",
    groupLabel: "Ozel Gun Hediyeleri",
    name: "Sevgililer Gunu",
    description: "Sevgi ve romantik duygu temali",
    ageRange: "0-99",
    visualStyle: "gift-emotional",
    emoji: "\uD83D\uDC9D",
    moodKeywords: ["sevgi", "kalp", "romantik", "tatli", "sicak"],
  },
  {
    id: "23-nisan",
    group: "ozel-gun",
    groupLabel: "Ozel Gun Hediyeleri",
    name: "23 Nisan",
    description: "23 Nisan Ulusal Egemenlik ve Cocuk Bayrami temali",
    ageRange: "4-12",
    visualStyle: "pixar-3d",
    emoji: "\uD83C\uDDF9\uD83C\uDDF7",
    moodKeywords: ["bayram", "coscu", "Ataturk", "cocuk", "bayrak", "gurur", "senlik"],
  },
  {
    id: "evlilik-teklifi",
    group: "ozel-gun",
    groupLabel: "Ozel Gun Hediyeleri",
    name: "Evlilik Teklifi",
    description: "Ozel evlilik teklifi ani icin",
    ageRange: "18+",
    visualStyle: "gift-emotional",
    emoji: "\uD83D\uDC8D",
    moodKeywords: ["romantik", "yuzuk", "soz", "ozel", "duygusal"],
  },

  // ═══ MESLEK HIKAYELERI ═══
  {
    id: "meslek-hikayeleri",
    group: "hikaye",
    groupLabel: "Hikaye Kitaplari",
    name: "Meslek Hikayeleri",
    description: "Hayalindeki meslegi yasa — astronot, doktor, pilot, futbolcu vb. Uniformuyla, is yeriyle, ilk gununle kahramansin.",
    ageRange: "4-10",
    visualStyle: "pixar-3d",
    emoji: "\uD83C\uDFAF",
    moodKeywords: ["hayal", "meslek", "gurur", "kesif", "gelecek", "cesaret", "ilk gun"],
  },

  // ═══ YENI KARDES HIKAYELERI ═══
  {
    id: "yeni-kardes-hikayeleri",
    group: "hikaye",
    groupLabel: "Hikaye Kitaplari",
    name: "Yeni Kardes Hikayeleri",
    description: "Abla veya Agabey olmaya hazirlanan cocuga yepyeni rolunu sevgiyle tanitan kisiye ozel kitap.",
    ageRange: "2-5",
    visualStyle: "pixar-3d",
    emoji: "\uD83D\uDC76",
    moodKeywords: ["kardes", "abla", "agabey", "sevgi", "koruyucu", "sabir", "yeni rol"],
  },

  // ═══ HAYVAN DOSTUM ═══
  {
    id: "hayvan-dostum",
    group: "hikaye",
    groupLabel: "Hikaye Kitaplari",
    name: "Hayvan Dostum",
    description: "1-3 yas toddler icin ilk hayvan dostu temasi — sevgi, sorumluluk, nezaket ve arkadaslik.",
    ageRange: "1-3",
    visualStyle: "pixar-3d",
    emoji: "\uD83D\uDC3E",
    moodKeywords: ["hayvan", "dostluk", "sorumluluk", "sevgi", "nezaket", "bebek"],
  },

  // ═══ GUNLUK DEGERLER EGITIMI ═══
  {
    id: "gunluk-degerler-egitimi",
    group: "hikaye",
    groupLabel: "Hikaye Kitaplari",
    name: "Gunluk Degerler Egitimi",
    description: "Zamaninda uyuma, yemek, temizlik, duzen ve saygi — cocugun gunun altin kurallarini kendi adiyla yasayarak ogrendigi pedagojik kitap.",
    ageRange: "3-6",
    visualStyle: "pixar-3d",
    emoji: "\uD83C\uDF1F",
    moodKeywords: ["gunluk rutin", "disiplin", "sorumluluk", "oz-bakim", "duzen", "saygi"],
  },

  // ═══ DUYGU KONTROLLERI ═══
  {
    id: "duygu-kontrolleri",
    group: "hikaye",
    groupLabel: "Hikaye Kitaplari",
    name: "Duygu Kontrolleri",
    description: "Ofke, korku, uzuntu, kiskanclik, kaygi — cocugun kendi duygularini taniyip saglikla yonetmeyi ogrendigi duygusal zeka kitabi.",
    ageRange: "3-8",
    visualStyle: "pixar-3d",
    emoji: "\uD83D\uDC97",
    moodKeywords: ["duygu", "ofke", "korku", "uzuntu", "kiskanclik", "kaygi", "oz-farkindalik", "duygusal zeka"],
  },
];

const CATEGORY_GROUPS = [
  { id: "hikaye", label: "Hikaye Kitaplari", emoji: "\uD83D\uDCDA" },
  { id: "boyama", label: "Boyama Kitaplari", emoji: "\uD83C\uDFA8" },
  { id: "ozel-gun", label: "Ozel Gun Hediyeleri", emoji: "\uD83C\uDF81" },
];

/**
 * Kategori ID'sinden kategori obje getirir.
 */
function getCategoryById(id) {
  return CATEGORIES.find((c) => c.id === id) || null;
}

function getCategoriesByGroup(group) {
  return CATEGORIES.filter((c) => c.group === group);
}

/**
 * Kategoriye gore sayfa formati ozellikleri.
 * Orchestrator ve pdf-builder bu bilgiyi kullanarak ozel sayfalari koyar/atlar.
 */
function getPageFormat(category) {
  if (!category) {
    return {
      hasDiploma: false,
      hasCertificate: false,
      noteStyle: "vintage-warm",
      backCoverStyle: "kazanim-grid",
      coverStyle: "pixar-cinematic",
    };
  }
  const id = category.id;
  return {
    // Meslek hikayeleri ozel diploma sayfasi alir (UrunStudio buildMeslekDiplomaPage muadili)
    hasDiploma: id === "meslek-hikayeleri",
    // Boyama kategorileri "Tamamlandi Sertifikasi" alir (mevcut akis)
    hasCertificate: category.group === "boyama",
    // Not (sender note) tarzi: kategoriye gore stationery aesthetic degisir
    noteStyle:
      id === "yeni-kardes-hikayeleri" ? "soft-baby-nursery" :
      id === "hayvan-dostum" ? "soft-baby-nursery" :
      id === "bebek-masallari" ? "soft-baby-nursery" :
      id === "anneler-gunu" ? "watercolor-floral" :
      id === "babalar-gunu" ? "vintage-craft" :
      id === "23-nisan" ? "festive-flag" :
      "vintage-warm",
    // Arka kapak duzeni
    backCoverStyle:
      category.group === "boyama" ? "boyama-skillbox" :
      id === "meslek-hikayeleri" ? "meslek-diploma-peek" :
      "kazanim-grid",
    // On kapak duzeni
    coverStyle:
      category.group === "boyama" ? "boyama-pixar-with-badge" :
      "pixar-cinematic",
  };
}

/**
 * Tum kategori id'lerinin liste hali (validation ve UI dropdown icin).
 */
function getAllCategoryIds() {
  return CATEGORIES.map((c) => c.id);
}

module.exports = {
  CATEGORIES,
  CATEGORY_GROUPS,
  getCategoryById,
  getCategoriesByGroup,
  getPageFormat,
  getAllCategoryIds,
};
