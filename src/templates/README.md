# Masal Kategori Şablonları

Bu klasörde her UrunStudio kategorisi için bir scaffold `book.json` bulunur. Yeni bir Shopify ürünü için template oluştururken:

1. İlgili kategori şablonunu seç (örn. `meslek-hikayeleri.template.json`)
2. `src/stories/<urun-handle>/book.json` olarak kopyala
3. Aşağıdaki alanları doldur:
   - `id`, `title`, `description`
   - `lessons` (kazanımlar listesi)
   - `theme` (renkler + ikon)
   - `characterDescription.base` (karakter görsel tarif — UrunStudio concept'inden gelir)
   - `meslekProfile` (sadece meslek için — labelTR, diplomaTitle, diplomaSymbols, uniformEN, toolsEN, iconicSceneHints)
   - `scenes[]` (14 sahne, her biri title + text + prompt + outfitId + mood + setting)
   - `funFacts[]` ve `funFactPlacements[]`

## Kategori Şablonları

| Kategori | Şablon | Ozellikleri |
|----------|--------|-------------|
| meslek-hikayeleri | meslek-hikayeleri.template.json | `meslekProfile` zorunlu — diploma sayfası üretilir |
| yeni-kardes-hikayeleri | yeni-kardes-hikayeleri.template.json | Soft baby nursery not stili, kardes kazanımları |
| hayvan-dostum | hayvan-dostum.template.json | 1-3 yas, hayvan dostluk teması |
| gunluk-degerler-egitimi | gunluk-degerler-egitimi.template.json | Günlük rutin kazanımları, "Yıldız Çocuk Sertifikası" |

## Şema Notları

- `category`: `src/rules/categories.js` içindeki kategori ID'si ile eşleşmeli
- `pageCount`: kapak + iç sayfa sayısı (genelde 14 sahne için 28 sayfa civarı)
- `outfitId`: `outfit` tanımlanmamışsa her sahne için outfit grid grup adı
- Her sahne `prompt`'unda `CHARACTER_DESC` yer tutucusu kullanılır (orchestrator değiştirir)
- Tüm metinler Türkçe; `{CHILD_NAME}` yer tutucusu otomatik kişiselleştirilir

## Brand Kuralları (her şablonda uygulanır)

- "sihir/büyü/mucize" kelimeleri YASAK — yerine "ışık/yıldız/kıvılcım/hayal/kalp"
- Türkçe diakritik (ş ç ğ ü ö ı İ) PERFECT
- Warm chocolate brown serif tipografi
- Gold seal "Bu kitap [İSİM] için özel üretilmiştir"
