/**
 * seoAgent.js — Node port of
 *   MasalSensinUrunStudio/src/services/seoAgent.ts
 *
 * 1:1 functional parity. No added features.
 *
 * Exports:
 *   - generateSeoContent(concept, category) -> SeoContent JSON
 */

const { generateText, Type } = require("./geminiClient");

/**
 * @param {object} concept — BookConcept
 * @param {object} category — { id, name, group, groupLabel, description }
 * @returns {Promise<object>} SeoContent
 */
async function generateSeoContent(concept, category) {
  const prompt = `Sen Türkiye'deki e-ticaret siteleri için SEO uzmanı bir metin yazarısın. MasalSensin adlı kişiye özel çocuk kitabı markası için ürün sayfası içeriği üreteceksin.

ÜRÜN BİLGİSİ:
- Kitap Başlığı: ${concept.baslik}
- Kategori: ${category.name} (${category.groupLabel})
- Açıklama: ${category.description}
- Kahraman: ${concept.kahraman.isim} (${concept.kahraman.yas} yaşında)
- Yaş Grubu: ${concept.yasGrubu}
- Mood: ${concept.mood}
- Özet: ${concept.ozet}
- Sahneler: ${concept.sahneler.join(", ")}
- Kazanımlar: ${concept.kazanimlar.join(", ")}

GÖREV: Aşağıdaki JSON formatında TÜRKÇE SEO içeriği üret.

ÖNEMLİ KURALLAR:
- Türkçe karakterler MUTLAKA doğru: ş, ğ, ü, ö, ç, ı, İ
- Duygusal ama gerçekçi ton (ebeveyn-ebeveyn konuşması)
- SEO dostu ama doğal
- Ebeveynler VE hediye alıcıları (büyükanne, teyze) için
- Çocuğun NE kazandığını vurgula
- "Kişiye özel" unique value prop
- Uzun açıklama HTML formatında (p, ul, li, strong, h3)

═══ E-E-A-T (Experience, Expertise, Authoritativeness, Trust) — 2025 KRİTİK ═══
Google'ın YMYL-adjacent (çocuk eğitim) içerik için E-E-A-T sinyalleri:
- "Experience" (Deneyim): uzunAciklama'da gerçek anne-baba deneyimi tonu — birinci/ikinci tekil şahıs ("Çocuğunuz adını duyduğu an gözlerinin parladığını göreceksiniz...")
- "Expertise" (Uzmanlık): kazanımlar erken çocukluk gelişimi temellerine yaslansın (benlik, sosyal-duygusal gelişim, dil edinimi, hayal gücü)
- "Authoritativeness" (Yetki): MasalSensin ekibinin uzman tonu (illüstrasyon kalitesi, baskı standartı, telif hakları)
- "Trust" (Güven): iade/garanti, fotoğraf güvenliği, kişisel veri koruma faq'ta net belirtilsin

═══ SEMANTIC SEO — TOPIC CLUSTER ═══
Tek keyword stuffing değil, TOPIC CLUSTER:
- Ana topic: "kişiye özel çocuk kitabı"
- İlişkili semantic terms (uzunAciklama'da DOĞAL geçsin, NLP entities): kahraman, isim, fotoğraf, illüstrasyon, hediye, doğum günü, yaş grubu, okuma alışkanlığı, hayal gücü, benlik gelişimi, dil edinimi
- Long-tail: "[isim] için kişiye özel masal", "3 yaş kişiselleştirilmiş kitap", "çocuğun adını taşıyan hediye kitabı"

═══ KEYWORD INTENT AYRIMI (2025 best practice) ═══
İki farklı keyword cluster'ı karıştırma:
- TRANSACTIONAL (satın alma niyeti — uzunAciklama ve kisaAciklama'ya doğal şekilde serpiştir):
  "kişiye özel çocuk kitabı", "isimli çocuk kitabı", "adına özel kitap", "kişiselleştirilmiş kitap", "çocuk kitabı sipariş", "doğum günü hediyesi çocuk", "Anneler Günü hediyesi", "Yılbaşı hediyesi çocuk"
- INFORMATIONAL (bilgi arama — FAQ cevaplarında kullan):
  "kaç yaşında kitap okunur", "çocuğa nasıl kitap okunur", "çocuk gelişimi kitap", "çocuğa en iyi hediye", "isim duymanın benlik gelişimine etkisi"
- COMMERCIAL INVESTIGATION (karşılaştırma — "neden bu kitap" bölümünde):
  "kişiye özel kitap karşılaştırma", "en iyi kişiye özel çocuk kitabı", "Wonderbly Türkiye alternatifi"

═══ PASSAGE-RANKING ANCHOR (h3 self-containment) ═══
uzunAciklama'daki her <h3> bölümü, o başlığı arayan birine TEK BAŞINA yeterli cevap vermeli. Google passage indexing için her paragraf bağımsız ranklayabilmeli.

═══ FAQ PEOPLE-ALSO-ASK FORMATI ═══
5 FAQ sorusu Google PAA formatında olmalı — Türk ebeveynlerin gerçekten yazdığı sorgu kalıpları:
- "Kişiye özel çocuk kitabı nasıl hazırlanır?"
- "[İsim] için kitap ne kadar sürede hazır olur?"
- "Kaç yaşında çocuğa kişiye özel kitap alınır?"
- "Kişiye özel kitap hediye olarak uygun mu?"
- "Çocuğun fotoğrafı kitapta nasıl kullanılıyor?"
Gibi — jenerik pazarlama değil, GERÇEK arama sorgusu kelime yapısında.

═══ HEDİYE PERSONA (%60 alıcı hediye için) ═══
"hediyeOlarak" alanı mutlaka "doğum günü", "Anneler/Babalar Günü", "Yılbaşı", "23 Nisan" gibi occasion keyword'lerinden EN AZ 2 tanesini içermeli. Büyükanne/hala/teyze perspektifinden yazılmalı.

═══ SLUG FORMAT ═══
slug: sadece küçük harf, tire ayraç, Türkçe karakter yok, 3-5 kelime, ana keyword içersin.
Örnek: "zeynep-isimli-kisiye-ozel-cocuk-kitabi" (GOOD) — "zeynep-kitap" (çok kısa) — "zeynep-uzay-macerasi-hediye-kitabi-pixar-3d" (çok uzun)

URUN BAŞLIĞI FORMATI:
"${concept.baslik} - ${category.name} Çocuk Kitabı - MasalSensin" (70 karakter altı)

META DESCRIPTION: Maks 155 karakter, call-to-action içersin

UZUN AÇIKLAMA YAPISI:
<p>Duygusal hook (2-3 cümle)</p>
<p>Hikaye tanıtımı</p>
<h3>Bu Kitap Çocuğunuza Ne Kazandırır?</h3>
<ul>
  <li><strong>[Kazanım]:</strong> Açıklama</li>
</ul>
<h3>Kitap Özellikleri</h3>
<ul>
  <li>A4 yumuşak kapak</li>
  <li>Renkli Pixar kalitesinde illüstrasyonlar</li>
  <li>Kişiye özel isim ve fotoğraf entegrasyonu</li>
</ul>
<p>Hediye/urgency mesajı</p>

EK ALANLAR:
- altTexts: Her görsel için SEO uyumlu Türkçe alt text (8 adet: realPhoto, frontCover, backCover, hookLifestyle, transformation, flatLay, notePage, coverDuo).
  Her alt text Google Image Search dostu olmalı: kahraman adı + ürün konsepti + temel benefit/keyword. Max 125 karakter. Keyword stuffing YOK.
  Her alt text BİREBİR farklı olsun (duplicate alt = SEO cezası). 5W+1H formatı önerilir: kim+ne+nerede+nasıl.
  Örnekler:
  • realPhoto: "Çocuğun gerçek fotoğrafı — Ada için kişiye özel masal kahramanına dönüştürülecek"
  • frontCover: "Ada'nın Kayıp Renkleri kişiye özel çocuk kitabı ön kapağı, Pixar 3D illüstrasyon"
  • backCover: "Ada isimli kitabın arka kapağı — duygusal düzenleme + proaktif problem çözme kazanımları"
  • hookLifestyle: "Ada uyumadan önce kendi adının yazılı olduğu masalı okurken — bedtime reading anı"
  • coverDuo: "Ada'nın kişiye özel kitabı ön ve arka kapak birlikte — magazine format A4 paperback"
- faq: 5 adet sık sorulan soru + cevap (SSS / FAQ) — Türkçe, doğal, müşteri odaklı
- slug: URL-friendly handle önerisi (küçük harf, tire ile, Türkçe karakter yok — ör: "zeynep-uzay-macerasi")

SADECE JSON döndür.`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      urunBasligi: { type: Type.STRING },
      metaDescription: { type: Type.STRING },
      kisaAciklama: { type: Type.STRING },
      uzunAciklama: { type: Type.STRING },
      anahtarKelimeler: { type: Type.ARRAY, items: { type: Type.STRING } },
      kazanimlar: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            baslik: { type: Type.STRING },
            aciklama: { type: Type.STRING },
          },
          required: ["baslik", "aciklama"],
        },
      },
      nedenBuKitap: { type: Type.STRING },
      hediyeOlarak: { type: Type.STRING },
      altTexts: {
        type: Type.OBJECT,
        properties: {
          realPhoto: { type: Type.STRING },
          frontCover: { type: Type.STRING },
          backCover: { type: Type.STRING },
          hookLifestyle: { type: Type.STRING },
          transformation: { type: Type.STRING },
          flatLay: { type: Type.STRING },
          notePage: { type: Type.STRING },
          coverDuo: { type: Type.STRING },
        },
        required: [
          "realPhoto",
          "frontCover",
          "backCover",
          "hookLifestyle",
          "transformation",
          "flatLay",
          "notePage",
          "coverDuo",
        ],
      },
      faq: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            soru: { type: Type.STRING },
            cevap: { type: Type.STRING },
          },
          required: ["soru", "cevap"],
        },
      },
      slug: { type: Type.STRING },
    },
    required: [
      "urunBasligi",
      "metaDescription",
      "kisaAciklama",
      "uzunAciklama",
      "anahtarKelimeler",
      "kazanimlar",
      "nedenBuKitap",
      "hediyeOlarak",
      "altTexts",
      "faq",
      "slug",
    ],
  };

  const responseText = await generateText(prompt, schema);
  return JSON.parse(responseText);
}

module.exports = { generateSeoContent };
