const OpenAI = require("openai");
const config = require("../config");

/**
 * Yaş grubu bazlı metin kuralları
 * Baglam/yapay_zeka_baglam_dosyasi.md referansına göre
 */
const AGE_GROUP_RULES = {
  "0-3": {
    sentenceLength: "1-5 kelime",
    style: "Çok kısa ve tekrarlı cümleler. Ses taklitleri bol olsun: 'Miyav miyav!', 'Hav hav!', 'Vınn vınn!' gibi.",
    vocabulary: "Çok basit, günlük kelimeler. Tek heceli kelimeler tercih edilsin.",
    interaction: "Sorular: 'Nerede?', 'Göster!', ses taklidi yapma daveti",
    sceneLength: "Her sahne maksimum 2-3 kısa cümle",
    emotionalDepth: "Basit duygular: mutlu, üzgün, korkmuş. Sıcak ve güvenli atmosfer.",
    specialNotes: "Onomatope (ses taklidi) kelimeler çok önemli. Tekrar eden kalıplar kullan."
  },
  "3-6": {
    sentenceLength: "4-6 kelime (kısa cümleler öncelikli)",
    style: "Kısa ve akıcı anlatım. Diyaloglar önemli. Duygusal ifadeler kullan.",
    vocabulary: "Basit ama zengin kelime dağarcığı. Sıfatlar kullanılabilir: 'kocaman', 'minik', 'parlak'.",
    interaction: "Sorular, tahmin ettirme, duygu ifadeleri. 'Sence ne oldu?', 'Nasıl hissetmiş?'",
    sceneLength: "Her sahne 3-5 cümle. Bir paragraf diyalog olabilir.",
    emotionalDepth: "Empati, paylaşma, cesaret, dostluk temaları. Çatışma basit ve çözümü net.",
    specialNotes: "Karakterlerin duygularını açıkça belirt. Mutlu son önemli."
  },
  "6-12": {
    sentenceLength: "6-12 kelime (yaşa göre artan karmaşıklık)",
    style: "Detaylı anlatım, karakter gelişimi, çatışma ve çözüm. Betimleyici dil.",
    vocabulary: "Gelişmiş kelime dağarcığı. Bilimsel terimler, soyut kavramlar kullanılabilir.",
    interaction: "Düşündürücü sorular, ahlaki seçimler, 'Sen olsan ne yapardın?' türü sorular",
    sceneLength: "Her sahne 4-8 cümle. Birden fazla paragraf olabilir.",
    emotionalDepth: "Karmaşık duygular: iç çatışma, hayal kırıklığı, azim, gurur. Karakter dönüşümü.",
    specialNotes: "Gerçekçi durumlar ve mekanlar kullan. Eğitici mesajı doğal şekilde ver."
  }
};

/**
 * Çocuğun yaşından yaş grubunu belirle
 */
function getAgeGroup(age) {
  const numAge = parseInt(age) || 6;
  if (numAge <= 3) return "0-3";
  if (numAge <= 6) return "3-6";
  return "6-12";
}

class TextGenerator {
  constructor() {
    if (config.openai.apiKey) {
      this.client = new OpenAI({ apiKey: config.openai.apiKey });
    } else {
      this.client = null;
      console.log("  [TextGenerator] OpenAI API key yok - metin üretimi devre dışı (book.json metinleri kullanılacak)");
    }
  }

  /**
   * Kitap icin hikaye metnini uretir veya kisisellesirir
   * Yaş grubuna göre özelleştirilmiş kurallar uygular
   *
   * @param {object} bookData - book.json'dan gelen kitap verisi
   * @param {object} childInfo - Cocuk bilgileri
   * @param {string} childInfo.name - Cocugun adi
   * @param {string} childInfo.gender - "erkek" veya "kiz"
   * @param {string} childInfo.age - Cocugun yasi
   * @returns {Promise<object[]>} - Kisisellesirilmis sahne metinleri
   */
  async personalizeStoryTexts(bookData, childInfo) {
    // OpenAI client yoksa basit {CHILD_NAME} replace yap
    if (!this.client) {
      console.log("  [text] OpenAI yok - book.json metinleri {CHILD_NAME} ile kişiselleştiriliyor");
      return bookData.scenes.map(s => ({
        sceneNumber: s.sceneNumber,
        title: s.title,
        text: (s.text || "").replace(/\{CHILD_NAME\}/g, childInfo.name)
      }));
    }

    // Yaş grubunu belirle (book.json'dan veya çocuk yaşından)
    const ageGroup = bookData.ageGroup || getAgeGroup(childInfo.age);
    const rules = AGE_GROUP_RULES[ageGroup] || AGE_GROUP_RULES["3-6"];

    const systemPrompt = `Sen profesyonel bir çocuk kitabı yazarısın. Verilen hikaye şablonunu çocuğun bilgilerine göre kişiselleştir.

HEDEF YAŞ GRUBU: ${ageGroup} yaş

DİL KURALLARI (${ageGroup} yaş grubu):
- Cümle uzunluğu: ${rules.sentenceLength}
- Yazım tarzı: ${rules.style}
- Kelime dağarcığı: ${rules.vocabulary}
- Etkileşim: ${rules.interaction}
- Sahne uzunluğu: ${rules.sceneLength}
- Duygusal derinlik: ${rules.emotionalDepth}
- Özel notlar: ${rules.specialNotes}

GENEL KURALLAR:
- Çocuğun adını HER SAHNEDE EN AZ 2-3 KEZ kullan. Bu kişiselleştirilmiş bir kitap, çocuk kendi adını sık sık görmeli ve bundan heyecan duymalı. Adı doğal cümlelerde kullan: "${childInfo.name} koşarak...", "${childInfo.name}'in gözleri parladı", "Bravo ${childInfo.name}!" gibi.
- Cinsiyet uyumunu sağla (erkek/kız zamirler)
- Pixar filmlerindeki gibi hem çocukları hem yetişkinleri etkileyen duygusal derinlik kat
- Türkçe yaz, sade ve akıcı bir dil kullan
- Sonu her zaman umut verici ve öğretici olsun
- Orijinal hikayenin ruhunu ve mesajını koru
- Çocuğun adı ile hitap eden cümleler ekle: "Aferin ${childInfo.name}!", "Hadi ${childInfo.name}!" gibi`;

    const userPrompt = `Çocuk Bilgileri:
- Ad: ${childInfo.name}
- Cinsiyet: ${childInfo.gender}
- Yaş: ${childInfo.age}

Kitap: ${bookData.title}
Yaş Grubu: ${ageGroup}

Orijinal Sahne Metinleri:
${bookData.scenes.map((s) => `Sahne ${s.sceneNumber} (${s.title}): ${s.text}`).join("\n")}

Bu sahne metinlerini yukarıdaki çocuk bilgilerine ve yaş grubu kurallarına göre kişiselleştir.
Her sahne için JSON formatında döndür:
{
  "scenes": [
    { "sceneNumber": 1, "title": "...", "text": "..." },
    ...
  ]
}`;

    const response = await this.client.chat.completions.create({
      model: config.openai.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    }, { timeout: 60000 });

    let result;
    try {
      result = JSON.parse(response.choices[0].message.content);
    } catch (parseErr) {
      const raw = response.choices[0].message.content || "";
      console.error("  [text] JSON parse hatasi. Raw:", raw.substring(0, 200));
      throw new Error("AI yanıtı JSON olarak ayrıştırılamadı");
    }
    return result.scenes || result;
  }

  /**
   * Prompt'taki CHARACTER_DESC yer tutucusunu cocuk bilgileriyle degistirir
   *
   * @param {string} prompt - Sahne prompt'u
   * @param {object} childInfo - Cocuk bilgileri
   * @returns {string} - Guncellenmis prompt
   */
  buildCharacterPrompt(prompt, childInfo, outfit) {
    const genderDesc = childInfo.gender === "erkek" ? "boy" : "girl";
    const ageDesc = `${childInfo.age}-year-old`;

    // CHARACTER_DESC yer tutucusunu gercek aciklama ile degistir
    const characterDesc = `(a ${ageDesc} ${genderDesc} with the EXACT same face as the reference photo)`;
    let result = prompt.replace(/CHARACTER_DESC/g, characterDesc);

    // Kiyafet enjeksiyonu - tum sahnelerde tutarli kiyafet icin
    if (outfit && outfit.description) {
      let outfitDesc = outfit.description;
      // {CHILD_NAME} placeholder'ini cocugun adiyla degistir
      outfitDesc = outfitDesc.replace(/\{CHILD_NAME\}/g, childInfo.name);

      result += `\n\nIMPORTANT CLOTHING CONSISTENCY: The child character MUST be ${outfitDesc}. This outfit must be EXACTLY the same in every scene. Do NOT change the clothing.`;

      if (outfit.nameVisible && outfit.nameLocation) {
        const nameLocDesc = outfit.nameLocation.replace(/\{CHILD_NAME\}/g, childInfo.name);
        result += ` The name "${childInfo.name}" should be clearly visible ${nameLocDesc}.`;
      }
    }

    return result;
  }

  /**
   * Tamamen yeni bir hikaye uretir
   *
   * @param {string} theme - Hikaye temasi
   * @param {object} childInfo - Cocuk bilgileri
   * @param {number} sceneCount - Sahne sayisi
   * @returns {Promise<object>} - Tam kitap verisi (book.json formati)
   */
  async generateNewStory(theme, childInfo, sceneCount = 10) {
    const ageGroup = getAgeGroup(childInfo.age);
    const rules = AGE_GROUP_RULES[ageGroup] || AGE_GROUP_RULES["3-6"];

    const systemPrompt = `Sen yaratıcı bir çocuk kitabı yazarı ve görsel yönetmenisin.
Verilen temaya göre ${ageGroup} yaş grubuna uygun kişiselleştirilmiş bir hikaye kitabı oluştur.

Dil kuralları: ${rules.style}
Cümle uzunluğu: ${rules.sentenceLength}
Kelime dağarcığı: ${rules.vocabulary}

Her sahne için şunları üret:
1. Türkçe başlık
2. Türkçe hikaye metni (yaş grubuna uygun)
3. İngilizce görsel prompt'u (3D Pixar tarzı, detaylı sahne tarifi)

Prompt'larda karakter için "CHARACTER_DESC" yer tutucusunu kullan.
Her prompt mutlaka "3D Pixar animated movie style" ile bitsin.`;

    const userPrompt = `Tema: ${theme}
Çocuk: ${childInfo.name}, ${childInfo.age} yaşında ${childInfo.gender === "erkek" ? "erkek" : "kız"} çocuk
Yaş Grubu: ${ageGroup}
Sahne sayısı: ${sceneCount}

Aşağıdaki JSON formatında döndür:
{
  "id": "tema-adi",
  "title": "Kitap Başlığı",
  "description": "Kısa açıklama",
  "scenes": [
    {
      "sceneNumber": 1,
      "title": "Sahne Başlığı",
      "text": "Türkçe hikaye metni...",
      "prompt": "English scene prompt with CHARACTER_DESC placeholder...",
      "mood": "mood description",
      "setting": "setting description"
    }
  ]
}`;

    const response = await this.client.chat.completions.create({
      model: config.openai.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.8,
    });

    let result;
    try {
      result = JSON.parse(response.choices[0].message.content);
    } catch (parseErr) {
      const raw = response.choices[0].message.content || "";
      console.error("  [text] JSON parse hatasi. Raw:", raw.substring(0, 200));
      throw new Error("AI yanıtı JSON olarak ayrıştırılamadı");
    }
    return result;
  }
}

module.exports = TextGenerator;
