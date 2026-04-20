/**
 * Masal — Ortak Prompt Fragmentları (Tek Kaynak)
 *
 * Bu dosya, writer + image promptlarında tekrar eden kuralları TEK YERDE tutar.
 * Prompt dosyalari bu fragmentlari require edip string olarak yapistirir.
 *
 * Faz 1 (pilot): Sadece fragment'lari export eder. Mevcut promptlar paralel calisir.
 * Migration ileride asamali yapilir.
 */

// ──────────────────────────────────────────────
// TÜRKÇE YAZIM KURALLARI (writer içi + polish pass)
// ──────────────────────────────────────────────
const CORE_TURKISH_RULES = `TÜRKÇE DİL KURALLARI (MUTLAK):
- DEVRİK CÜMLE YASAK. Özne önce + diğer ögeler + yüklem sonda. Örnek: "Deniz kenarında Toprak yürüyordu" YANLIŞ → "Toprak, deniz kenarında yürüyordu" DOĞRU.
- Noktalama tam (virgül, nokta, tırnak, ünlem). Diyalog tırnak içinde.
- Ünsüz yumuşaması + ünlü uyumu + ekler doğru ("kitabın" DEĞİL "kitap'ın").
- "de/da", "ki", "mi" ayrı/birleşik kuralına uy.
- Yabancı kelime + eğreti çeviri yok ("bir şekilde", "tam olarak" gibi).`;

// ──────────────────────────────────────────────
// KALİTE / YAZARLIK KURALLARI
// ──────────────────────────────────────────────
const CORE_QUALITY_RULES = `YAZARLIK KALİTESİ:
- SHOW, DON'T TELL. "Üzüldü" demeden "gözleri doldu, parmağıyla yaprağı çizdi".
- Her sahnede EN AZ BİR somut duyusal detay (ses, koku, dokunuş, ısı).
- Her sahnede EN AZ BİR canlı replik (diyalog).
- YASAK SIFATLAR: "harika", "mükemmel", "muhteşem", "çok güzel" — yerine somut detay.
- TEKRAR YASAK: "bir anda", "aniden", "o sırada" başlangıç tekrarı.
- Pazarlama/reklam dili + dogmatik nutuk YASAK.`;

// ──────────────────────────────────────────────
// KARAKTER YÜZ KILITLEME (image prompts)
// ──────────────────────────────────────────────
const CORE_FACE_LOCK = `KARAKTER YÜZ KİLİDİ:
- Yüz, saç rengi, saç TEXTURE (düz/kıvırcık/dalgalı — aynen koru; düzü kıvırcığa, kıvırcığı düze ÇEVİRME), saç uzunluğu, saç stili, gözlük, tenin rengi referans fotoğrafla AYNI olmalı.
- Gözlük varsa HER sahnede gözlük. Aksesuarlar (saç tokası, küpe) korunmalı.
- Karakter Pixar-tarzı 3D ama yüz geometrisi fotoğrafla birebir.`;

// ──────────────────────────────────────────────
// SAHNE KAMERA ÇERÇEVELEME (image prompts)
// ──────────────────────────────────────────────
const CORE_SCENE_FRAMING = `KAMERA ÇERÇEVELEME:
- Wide shot; karakter frame'in %30-40'ı; ortam dominant.
- Kitap boyunca tutarlı (bir sahnede yakın plan başka sahnede çok uzak YOK).
- Kompozisyon: foreground (yakın obje, hafif blur) + midground (karakter aksiyon pozu) + background (ortam yumuşak focus).`;

// ──────────────────────────────────────────────
// TÜRKÇE TIPOGRAFI (kapak, başlık görselleri)
// ──────────────────────────────────────────────
const CORE_TURKISH_TYPOGRAPHY = `TÜRKÇE KARAKTER TİPOGRAFİSİ:
- ı İ ş ç ğ ö ü — EXACT harfleri koru. ASCII karşılığa çevirme.
- ALL CAPS YASAK (Türkçe büyük harf okumayı zorlaştırır). Mixed case.
- Bir kelime içinde tek renk; kelimeden kelimeye renk değişebilir ama harf bazında değil.
- Her harf tam okunur olmalı, obje/prop ile kapanmasın.`;

// ──────────────────────────────────────────────
// YAŞ BANDI PRESETLERİ
// ──────────────────────────────────────────────
const AGE_PRESETS = {
  "0-3": {
    sceneCount: 10,
    maxWordsPerScene: 14,
    style: "Bebek için ritmik tekrar, duyusal dil, ses kelimeleri (cıvıl cıvıl, hop). Tek basit olay per sahne.",
    vocab: "500-700 günlük kelime. Soyut yok.",
    acts: "Basit: başlangıç → karşılaşma → mutlu son.",
  },
  "3-6": {
    sceneCount: 14,
    maxWordsPerScene: null, // Dogal uzunluk
    style: "3-9 yas birlesik: dunya klasigi cocuk edebiyati tonu. Ic catisma, karakter gelisimi, diyalog+betimleme dengesi.",
    vocab: "Zengin Türkçe. Metafor, benzetme serbest (basit kalsın).",
    acts: "Tam 3-act: setup → engeller + denemeler + ic catisma → climax + resolution.",
  },
  "6-9": {
    sceneCount: 14,
    maxWordsPerScene: null,
    style: "Dunya klasigi cocuk edebiyati (Behiç Ak, Sara Şahinkanat, Feridun Oral dokusu). Ic monolog + duyusal betimleme.",
    vocab: "Zengin Türkçe. Metafor, benzetme, deyim serbest.",
    acts: "Tam 3-act + alt-plot. Climax'ta karakter donusumu.",
  },
};

// ──────────────────────────────────────────────
// FORBIDDEN WORDS (validator + polish pass)
// ──────────────────────────────────────────────
const FORBIDDEN_WORDS = [
  "harika", "mükemmel", "muhteşem", "çok güzel", "şahane",
  "süper", "muazzam", "olağanüstü",
];

const CLICHE_STARTS = [
  "bir anda", "aniden", "o sırada", "tam o anda",
];

// ──────────────────────────────────────────────
// BRAND CONVENTIONS (MasalSensin marka kuralları — UrunStudio'dan port)
// Hem text hem image promptlarında uygulanır
// ──────────────────────────────────────────────

// Marka tabanlı yasaklı kelimeler — "sihir/büyü/mucize" diline asla başvurma.
// Bunlar yerine yere basan duygusal kelimeler kullan: kalp, hayal, kıvılcım, ışık, yıldız.
const BRAND_FORBIDDEN_VOCAB = [
  "sihir", "sihirli", "büyü", "büyülü", "büyülenmiş",
  "mucize", "mucizevi", "tılsım", "tılsımlı",
];

const BRAND_VOCAB_RULE = `MASALSENSIN MARKA SÖZLÜK KURALI (MUTLAK):
- "sihir", "sihirli", "büyü", "büyülü", "mucize", "mucizevi", "tılsım" KELİMELERİ YASAK.
- Bunların yerine: "ışık", "yıldız", "kıvılcım", "hayal", "kalp", "rüya", "fısıltı" gibi yere basan kelimeler kullan.
- Hikaye ne kadar fantastik olursa olsun "büyü" demek MARKA TONUNU bozar.`;

const BRAND_PALETTE_RULE = `MASALSENSIN GÖRSEL PALETI:
- Birincil: warm chocolate brown (#3E2723 / #4E342E)
- Vurgu: burnt orange (#D17A2C / #BF360C / #E65100)
- Yumuşak: cream / honey / dusty rose (#F5EFE6 / #FBF6EC / #E8927C)
- Aksan: warm gold foil (#D4A574)
- Tipografi: warm hand-lettered serif (Fraunces / Recoleta / Playfair Display dokusu)
- ALL CAPS yasak (Türkçe okumayı bozar). Mixed case ve italic vurgu kullan.`;

const BRAND_SEAL_RULE = `KIŞIYE ÖZEL ALTIN MÜHÜR (gold seal):
- Konum: BOTTOM-LEFT corner (kapaklarda BOTTOM-RIGHT da olabilir)
- Boyut: ~12-18% frame width
- Renk: gold foil (#D4A574) emboss effect
- İçerik: "Bu kitap [İSİM] için özel olarak üretilmiştir" (ya da kısa varyantı "Bu kitap [İSİM] için")
- Üretim teması (kitap, kalp, yıldız) ile uyumlu küçük ikon merkezde`;

const BRAND_LOGO_RULE = `MASALSENSIN LOGO KULLANIMI:
- Ref olarak masalsensin-logo.jpg verildiyse PIXEL-EXACT yeniden üret (kale + açık storybook + tüy + "Masalsensin" wordmark).
- Logo'yu yeniden çizmeye/yeniden tasarlamaya KALKMA.
- Genelde back cover footer veya inner cover'da kullanılır.`;

// Tek satırda kullanmak için kompakt versiyonlar (uzun promptlarda)
const BRAND_INLINE = `Brand: warm chocolate brown serif typography, gold foil seal "Bu kitap [name] için" bottom-left, NO "sihir/büyü/mucize" wording (use "ışık/kıvılcım/hayal/yıldız" instead), Türkçe diakritik (ş ç ğ ü ö ı İ) PERFECT, ALL CAPS yasak.`;

module.exports = {
  CORE_TURKISH_RULES,
  CORE_QUALITY_RULES,
  CORE_FACE_LOCK,
  CORE_SCENE_FRAMING,
  CORE_TURKISH_TYPOGRAPHY,
  AGE_PRESETS,
  FORBIDDEN_WORDS,
  CLICHE_STARTS,
  BRAND_FORBIDDEN_VOCAB,
  BRAND_VOCAB_RULE,
  BRAND_PALETTE_RULE,
  BRAND_SEAL_RULE,
  BRAND_LOGO_RULE,
  BRAND_INLINE,
};
