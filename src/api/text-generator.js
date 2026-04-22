const OpenAI = require("openai");
const { GoogleGenAI } = require("@google/genai");
const config = require("../config");

/**
 * Yaş grubu bazlı metin kuralları — Behiç Ak / Sara Şahinkanat / Fatih Erdoğan seviyesinde
 * edebi kalite için revize edildi (2026-04-21). Önceki "1-5 kelime, ses taklidi, Nerede? Göster!"
 * kuralları GPT-4o tarafından harfiyen uygulanıp template metnini parçalıyordu.
 * Yeni kurallar: show-don't-tell, duyusal detay, doğal Türkçe, anne-baba sesli okuma uyumlu.
 */
const AGE_GROUP_RULES = {
  "0-3": {
    sentenceLength: "2-8 kelime, tam Türk cümlesi (özne + yer/zaman + yüklem)",
    style: "Yumuşak, sıcak, duyusal. Kısa tam cümleler — asla 'Nerede? Göster!' gibi komut parçaları değil. Anne-baba sesli okusun, bebek kulağına nazikçe değsin.",
    vocabulary: "Basit ama somut. Duyusal kelimeler seç: yumuşak, ılık, parlak, cıvıl cıvıl, mışıl mışıl. Duyguyu ima et: 'gözleri parladı', 'yanakları pembeleşti'.",
    interaction: "Gerçek hayat anları: 'Güneş yanağına dokundu', 'Minnoş kucağına kıvrıldı'. Sorular değil, sahneler.",
    sceneLength: "Her sahne 3-5 kısa ama tam cümle.",
    emotionalDepth: "Güven, sıcaklık, dostluk. İç dünyayı bir detayla ima et ('kalbi küçük bir kuş gibi çarptı').",
    specialNotes: "Onomatope kullanılabilir ama sahne başı değil cümle içi: 'Mır mır fısıldadı', 'cik cik öttü'. DEVRİK CÜMLE YASAK. Klişe başlangıç ('bir varmış') YOK."
  },
  "3-6": {
    sentenceLength: "5-12 kelime, akıcı tam cümleler",
    style: "Pixar/Behiç Ak tarzı — show-don't-tell. Her sahnede bir duyusal detay + bir duygu imgesi + mümkünse kısa bir replik.",
    vocabulary: "Zengin ama çocuğun anladığı — 'kocaman', 'minik', 'kıvrım kıvrım', 'pırıl pırıl'. Sıradan sıfatlardan ('güzel', 'mükemmel') kaçın.",
    interaction: "Doğrudan sorulardan kaç — sahne içinden çocuğun kendi sorusu doğsun.",
    sceneLength: "Her sahne 4-6 cümle. 1 kısa diyalog içersin.",
    emotionalDepth: "Empati, paylaşma, cesaret, dostluk. Duyguyu ayrıntıyla kur — 'üzüldü' DEME, 'gözleri doldu, parmağıyla yaprağı çizdi' YAZ.",
    specialNotes: "DEVRİK CÜMLE YASAK. Klişe başlangıç ('aniden', 'bir anda') YOK. Sonu umut verici ama didaktik değil."
  },
  "6-12": {
    sentenceLength: "6-12 kelime (yaşa göre artan karmaşıklık)",
    style: "Detaylı anlatım, karakter gelişimi, çatışma ve çözüm. Betimleyici dil.",
    vocabulary: "Gelişmiş kelime dağarcığı. Bilimsel terimler, soyut kavramlar kullanılabilir.",
    interaction: "Düşündürücü sorular, ahlaki seçimler, 'Sen olsan ne yapardın?' türü sorular",
    sceneLength: "Her sahne 4-8 cümle. Birden fazla paragraf olabilir.",
    emotionalDepth: "Karmaşık duygular: iç çatışma, hayal kırıklığı, azim, gurur. Karakter dönüşümü.",
    specialNotes: "Gerçekçi durumlar ve mekanlar kullan. Eğitici mesajı doğal şekilde ver."
  },
  "yetiskin": {
    sentenceLength: "Kısa ve uzun cümleleri dengeli kullan. Kısa cümleler duygusal vurgu için (3-5 kelime), uzun cümleler anlatım derinliği için (15-25 kelime).",
    style: "Edebî, lirik, duygu yüklü. Şiirsel ama yapmacık olmayan. İçten ve samimi.",
    vocabulary: "Zengin, sofistike. Duyusal kelimeler: sıcaklık, koku, dokunuş, ışık. Nostalji kelimeleri: eskiden, o günlerde, hâlâ, her zaman.",
    interaction: "Direkt hitap: 'Sen...', 'Bilir misin...', 'Hatırlar mısın...' Okuyucu ile göz göze gelme hissi.",
    sceneLength: "Her sahne 4-6 cümle. Duygusal doruk sahneleri 6-8 cümle olabilir.",
    emotionalDepth: "Maksimum. Gözyaşı eşiğinde ama melodramatik değil. Gerçek, samimi, içten.",
    specialNotes: "Her sahne bir duyguyu temsil etmeli: güven, sıcaklık, minnettarlık, nostalji, gurur, sevgi. Sahneler arası duygusal bir yolculuk olmalı."
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
    }
    if (config.google?.apiKey) {
      this.gemini = new GoogleGenAI({ apiKey: config.google.apiKey });
    } else {
      this.gemini = null;
      console.log("  [TextGenerator] GOOGLE_API_KEY yok - cocuk kitabi text enhance devre disi (template aynen kullanilir)");
    }
  }

  // Gemini 2.5-pro + thinkingBudget ile text enhancement.
  // Ayni model ve benzer kalite hedefiyle story-writer expand()'e paralel.
  async _geminiGenerate(prompt, { temperature = 0.75, thinkingBudget = 2048, maxTokens = 8000 } = {}) {
    if (!this.gemini) throw new Error("Gemini client not initialized");
    const desiredOutput = maxTokens;
    const maxOutputTokens = Math.max(desiredOutput + thinkingBudget + 2000, 10240);
    const res = await this.gemini.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
      config: {
        temperature,
        maxOutputTokens,
        thinkingConfig: { thinkingBudget },
      },
    });
    return res.text || "";
  }

  _extractJson(text) {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fence ? fence[1] : text;
    const first = candidate.indexOf("{");
    const firstArr = candidate.indexOf("[");
    const start = first < 0 ? firstArr : (firstArr < 0 ? first : Math.min(first, firstArr));
    if (start < 0) throw new Error("JSON bulunamadi");
    let depth = 0, end = -1, openChar = candidate[start], closeChar = openChar === "{" ? "}" : "]";
    let inStr = false, esc = false;
    for (let i = start; i < candidate.length; i++) {
      const c = candidate[i];
      if (esc) { esc = false; continue; }
      if (c === "\\" && inStr) { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === openChar) depth++;
      else if (c === closeChar) { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) throw new Error("JSON kapanisi yok");
    return JSON.parse(candidate.slice(start, end + 1));
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
    // Helper: apply placeholder substitutions to a text string.
    const applyPlaceholders = (txt) => (txt || "")
      .replace(/\{CHILD_NAME\}/g, childInfo.name)
      .replace(/\{RECIPIENT_NAME\}/g, childInfo.recipientName || childInfo.name)
      .replace(/\{SENDER_NAME\}/g, childInfo.senderName || "")
      .replace(/\{CUSTOM_MESSAGE\}/g, childInfo.customMessage || "")
      .replace(/\{NICKNAME\}/g, childInfo.recipientNickname || childInfo.recipientName || childInfo.name)
      .replace(/\{SHARED_ACTIVITY\}/g, childInfo.sharedActivity || '')
      .replace(/\{RECIPIENT_HOBBY\}/g, childInfo.recipientHobby || '')
      .replace(/\{SPECIAL_MEMORY\}/g, childInfo.specialMemory || '');

    const returnAsIs = () => bookData.scenes.map(s => ({
      sceneNumber: s.sceneNumber,
      title: applyPlaceholders(s.title),
      text: applyPlaceholders(s.text),
    }));

    // ── CHILD BOOKS: Gemini 2.5-pro + thinking ile Behic Ak kalitesinde ENHANCE et ──
    // Template metni "outline/seed" olarak gorur, literatur zenginligi ekler.
    // Daha once GPT-4o cagrisi harsh "1-5 kelime, Nerede? Goster!" kurallariyla
    // template'i parcalariyordu. Simdi Gemini 2.5-pro + thinkingBudget=2048 +
    // story-writer'daki "Behic Ak, Sara Sahinkanat, Fatih Erdogan seviyesi" prompt
    // ile iyilestirilmis metin uretiyor.
    const isAdultBook = bookData.targetAudience === 'yetiskin';
    if (!isAdultBook) {
      if (!this.gemini) {
        console.log("  [text] Gemini yok - template aynen kullaniliyor (morphology swap yapildi)");
        return returnAsIs();
      }
      try {
        const enhanced = await this._enhanceChildBookText(bookData, childInfo);
        return enhanced;
      } catch (err) {
        console.error("  [text] Gemini enhance hatasi:", err.message, "- template aynen kullaniliyor");
        return returnAsIs();
      }
    }

    // OpenAI client yoksa basit {CHILD_NAME} replace yap
    if (!this.client) {
      console.log("  [text] OpenAI yok - book.json metinleri {CHILD_NAME} ile kişiselleştiriliyor");
      return returnAsIs();
    }

    // Yaş grubunu belirle (book.json'dan veya çocuk yaşından)
    const ageGroup = bookData.ageGroup || getAgeGroup(childInfo.age);
    const rules = AGE_GROUP_RULES[ageGroup] || AGE_GROUP_RULES["3-6"];

    const systemPrompt = isAdultBook ?
`Sen ödüllü bir Türk edebiyatçısısın. Kişiselleştirilmiş yetişkin hediye kitapları yazıyorsun.

HEDEF: ${bookData.occasion === 'anneler-gunu' ? 'ANNELER GÜNÜ hediye kitabı - bir evladın annesine olan derin sevgisini, minnettarlığını ve duygusal bağını anlatan' : 'Özel gün hediye kitabı - derin duygusal bağları anlatan'}

YAZIM KURALLARI:
- Edebî, akıcı, duygu yüklü Türkçe kullan
- Kısa ve uzun cümleleri dengeli kullan — kısa cümleler vurgu için, uzun cümleler duygu derinliği için
- Her sahne okuyucunun gözünü yaşartacak kadar samimi olmalı
- Klişelerden kaçın — "dünyanın en güzel annesi" gibi basmakalıp ifadeler yerine özgün, kişisel anlatım kullan
- Duyuları kullan: kokular, sesler, dokunuşlar, sıcaklık hissi
- Nostalji ve özlem duygusu oluştur — geçmiş anıları şimdiki zamana bağla
- Hitap şekli olarak LAKAP/NICKNAME kullan (${childInfo.recipientNickname || childInfo.name}), gerçek ismi (${childInfo.name}) sadece vurgu anlarında kullan
- Gönderen kişi: ${childInfo.senderName || 'belirtilmemiş'} (${childInfo.senderGender === 'kiz' ? 'Kızı' : childInfo.senderGender === 'karma' ? 'Çocukları' : 'Oğlu'})

İSİM KULLANIMI (ÇOK ÖNEMLİ):
- Sahnelerin çoğunda LAKAP kullan: "${childInfo.recipientNickname || 'Anneciğim'}"
- Gerçek ismi (${childInfo.name}) sadece 3-4 sahnede ve duygusal vurgu anlarında kullan
- Örnek doğru kullanım: "Anneciğim, senin ellerinin sıcaklığını hiç unutmadım."
- Örnek doğru kullanım: "${childInfo.name}... Bu ismi her söylediğimde kalbim gülümser."
- YANLIŞ: Her cümlede "${childInfo.name}" yazmak

KİŞİSELLEŞTİRME VERİLERİ:
- Birlikte yapılan aktivite: ${childInfo.sharedActivity || 'belirtilmemiş'}
- Alıcının hobisi: ${childInfo.recipientHobby || 'belirtilmemiş'}
- Özel anı: ${childInfo.specialMemory || 'belirtilmemiş'}
- Son mesaj: ${childInfo.customMessage || 'belirtilmemiş'}

ÖNEMLİ: Bu verileri sahne metinlerine DOĞAL ve DUYGUSAL şekilde yerleştir. Eğer bir veri boşsa o sahneyi genel ama yine de duygusal yaz. Boş veriyi "[boş]" veya "belirtilmemiş" olarak YAZMA.

DİL KURALLARI:
- Cümle uzunluğu: ${rules.sentenceLength}
- Yazım tarzı: ${rules.style}
- Kelime dağarcığı: ${rules.vocabulary}
- Etkileşim: ${rules.interaction}
- Sahne uzunluğu: ${rules.sceneLength}
- Duygusal derinlik: ${rules.emotionalDepth}
- Özel notlar: ${rules.specialNotes}`

: `Sen profesyonel bir çocuk kitabı yazarısın. Verilen hikaye şablonunu çocuğun bilgilerine göre kişiselleştir.

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
${bookData.characterType === 'animal' || bookData.characterType === 'hayvan' ? `- Bu hikayede ana karakter bir HAYVAN. Çocuğun adını (${childInfo.name}) HİKAYEYE DOĞAL ŞEKİLDE YERLEŞTİR - çocuk hikayedeki olayları izleyen veya hayvana yardım eden bir karakter olarak yer alsın. Örnek: "${childInfo.name} kediye baktı", "${childInfo.name} kelebeği gösterdi" gibi. Hayvanın kendi eylemlerini çocuğun adıyla DEĞİŞTİRME.` : `- Çocuğun adını her sahnede 1-2 KEZ doğal şekilde kullan. Aşırı tekrardan KAÇIN. Bir sahnede 3'ten fazla isim kullanma. İsim yerine "o", "çocuk", "küçük kahraman" gibi zamirler ve sıfatlar kullan.`}
- Cinsiyet uyumunu sağla (erkek/kız zamirler)
- Pixar filmlerindeki gibi hem çocukları hem yetişkinleri etkileyen duygusal derinlik kat
- Türkçe yaz, sade ve akıcı bir dil kullan
- Sonu her zaman umut verici ve öğretici olsun
- Orijinal hikayenin ruhunu ve mesajını koru
${bookData.characterType === 'animal' || bookData.characterType === 'hayvan' ? `- Çocuğu hikayeye dahil et ama hayvanın yerini ALMA. Çocuk gözlemci veya yardımcı rolünde olsun.` : `- İsmi doğal yerlerde kullan: sahne başında tanıtım, önemli bir eylemde, sahne sonunda hitap. Her cümlede isim YAZMA.

METİN KALİTE KURALLARI (KRİTİK):
- Devrik cümle KULLANMA. Türkçe'nin doğal özne-nesne-yüklem sırasını takip et.
- Anlamsız veya mantıksız cümleler yazma. Her cümle bir anlam taşımalı.
- Aynı kelimeyi art arda iki cümlede tekrarlama.
- Cümle sonlarını çeşitlendir: hep "...dedi" veya "...baktı" ile bitirme.
- Diyaloglar doğal olmalı — çocuklar gerçekte nasıl konuşursa öyle yaz.
- Paragraflar arası mantıksal geçiş olmalı — sahneler kopuk olmamalı.`}`;

    let userPrompt = `Çocuk Bilgileri:
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

    // Yetiskin kitaplar icin ek kisisellesirme verileri
    if (bookData.targetAudience === 'yetiskin') {
      userPrompt += `\n\nEK KİŞİSELLEŞTİRME VERİLERİ:
- Hitap/Lakap: ${childInfo.recipientNickname || childInfo.name}
- Gerçek İsim: ${childInfo.name}
- Gönderen: ${childInfo.senderName || 'belirtilmemiş'} (${childInfo.senderGender === 'kiz' ? 'Kızı' : childInfo.senderGender === 'karma' ? 'Çocukları' : 'Oğlu'})
- Birlikte yapılan aktivite: ${childInfo.sharedActivity || 'belirtilmemiş'}
- Alıcının hobisi: ${childInfo.recipientHobby || 'belirtilmemiş'}
- Özel anı: ${childInfo.specialMemory || 'belirtilmemiş'}
- Son mesaj: ${childInfo.customMessage || 'belirtilmemiş'}

KRİTİK KURALLAR:
1. Sahnelerde LAKAP kullan ("${childInfo.recipientNickname || 'Anneciğim'}"), gerçek ismi (${childInfo.name}) sadece 2-3 sahnede vurgu için kullan
2. Verilen aktivite, hobi ve anı bilgilerini ilgili sahnelere DOĞAL şekilde yerleştir
3. Boş olan verileri "belirtilmemiş" olarak YAZMA — o sahneyi genel duygusal içerikle doldur
4. Her sahne edebî kalitede, duygu yüklü olmalı — bu bir çocuk kitabı DEĞİL
5. Duyuları kullan: annenin ellerinin sıcaklığı, mutfaktan gelen koku, sarılmanın huzuru`;
    }

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
    const scenes = result.scenes || result;
    // Ek placeholder degisimleri (yetiskin kitaplari icin)
    return scenes.map(s => ({
      ...s,
      text: (s.text || "")
        .replace(/\{RECIPIENT_NAME\}/g, childInfo.recipientName || childInfo.name)
        .replace(/\{SENDER_NAME\}/g, childInfo.senderName || "")
        .replace(/\{CUSTOM_MESSAGE\}/g, childInfo.customMessage || "")
        .replace(/\{NICKNAME\}/g, childInfo.recipientNickname || childInfo.recipientName || childInfo.name)
        .replace(/\{SHARED_ACTIVITY\}/g, childInfo.sharedActivity || '')
        .replace(/\{RECIPIENT_HOBBY\}/g, childInfo.recipientHobby || '')
        .replace(/\{SPECIAL_MEMORY\}/g, childInfo.specialMemory || '')
    }));
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

  /**
   * Çocuk kitabı sahne metinlerini Gemini 2.5-pro + thinkingBudget ile Behiç Ak
   * kalitesinde yeniden yaz. Template metni OUTLINE / SEED olarak görür:
   * olay akışı, mekân, nesneler, duygu arcı, karakterler KORUNUR ama
   * anlatım zenginlesir — duyusal detay, show-don't-tell, canli diyalog.
   */
  async _enhanceChildBookText(bookData, childInfo) {
    const ageGroup = bookData.ageGroup || getAgeGroup(childInfo.age);
    const rules = AGE_GROUP_RULES[ageGroup] || AGE_GROUP_RULES["3-6"];
    const name = childInfo.name;
    const gender = childInfo.gender === "kiz" ? "kız" : "erkek";

    const sidekickLine = bookData.sidekick
      ? `Yan karakter: ${bookData.sidekick.name}${bookData.sidekick.species ? ` (${bookData.sidekick.species})` : ""}. Sahnelerde onu aynı isimle an.`
      : "";

    const scenesBlock = bookData.scenes.map((s) => (
      `Sahne ${s.sceneNumber} — Başlık: "${s.title}"\nTaslak metin: ${s.text || "(boş)"}`
    )).join("\n\n");

    const prompt = `Sen dünya standartlarında bir Türk çocuk edebiyatı yazarısın — Behiç Ak, Sara Şahinkanat, Fatih Erdoğan, Feridun Oral, Gülten Dayıoğlu seviyesinde. Anne-babalar sesli okuyacak. Metin hem çocuğun hayalinde yaşamalı hem yetişkinin dudağında güzel dursun.

GÖREV:
Bu kişiye özel çocuk kitabının 14 sahnesinin TASLAK metinlerini verdim. Bunlar minimal, özet cümlelerdir. Sen bunları aynı olay akışını / aynı mekânı / aynı nesneleri / aynı duygu arkını KORUYARAK edebî kalitede YENİDEN YAZ.

Kahraman: ${name} (${gender}, ${childInfo.age} yaşında)
Kitap başlığı: ${bookData.title}
Yaş grubu: ${ageGroup}
Kazanımlar: ${(bookData.lessons || []).join(", ")}
${sidekickLine}

TÜRKÇE YAZIM KURALLARI (MUTLAK):
- Noktalama eksiksiz (virgül, nokta, soru, ünlem, tırnak). Diyaloglar tırnak içinde.
- Ünsüz yumuşaması, ünlü uyumu, ekler doğru.
- DEVRİK CÜMLE KESİN YASAK. Özne → yer/zaman → yüklem (yüklem en sonda). "Deniz kenarında Elif yürüyordu" YANLIŞ; "Elif, deniz kenarında yürüyordu" DOĞRU.
- "de/da/ki/mi" eklerini ayrı/birleşik doğru yaz.
- Klişe başlangıçlar yasak ("bir anda", "aniden", "o sırada" tekrarı yok).

KALİTE KURALLARI (MUTLAK):
- Show, don't tell. "Üzüldü" yazma, "gözleri doldu, parmağıyla yaprağı çizdi" yaz.
- Her sahnede EN AZ BİR somut duyusal detay (ses, koku, dokunuş, renk tonu, ısı).
- Her sahnede mümkünse EN AZ BİR kısa replik (tırnak içinde).
- "harika", "mükemmel", "muhteşem", "çok güzel" gibi boş sıfatlar YASAK.
- "sihir", "sihirli", "büyü", "büyülü", "mucize", "tılsım" KELİMELERİ YASAK (MasalSensin marka kuralı). Yerine "ışık, yıldız, kıvılcım, hayal, kalp, rüya" gibi yere basan kelimeler.
- Metaforlar doğal olsun, süslü değil: "kuşun sesi hâlâ kulağındaydı" tarzı.
- Dil ritmi: kısa-uzun cümleler dönüşümlü, sesli okuyunca akıcı.

SAHNE AKIŞI:
- Her sahne önceki sahnenin duygusal/mekânsal uzantısı. Scene N'in sonu → Scene N+1'in başlangıcı doğal bir geçişle bağlanmalı.
- Sahneler BİRBİRİYLE BAĞLANTILI bir arc oluşturur.
- Son sahne, ilk sahnedeki hissi tamamlar — huzur, sevgi, güven.

YAŞ GRUBU KURALLARI (${ageGroup}):
- Cümle uzunluğu: ${rules.sentenceLength}
- Stil: ${rules.style}
- Söz dağarcığı: ${rules.vocabulary}
- Etkileşim/anlatım: ${rules.interaction}
- Sahne uzunluğu: ${rules.sceneLength}
- Duygusal derinlik: ${rules.emotionalDepth}
- Özel notlar: ${rules.specialNotes}

İSİM KULLANIMI:
- ${name} adını her sahnede 1-2 kez DOĞAL şekilde kullan, 3'ten fazla yazma.
- İsim yerine "o", "küçük kahraman", "başını dayadığı yerde" gibi zamirler/sıfatlar kullan.

SAHNE TASLAKLARI:
${scenesBlock}

ÇIKTI:
Sadece şu JSON formatı, başka metin YOK:
{
  "scenes": [
    { "sceneNumber": 1, "title": "<başlık — taslaktan aynen al ya da çok ufak iyileştir>", "text": "<yeniden yazılmış zengin Türkçe metin>" },
    ...
  ]
}`;

    const raw = await this._geminiGenerate(prompt, {
      temperature: 0.8,
      thinkingBudget: 2048,
      maxTokens: 8000,
    });
    const data = this._extractJson(raw);
    const scenes = data.scenes || data;
    if (!Array.isArray(scenes) || scenes.length === 0) {
      throw new Error("Gemini bos scenes dondu");
    }
    console.log(`  [text] Gemini enhance TAMAM: ${scenes.length} sahne Behic Ak kalitesinde yazildi`);
    return scenes.map(s => ({
      sceneNumber: s.sceneNumber,
      title: s.title,
      text: (s.text || "").trim(),
    }));
  }
}

module.exports = TextGenerator;
