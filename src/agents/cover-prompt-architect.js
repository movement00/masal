/**
 * CoverPromptArchitect - Ozel sayfa promptlari olusturur
 *
 * Kapak, kahraman sayfasi, biliyor muydunuz, gonderen notu, arka kapak
 * icin optimize edilmis promptlar uretir.
 *
 * Kanitlanmis format: Bolumlendirilmis yapi (TITLE, TYPOGRAPHY, CHARACTER,
 * COMPOSITION, ART STYLE) kullanarak AI'dan en iyi sonucu alir.
 */

const { CANVAS_W: PW, CANVAS_H: PH } = require("../constants");
const { GoogleGenAI } = require("@google/genai");
const config = require("../config");
const { BRAND_VOCAB_RULE, BRAND_INLINE } = require("../rules/prompt-fragments");

// UrunStudio'dan port — rastgele gönderen seçimi
const SENDER_POOL = [
  { key: "anne+baba", hitap: (n) => `Canım ${n}`,         signoff: "Seni çok seven,\nAnnen ve Baban ❤️" },
  { key: "anne",      hitap: (n) => `Canım ${n}`,         signoff: "Seni çok seven,\nAnnen ❤️" },
  { key: "baba",      hitap: (n) => `Canım ${n}`,         signoff: "Seninle gurur duyan,\nBaban ❤️" },
  { key: "anneanne",  hitap: (n) => `Canım torunum ${n}`, signoff: "Seni çok seven,\nAnneannen ❤️" },
  { key: "babaanne",  hitap: (n) => `Canım torunum ${n}`, signoff: "Seni çok seven,\nBabaannen ❤️" },
  { key: "dede",      hitap: (n) => `Canım torunum ${n}`, signoff: "Seni çok seven,\nDeden ❤️" },
  { key: "teyze",     hitap: (n) => `Canım yeğenim ${n}`, signoff: "Seni çok seven,\nTeyzen ❤️" },
  { key: "hala",      hitap: (n) => `Canım yeğenim ${n}`, signoff: "Seni çok seven,\nHalan ❤️" },
  { key: "dayi",      hitap: (n) => `Canım yeğenim ${n}`, signoff: "Seni çok seven,\nDayın ❤️" },
  { key: "amca",      hitap: (n) => `Canım yeğenim ${n}`, signoff: "Seni çok seven,\nAmcan ❤️" },
];

function pickSender() {
  return SENDER_POOL[Math.floor(Math.random() * SENDER_POOL.length)];
}

async function generateNoteBody(bookData, heroName, heroAge, senderKey) {
  const senderHuman = {
    "anne+baba": "anne ve baba", anne: "anne", baba: "baba",
    anneanne: "anneanne", babaanne: "babaanne", dede: "dede",
    teyze: "teyze", hala: "hala", dayi: "dayı", amca: "amca",
  };
  const persona = senderHuman[senderKey] || "aile büyüğü";
  const theme = bookData.theme || bookData.title || "macera";
  const ozet = bookData.description || bookData.ozet || "";
  const kazanimlar = (bookData.lessons || bookData.kazanimlar || []).slice(0, 3).join(", ");
  const promptText = `${heroName} adında ${heroAge || "6"} yaşında bir Türk çocuğu için kişiye özel bir kitap yazdık. Kitap "${bookData.title || theme}" — teması: ${theme}. Özet: ${ozet}. Kazanımları: ${kazanimlar}.

GÖREV: Bu kitabın ilk sayfasına eklenecek bir not yaz. Notu YAZAN kişi ${persona} olacak. Çocuğa ${persona === "anne ve baba" ? "ikisinden" : "kendisinden"} duygusal, sıcak, samimi bir mektup gibi olmalı.

KURAL:
- 3-4 kısa paragraf, toplam 4-7 cümle
- Çocuğun adı (${heroName}) en az 1 kez geçsin
- Hikayenin temasına HAFIF bir gönderme olsun (örnek: kitap macera ise "her macerada yanındayız", uyku ise "her gece rüyalarında" gibi)
- Aşırı klişe değil, gerçek bir aile büyüğünün el yazısıyla yazdığı doğal bir not havası
- Türkçe karakterler MUTLAKA doğru: ş ç ğ ü ö ı İ
- "sihir", "sihirli", "büyü", "büyülü", "mucize" KELİMELERİ YASAK — yerine "ışık", "yıldız", "kıvılcım", "hayal", "kalp" gibi yere basan kelimeler kullan
- Klişe başlangıçlar yasak ("Canım kızım..." gibi başlama, doğrudan duyguyla başla)
- "Bu kitap özel..." gibi giriş cümlesi kullan ama mutlaka yeniden yorumla, kopyala-yapıştır gibi olmasın
- ÇIKTI: SADECE not metni (hitap ve imza zaten ayrı, onları yazma)`;

  try {
    const ai = new GoogleGenAI({ apiKey: config.google.apiKey });
    const res = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: promptText,
      config: { temperature: 0.85, maxOutputTokens: 1500, thinkingConfig: { thinkingBudget: 2048 } },
    });
    const text = (res.text || "").trim().slice(0, 800);
    if (!text) throw new Error("empty text");
    return text;
  } catch (e) {
    // Fallback: safe static body if AI fails
    return `Elindeki bu sayfalar tamamen sana özel hazırlandı, çünkü içindeki hayaller sana her gün yeni bir ilham veriyor.\n\nTıpkı bu hikâyedeki gibi, sen de her gün biraz daha büyüyorsun. Bazen zorlanırsın — ama biz her zaman yanındayız.\n\nSenin gözlerindeki ışığı görmek bizim için en güzel şey.`;
  }
}

// Boyama kategorisi için Tamamlandı Sertifikası (UrunStudio'dan port)
function buildBoyamaCertificatePrompt(heroName) {
  return `CHILDREN'S COLORING BOOK "TAMAMLANDI SERTİFİKASI" — 2:3 portrait format, FLAT FULL PAGE — the page IS the stationery paper, filling the entire frame edge to edge. No table, no background surface.

THE PAGE: Premium cream/ivory certificate paper with warm subtle texture and an ornate border frame. Slightly aged corners, gentle vintage feel. Paper fills the ENTIRE frame.

TOP (decorative header):
- Large hand-lettered Turkish title: "TAMAMLANDI" — thick bold serif display font, warm chocolate brown (#3E2723), with a small golden laurel wreath on each side
- Below it, in smaller warm italic script: "Bir boyama kitabı daha hayat buldu"

ORNATE BORDER:
- All four edges have a hand-drawn decorative frame: small crayons, tiny paintbrushes, dotted lines, little stars in warm orange/peach/gold. Think "end-of-year school certificate" meets "craft journal sticker border".
- Corners have small ornamental flourishes (little rosettes)

CENTER CONTENT (displayed in elegant Turkish text):

Line 1 (centered, warm brown serif): "Bu boyama kitabını renklendiren harika sanatçı:"

Line 2 — BIG hand-lettered child name, calligraphic display script, warm orange (#D17A2C), with a subtle golden underline flourish: "${heroName}"

Line 3 (centered, smaller): "Tarih: _____ / _____ / _____" (empty blanks with dotted lines for the child to fill in)

Line 4 (centered, warm brown italic):
"Hayal gücünle, sabrınla ve renklerinle bu kitabı hayata geçirdin."

Line 5 (bottom-center, italic serif, warm gray):
"Artık bu kitabın yalnızca bir sayfası değil — bütün bir dünyası SANA ait."

BOTTOM-LEFT: a gold-foil circular seal (~14% frame width, emboss effect) with a small heart + paintbrush icon in the center, text around the ring: "SANATÇI MÜHRÜ".

BOTTOM-RIGHT: a small illustrated bouquet of crayons + paintbrushes tied with a warm ribbon (line-art with a touch of color) — premium completion motif.

BOTTOM-CENTER (below the italic quote): a dashed signature line with small label underneath:
"Sanatçı İmzası"

LANGUAGE: ALL text MUST be in TURKISH. Do NOT translate. Write EXACTLY as provided above.

TYPOGRAPHY:
- "TAMAMLANDI": large bold serif display (like Fraunces Bold), chocolate brown, optically centered
- Subtitle italic script: warm brown italic
- Child name "${heroName}": large calligraphic warm-orange script with hand-drawn underline flourish — the HERO of the page
- Body lines: elegant readable serif in warm brown, natural spacing, each line comfortably breathing
- Turkish diacritics (ş ç ğ ü ö ı İ) PERFECT — every dot and cedilla exact

CRITICAL:
- FLAT full bleed — paper IS the page, no table, no 3D perspective, no curl, no bent corners, no warp
- Feels PREMIUM and PROUD — like a certificate a child will frame on their wall
- Warm, celebratory, heartfelt — NOT childish or cartoonish
- Only ONE of each text block; do NOT duplicate

ART STYLE: Premium vintage certificate aesthetic with children's craft-journal warmth. Authentic hand-lettering feeling. No AI-cold perfection — small imperfections welcomed for warmth.`;
}

class CoverPromptArchitect {
  /**
   * @param {object} bookData - book.json verisi
   * @param {object} childInfo - Cocuk/alici bilgileri
   */
  constructor(bookData, childInfo) {
    this.bookData = bookData;
    this.childInfo = childInfo;
    this.isAdult = bookData.targetAudience === "yetiskin";
    this.style = bookData.style || "3D Pixar/Disney CGI";

    // Karakter aciklamasi (prompt-architect'ten farkli — daha kisa ve kapak odakli)
    this.genderTr = childInfo.gender === "kiz" ? "kiz" : "erkek";
    this.genderEn = childInfo.gender === "kiz" ? "girl" : "boy";
    this.age = childInfo.age || "6";
  }

  /**
   * On kapak prompt'u olusturur
   * @param {object} options
   * @param {string} options.characterDesc - Karakter fiziksel aciklama (profil referansindan)
   * @returns {string} Kapak prompt'u
   */
  buildCoverPrompt(options = {}) {
    const { characterDesc } = options;
    const book = this.bookData;
    const child = this.childInfo;
    const name = child.name;

    // Kitap basligini kisisellesir
    const personalizedTitle = this._personalizeTitle(book.title, name);

    // Tema bazli sahne aciklamasi
    const sceneDesc = this._getThemeScene(book);
    const moodTr = this._getMoodTr(book);
    const characterClothing = this._getCharacterClothing(book);

    // Tema bazli tipografi
    const typographyStyle = this._getCoverTypography(book);

    // UrunStudio-aligned cinematic cover prompt
    const moodLight = /magical|mysterious/.test(moodTr) ? "cool blue-purple with a glowing magical light source in the scene" :
      /triumphant|proud|joyful|excited/.test(moodTr) ? "warm golden hour with honey-gold rim light on the character" :
      /determined|intense/.test(moodTr) ? "high-contrast amber and deep shadow, dramatic side light" :
      "warm golden-hour with soft volumetric beams and gentle magical sparkles";

    return `CINEMATIC CHILDREN'S STORYBOOK COVER — 2:3 portrait, THIN FLEXIBLE magazine-style softcover (NOT hardcover, NO thick spine, NO leather, NO embossed debossing). This cover must look like a FRAME FROM A PIXAR FILM — cinematic quality, emotional depth, visually stunning.

═══ CINEMATIC COMPOSITION (3-layer depth) ═══
- FOREGROUND: Scene elements close to camera — leaves, grass blades, rocks, objects, props (theme-appropriate) — slightly blurred, adding depth.
- MIDGROUND: ${name} as HERO in a DYNAMIC ACTION POSE — NOT standing still, NOT looking at camera. Caught mid-moment: reaching, running, leaping, gasping in wonder, discovering, climbing.
- BACKGROUND: Rich themed environment — sky, trees, field, stadium, city — softly focused, sets the world.
- This 3-layer approach creates CINEMATIC DEPTH like a Pixar film frame.

═══ CINEMATIC LIGHTING (emotion through light) ═══
- ${moodLight}.
- Golden hour rim light on character (warm glow outlining hair and shoulders).
- Volumetric light beams (sunlight filtering through trees / stadium roof / clouds), dust/sparkle particles visible.
- A MAGICAL LIGHT SOURCE somewhere in the scene matching the story's theme (glowing ball, enchanted object, stadium floodlight flare, sparkling trophy).
- Light = emotion: warm gold = adventure/nostalgia, cool blue = mystery, purple/pink = magic. NO flat even lighting.

═══ TITLE TYPOGRAPHY (integrated into the scene) ═══
TITLE: "${personalizedTitle}"
${typographyStyle}
- Title INTERACTS with the scene — letters behind a tree branch, sitting on clouds, glowing with magic, resting on grass, partially occluded by foreground props.
- The child's name "${name}" in playful HAND-LETTERED warm-color script with decorative flourishes.
- Rest of the title in chunky friendly display font with contrasting weight.
- NOT a floating text block above the scene — PART of the world.
- Must still be clearly READABLE despite integration.
- Title appears ONLY ONCE on the cover. No repetition. No subtitle restatement.

═══ TURKISH CHARACTERS (CRITICAL) ═══
"${personalizedTitle}" spelled EXACTLY letter by letter.
- ı (dotless i) ≠ i | İ (dotted cap I) ≠ I | ş ≠ s | ç ≠ c | ğ ≠ g | ö ≠ o | ü ≠ u
- Mixed case as provided. "Macerası" NOT "MACERASI" or "MACERAŞI".

═══ MASALSENSIN BRAND VOCAB (MUTLAK) ═══
- "sihir", "sihirli", "büyü", "büyülü", "mucize", "tılsım" KELİMELERİ YASAK (görselde dahi).
- Yerine: "ışık", "yıldız", "kıvılcım", "hayal", "kalp" gibi yere basan kelimeler.

═══ CONTRAST RULE ═══
Title MUST be readable against scene. Use: text shadow, glow outline, or light/dark contrast. If scene dark → light warm text. If light → dark navy text with subtle shadow.

═══ CHARACTER (emotion-first) ═══
${name}, a ${this.age}-year-old Turkish ${this.genderEn}. ${characterDesc || this._getDefaultCharacterDesc()}. ${characterClothing}. Character face MUST match the reference profile image EXACTLY — same face, hair, skin tone, proportions.
- THE CHARACTER'S FACIAL EXPRESSION is the FOCAL POINT of the cover.
- Emotion tells the story: wide-eyed wonder, brave determination, joyful discovery, curious fascination, quiet pride.
- Character caught in ACTION — never static, never posed-for-camera.
- Dynamic pose hints at the story: reaching for something, mid-stride, looking up in awe, kicking, jumping.
- Scene context: ${sceneDesc}.

═══ PERSONALIZATION BADGE ═══
Turkish text: "Bu kitap ${name} için özel olarak üretilmiştir"
Style: Premium gold foil seal (#D4A574) with subtle emboss effect — like a quality certification stamp. Small, BOTTOM-RIGHT corner. Makes the book feel SPECIAL and PREMIUM.

═══ BOOK FORMAT (CRITICAL) ═══
- THIN FLEXIBLE PAPERBACK — magazine-style, saddle-stitched like a children's activity magazine. NOT a thick novel. NOT a hardcover.
- Render as a FLAT print-ready cover page (2:3 portrait, full-bleed artwork). NO 3D mockup, NO page curl, NO shelf perspective, NO hands holding the book, NO spine visible.
- ABSOLUTELY NOT: hardcover, case-bound, leather, cloth, thick spine, gold-foil embossed title, raised letters.

═══ ART STYLE ═══
${this._getArtStyle(book)} CINEMATIC 3D Pixar/Disney CGI — like a key frame from a Pixar feature film (Encanto / Coco / Luca quality — NOT cheap mobile-game graphics). Mood: ${moodTr}.
- Stylized 3D CGI with Pixar-ified face: bigger expressive eyes, softer rounder features, exaggerated emotion.
- Rich textures: fabric folds, individual hair strands, skin subsurface scattering.
- Environmental storytelling: small details in the scene that hint at the adventure.
- NO anime, NO 2D flat, NO cheap 3D, NO static posed character, NO stock-photo feel, NO generic AI sheen, NO second character unless the story requires.

═══ QUALITY BAR ═══
This cover should make someone STOP SCROLLING and say "I want this for my child." Premium bookstore bestseller quality.`;
  }

  /**
   * "Hikayemizin Kahramani" sayfasi prompt'u
   */
  buildHeroPagePrompt(options = {}) {
    const { characterDesc } = options;
    const book = this.bookData;
    const name = this.childInfo.name;
    const themeElements = this._getThemeDecorations(book);

    return `CHILDREN'S STORYBOOK SPECIAL PAGE — "Meet the Hero" page, 2:3 portrait format.

TITLE TEXT: "Hikayemizin Kahramani"
SUBTITLE TEXT: "${name}"
TYPOGRAPHY — "Hikayemizin Kahramani" in elegant decorative header font at top. Character name "${name}" in large bold playful font below. Turkish characters PERFECT.

CHARACTER: ${name}, a ${this.age}-year-old Turkish ${this.genderEn}. ${characterDesc || this._getDefaultCharacterDesc()}. Standing proudly in center with confident happy pose, hands on hips or arms crossed.

DECORATIVE FRAME: Beautiful ornate illustrated frame around the character, themed with ${themeElements}. The frame is decorative and magical.

BOTTOM TEXT: "Bu macera ${name} icin ozel olarak yazildi" in small elegant font.

COMPOSITION: Title top 15%, character in decorative frame center 70%, bottom text 15%.

ART STYLE: ${this._getArtStyle(book)} Warm, inviting, heroic presentation. Mood: gururlu, ozel, heyecanli.`;
  }

  /**
   * "Biliyor Muydunuz?" sayfasi prompt'u
   */
  buildFunFactPagePrompt(funFact, options = {}) {
    const book = this.bookData;
    const facts = funFact.facts || [];
    const title = funFact.title || "Biliyor Muydunuz?";
    const icon = funFact.icon || book.theme?.icon || "***";
    const themeElements = this._getThemeDecorations(book);

    // Bilgileri metin olarak formatla
    let factsText = "";
    for (let i = 0; i < Math.min(facts.length, 5); i++) {
      factsText += `\n${i + 1}. "${facts[i]}"`;
    }

    return `CHILDREN'S STORYBOOK SPECIAL PAGE — "Biliyor Muydunuz?" fun facts page in TURKISH language, 2:3 portrait format.

CRITICAL: ALL text on this page MUST be in TURKISH. The title and all facts are in Turkish language. Turkish characters (ş, ç, ğ, ü, ö, ı) must be PERFECT.

TITLE TEXT: "${title}"
TYPOGRAPHY — Title in large playful bold font at top with ${icon} emoji icon. Each fact in clear readable children's book font. Turkish characters PERFECT.

FACTS (display as numbered cards or bubbles):${factsText}

DECORATIVE ELEMENTS: Themed background with ${themeElements}. Each fact in its own decorative card/bubble/frame. Colorful and engaging design that makes children excited to read.

COMPOSITION: Title with icon top 15%, facts in decorated cards center 75%, decorative footer 10%.

ART STYLE: ${this._getArtStyle(book)} Bright, educational, fun atmosphere. The facts should be clearly readable against their card backgrounds. Mood: merakli, eglenceli, ogretici.`;
  }

  /**
   * "Gonderenden Not" sayfasi prompt'u — async, kategori-farkindali.
   * Boyama → Tamamlandı Sertifikası (UrunStudio tarzı).
   * Hikaye / Özel Gün → UrunStudio'nun pickSender + AI-yazilmis mektup formati.
   */
  async buildSenderNotePrompt(options = {}) {
    const book = this.bookData;
    const name = this.childInfo.name;
    const category = book.category || options.category;

    // Boyama kitabı: Tamamlandı Sertifikası
    if (category === "boyama") {
      return buildBoyamaCertificatePrompt(name);
    }

    // Hikaye / Özel gün: rastgele gönderen + AI-generated mektup
    const sender = pickSender();
    const hitap = sender.hitap(name);
    let noteContent;
    try {
      noteContent = await generateNoteBody(book, name, this.childInfo.age, sender.key);
    } catch (e) {
      noteContent = this._buildDynamicNote(name, this.childInfo.senderName || "ailen", book);
    }
    const themeDecos = this._getThemeDecorations(book);

    return "CHILDREN'S STORYBOOK PERSONAL NOTE PAGE \u2014 2:3 portrait format. FLAT FULL PAGE \u2014 the page IS the stationery paper, filling the entire frame edge to edge. No table, no background surface.\n\n" +
"THE PAGE: Beautiful aged cream/ivory vintage stationery paper with warm subtle texture. Slightly yellowed corners, gentle aged feel. The paper fills the ENTIRE frame.\n\n" +
"TOP: An ornate wax seal with a heart in the center, warm burgundy color, positioned top-center. Below it a delicate decorative line.\n\n" +
"LETTER TEXT \u2014 written in GENUINE HANDWRITTEN dark brown ink:\n" +
"\"\"\"\n" +
hitap + ",\n\n" +
noteContent + "\n\n" +
sender.signoff + "\n" +
"\"\"\"\n\n" +
"LANGUAGE: ALL text MUST be in TURKISH. Do NOT translate to English. Write EXACTLY as provided above.\n\n" +
"TYPOGRAPHY:\n" +
"1. \"" + hitap + "\" \u2014 large flowing elegant cursive at top, dark brown ink, personal and warm\n" +
"2. The child name \"" + name + "\" \u2014 bolder with more ink pressure wherever it appears\n" +
"3. Body \u2014 genuine warm handwriting, dark brown (#3E2723), natural organic flow, slightly uneven baselines, generous 1.8x line spacing\n" +
"4. Signature \u2014 larger stylized calligraphic handwriting with small hand-drawn heart\n" +
"5. Turkish characters (\u015f \u00e7 \u011f \u00fc \u00f6 \u0131 \u0130) MUST be PERFECT\n\n" +
"DECORATIVE DETAILS ON THE PAPER:\n" +
"- Top center: wax seal with heart (burgundy)\n" +
"- Top right corner: a tiny hand-painted watercolor themed illustration (" + themeDecos.split(",")[0] + ")\n" +
"- Bottom left: a small watercolor golden star\n" +
"- Bottom right: a beautiful vintage fountain pen lying diagonally with a tiny ink drop\n" +
"- Very subtle delicate pencil-sketch vine decorations along left margin\n\n" +
"CRITICAL:\n" +
"- FLAT full bleed \u2014 paper IS the page, no table, no 3D perspective\n" +
"- The handwriting must feel REAL and WARM\n" +
"- ALL TEXT IN TURKISH \u2014 do NOT translate\n\n" +
"ART STYLE: Photorealistic vintage stationery, genuine handwritten letter aesthetic. Warm, intimate, personal.";
  }

  /**
   * Gonderene gore dinamik not metni olusturur
   */
  _buildDynamicNote(childName, senderName, book) {
    const s = senderName.toLowerCase();
    const customMsg = this.childInfo.customMessage;

    // Kullanici kendi mesajini yazdiysa onu kullan
    if (customMsg && customMsg.trim().length > 20) {
      return this._getSenderHitap(senderName, childName) + ",\n\n" + customMsg;
    }

    // Dinamik not — gonderene gore
    const hitap = this._getSenderHitap(senderName, childName);
    let mesaj;

    if (s.includes("anne") && s.includes("baba")) {
      mesaj = "Bu kitap senin için özel olarak hazırlandı. Çünkü dünyada senden daha özel bir çocuk yok.\n\n" +
"Tıpkı bu hikâyedeki gibi, sen de her gün biraz daha büyüyorsun, biraz daha güçleniyorsun. Bazen zorlanırsın, bazen düşersin — ama biz her zaman yandayız.\n\n" +
"Senin ilk adımlarını, ilk gülüşünü, ilk \"anne\" ve \"baba\" deyişini hiç unutmadık. Şimdi bu kitabı okurken o gözlerindeki ışığı görmek istiyoruz.";
    } else if (s.includes("anne")) {
      mesaj = "Bu kitap senin için özel olarak hazırlandı. Çünkü sen benim her şeyimsin.\n\n" +
"Tıpkı bu hikâyedeki gibi, sen de her gün biraz daha büyüyorsun. Bazen zorlanırsın — ama annen her zaman yanında.\n\n" +
"Senin büyüdüğünü görmek, bana gülerek koşman... Dünyada bundan güzel bir şey yok.";
    } else if (s.includes("baba")) {
      mesaj = "Bu kitap senin için özel olarak hazırlandı. Çünkü sen benim en büyük gururumuz.\n\n" +
"Hayatta ne olursa olsun pes etme. Düşsen de kalk, her seferinde daha güçlü ol. Tıpkı bu hikâyedeki gibi.\n\n" +
"Sen büyüdükçe seninle ne kadar gurur duyduğumu bir bilsen...";
    } else if (s.includes("teyze")) {
      mesaj = "Bu kitap senin için özel olarak hazırlandı. Çünkü sen özel bir çocuksun — içindeki o cesaret ve azim, tıpkı bu hikâyedeki gibi.\n\n" +
"Hayatta ne olursa olsun pes etme. Düşsen de kalk, her seferinde daha güçlü ol.\n\n" +
"Senin büyüdüğünü görmek, bana gülerek \"Teyze!\" diye koşman... Dünyada bundan güzel bir şey yok.";
    } else if (s.includes("hala")) {
      mesaj = "Bu kitap senin için özel olarak hazırlandı. Çünkü sen özel bir çocuksun — içindeki o cesaret ve azim, tıpkı bu hikâyedeki gibi.\n\n" +
"Hayatta ne olursa olsun pes etme. Düşsen de kalk, her seferinde daha güçlü ol.\n\n" +
"Senin büyüdüğünü görmek, bana gülerek \"Hala!\" diye koşman... Dünyada bundan güzel bir şey yok.";
    } else if (s.includes("dede")) {
      mesaj = "Bu kitap senin için özel olarak hazırlandı. Deden seni o kadar çok seviyor ki bu sevgiyi kelimelere sığdıramıyor.\n\n" +
"Tıpkı bu hikâyedeki gibi, cesur ol, azimli ol. Deden de küçükken böyle başladı.\n\n" +
"Ne kadar büyürsen büyü, benim için hep o minik torunum kalacaksın.";
    } else if (s.includes("nine") || s.includes("anneanne") || s.includes("babaanne")) {
      mesaj = "Bu kitap senin için özel olarak hazırlandı. Ninen seni o kadar çok seviyor ki bu sevgiyi kelimelere sığdıramıyor.\n\n" +
"Sen küçükken dizlerimde zıplardın, şimdi büyüdün ama benim için hep o minik bebek kalacaksın.\n\n" +
"Bu kitabı her okuduğunda bil ki ninen seni düşünüyor.";
    } else if (s.includes("abi") || s.includes("abla")) {
      mesaj = "Bu kitap senin için özel olarak hazırlandı. Küçük kardeşim, sen benim en büyük gururumuz.\n\n" +
"Tıpkı bu hikâyedeki gibi, cesur ol ve hayallerinin peşinden koş.\n\n" +
"Senden her zaman çok şey bekliyorum — çünkü senin ne kadar harika olduğunu biliyorum.";
    } else if (s.includes("dayı") || s.includes("dayi")) {
      mesaj = "Bu kitap senin için özel olarak hazırlandı. Çünkü sen özel bir çocuksun.\n\n" +
"Hayatta ne olursa olsun pes etme. Dayın her zaman arkanızda.\n\n" +
"Birlikte geçirdiğimiz her an benim için çok değerli.";
    } else {
      // Genel — arkadas, tanidik, bilinmeyen
      mesaj = "Bu kitap senin için özel olarak hazırlandı. Çünkü sen özel bir çocuksun — içindeki o cesaret ve azim, tıpkı bu hikâyedeki gibi.\n\n" +
"Hayatta ne olursa olsun pes etme. Düşsen de kalk, her seferinde daha güçlü ol.\n\n" +
"Ne zaman cesur bir adım atsan, bil ki seni çok seven biri var.";
    }

    return hitap + ",\n\n" + mesaj;
  }

  /**
   * Gonderene gore uygun hitap
   */
  _getSenderHitap(senderName, childName) {
    const s = senderName.toLowerCase();
    if (s.includes("anne") && s.includes("baba")) return "Can\u0131m " + childName;
    if (s.includes("anne")) return "Can\u0131m " + childName;
    if (s.includes("baba")) return "O\u011flum " + childName;
    if (s.includes("teyze") || s.includes("hala") || s.includes("dayı") || s.includes("dayi") || s.includes("amca")) return "Canım yeğenim " + childName;
    if (s.includes("dede") || s.includes("nine") || s.includes("anneanne") || s.includes("babaanne")) return "Can\u0131m torunum " + childName;
    if (s.includes("abi") || s.includes("abla")) return "Can\u0131m karde\u015fim " + childName;
    return "Sevgili " + childName;
  }

  /**
   * Gonderene gore uygun kapanış
   */
  _getSenderSignoff(senderName) {
    const s = senderName.toLowerCase();
    if (s.includes("anne") && s.includes("baba")) return "Seni çok seven,\nAnnen ve Baban ❤️";
    if (s.includes("anne")) return "Seni çok seven,\nAnnen ❤️";
    if (s.includes("baba")) return "Seninle gurur duyan,\nBaban ❤️";
    if (s.includes("teyze")) return "Seni çok seven,\nTeyzen ❤️";
    if (s.includes("hala")) return "Seni çok seven,\nHalan ❤️";
    if (s.includes("dede")) return "Seni çok seven,\nDeden ❤️";
    if (s.includes("nine") || s.includes("anneanne") || s.includes("babaanne")) return "Seni çok seven,\nNinen ❤️";
    if (s.includes("abi")) return "Seni çok seven,\nAbin ❤️";
    if (s.includes("abla")) return "Seni çok seven,\nAblan ❤️";
    if (s.includes("dayı") || s.includes("dayi")) return "Seni çok seven,\nDayın ❤️";
    return "Seni çok seven,\n" + senderName + " ❤️";
  }

  /**
   * MESLEK DIPLOMASI sayfasi prompt'u — meslek-hikayeleri kategorisine ozel.
   * book.json'da meslekProfile alani olmali:
   *   { labelTR, diplomaTitle, diplomaSymbols, uniformEN, toolsEN }
   * Yoksa genel "Kahramanlik Sertifikasi" olarak uretir.
   */
  buildMeslekDiplomaPrompt(options = {}) {
    const book = this.bookData;
    const name = this.childInfo.name;
    const profile = book.meslekProfile || {};
    const meslekLabel = profile.labelTR || "Meslek Kahramani";
    const diplomaTitle = profile.diplomaTitle || (meslekLabel.toUpperCase() + " DIPLOMASI");
    const symbols = profile.diplomaSymbols || "profession-appropriate heraldic emblems (stars, laurel, ribbons)";
    const tools = profile.toolsEN || "profession-specific tools";

    return `CHILDREN'S STORYBOOK OFFICIAL DIPLOMA PAGE — 2:3 portrait format, FLAT FULL PAGE, the page IS the parchment filling the entire frame edge to edge. No table, no 3D, no curl, no perspective.

═══ PROFESSION IDENTITY (READ FIRST, CRITICAL) ═══
This diploma is specifically for ${name} as a ${meslekLabel}. ONLY ${meslekLabel} context. Every symbol, emblem, color, illustration must come from ${meslekLabel}. Do NOT use symbols from football, medicine, space, dance, or any other profession unless this book IS that profession.

This is the closing emotional page of a personalized children's book about ${name} becoming a ${meslekLabel}. It is a REAL-looking diploma that a 5-10 year old child will proudly show to their family.

THE PAGE: Premium warm ivory/cream parchment with subtle aged texture and a rich ornate border frame. Slightly aged corners, gentle vintage feel. Paper fills the ENTIRE frame.

ORNATE BORDER (4 edges):
- Gold-foil ornamental frame with laurel wreaths, fine flourishes, and these specific ${meslekLabel} heraldic symbols at the corners: ${symbols}. Do NOT draw symbols of other professions.
- Corners: small ornamental rosettes
- Delicate gold-leaf pattern running along all 4 edges

TOP HEADER (large, centered):
"${diplomaTitle}" — in ornate calligraphic display serif, deep navy (#1A237E) with subtle gold shimmer. Letter-spaced, elegant, optically centered. Small laurel wreath under the heading.

CENTER CONTENT (displayed in elegant Turkish):

Line 1 (centered, warm brown serif italic): "İşbu belge ile"

Line 2 — BIG hand-lettered child name, calligraphic display script, rich gold (#C9A227), with a subtle gold underline flourish: "${name}"

Line 3 (centered, warm brown serif):
"adlı kahramanın ${meslekLabel.toLowerCase()} olarak resmi onayını ilan eder."

Line 4 — CENTER MEDALLION (circular emblem ~25% frame width): a beautifully illustrated profession emblem. The emblem contains the PROFESSION SYMBOLS arranged heraldically (using: ${tools}). The emblem has a ribbon banner underneath reading: "HAYALİN GERÇEK OLDU"

Line 5 (centered, warm brown italic):
"Cesaretle, merakla ve tutkuyla, bu unvanı hak ettin. Hayalinin kahramanı sen oldun."

TWO SIGNATURE LINES at the bottom of the diploma:
- LEFT: "Baş Eğitmen" — below a handwritten-style signature flourish
- RIGHT: "MasalSensin" — below another signature flourish (a small brand mark / star)

DATE LINE (centered, between signatures):
"Tarih: _____ / _____ / _____" (dotted blank lines for the child to fill in)

BOTTOM-LEFT: a gold-foil circular seal (~14% frame width, emboss effect) with profession-specific icon in center and text around the ring: "ONAY MÜHRÜ".

BOTTOM-RIGHT: a small 3D Pixar illustration of ${name} in the ${meslekLabel} uniform holding this very diploma, beaming with pride. ~18% frame width. Face matches the cover reference.

LANGUAGE: ALL text MUST be in TURKISH. Do NOT translate. Write EXACTLY as provided above.

TYPOGRAPHY:
- "${diplomaTitle}": large ornate calligraphic serif, deep navy with gold shimmer
- Child name: large flowing calligraphic script in rich gold — the HERO of the page
- Body lines: elegant readable warm brown serif, natural spacing
- Italic lines: warm brown italic serif
- Turkish diacritics (ş ç ğ ü ö ı İ) PERFECT — every dot and cedilla exact

MASALSENSIN BRAND VOCAB (MUTLAK):
- "sihir", "sihirli", "büyü", "büyülü", "mucize", "tılsım" KELİMELERİ YASAK.
- Yerine: "ışık", "yıldız", "kıvılcım", "hayal", "kalp" kullan.

CRITICAL:
- FLAT full bleed — parchment IS the page, no 3D, no curl, no warp, no perspective.
- Feels PREMIUM and OFFICIAL — like a real graduation diploma
- Small 3D Pixar illustration of ${name} bottom-right supports but does NOT compete with the diploma text
- Only ONE of each text block; no duplications

ART STYLE: Premium vintage-meets-modern diploma aesthetic. Rich cream parchment, gold foil accents, heraldic profession symbols, elegant calligraphy. Warmth + authority.

═══ CHARACTER IDENTITY (FROM REFERENCE IMAGE — CRITICAL) ═══
The small 3D Pixar illustration of ${name} in the bottom-right corner MUST match the child character shown in the REFERENCE IMAGE (the front cover). Same face, same hair, same skin tone, same eyes. Only the profession uniform and pose differ.`;
  }

  /**
   * IC KAPAK (title page) prompt'u — kapaktan sonra gelen elegant baslangic sayfasi.
   * Aged paper + ornate frame + child-personalized title.
   */
  buildInnerCoverPrompt(options = {}) {
    const book = this.bookData;
    const name = this.childInfo.name;
    const personalizedTitle = this._personalizeTitle(book.title, name);
    const themeDecos = this._getThemeDecorations(book);
    const moodTone = (book.theme && book.theme.icon) ? book.theme.icon : "***";

    return `CHILDREN'S STORYBOOK INNER COVER (TITLE PAGE) — 2:3 portrait, FLAT FULL PAGE.

THE PAGE: Premium aged cream/ivory paper with a delicate warm subtle texture, edge-to-edge full-bleed. NO table, NO 3D perspective, NO page curl. The paper IS the page. Slightly aged corners, gentle vintage feel — like an heirloom storybook's first interior page.

ORNATE FRAME (all four edges):
- Hand-drawn double-line decorative border in warm chocolate brown (#3E2723) with tiny gold flourishes at corners.
- Border decorations evoke the book's theme — ${themeDecos}.
- Corner ornaments: small rosettes / laurel sprigs / themed motifs (sport iconography for sports, baby motifs for nursery, etc.) in warm amber-gold.
- The border is GENEROUS but not heavy — feels like an antique book plate.

CENTER STACK (vertical, generous breathing room):

Line 1 (top, small italic warm-brown serif): "MasalSensin Sunar"

Line 2 (large hand-lettered Turkish display title — THE HERO of the page):
"${personalizedTitle}"
- Font: warm hand-lettered serif (Fraunces / Recoleta / Playfair Display feel) in warm chocolate brown (#3E2723)
- Child's name "${name}" with subtle warm orange (#D17A2C) accent and a hand-drawn underline flourish
- Optically centered, generous letter spacing
- Title appears EXACTLY ONCE — no duplication, no subtitle restatement

Line 3 (mid, italic warm brown): "— ${name} için, kalbinden bir hikaye —"

Line 4 (bottom-center, small ornamental separator): three small gold dots or a tiny laurel sprig

Line 5 (very bottom, small elegant warm-gray serif): "Yıl: 2026"

PERSONALIZATION SEAL (BOTTOM-LEFT, ~14% frame width):
- Gold-foil circular emboss seal (#D4A574)
- Center icon: small heart + storybook
- Ring text: "Bu kitap ${name} için özel üretilmiştir"

LANGUAGE: ALL text MUST be in TURKISH. Do NOT translate. Write EXACTLY as provided above.

TYPOGRAPHY:
- "MasalSensin Sunar": small italic serif, warm brown, top
- Personalized title: large warm hand-lettered serif display
- Subtitle: italic warm brown serif
- Turkish diacritics (ş ç ğ ü ö ı İ) MUST be PERFECT — every dot and cedilla exact
- "Macerası" NOT "MACERASI", "için" NOT "icin"

CRITICAL:
- FLAT full bleed — paper IS the page, no table, no 3D perspective, no curl
- Premium heirloom feel — like a hardcover storybook's interior title page
- Warm, intimate, special — NOT generic, NOT cartoonish
- NO sihir/büyü/mucize wording (brand convention) — use natural emotional words like "kalp", "hayal", "kıvılcım", "ışık" instead
- Only ONE title block; do NOT duplicate

ART STYLE: Premium vintage storybook plate aesthetic. Authentic hand-lettering feeling. Warm, heritage, heartfelt — like the first page of a beloved family heirloom book.`;
  }

  /**
   * ITHAF SAYFASI prompt'u — kahramana adanan duygusal sayfa.
   * Watercolor stationery + heart-warm dedication text + light decorations.
   */
  buildDedicationPrompt(options = {}) {
    const book = this.bookData;
    const name = this.childInfo.name;
    const themeDecos = this._getThemeDecorations(book);
    const moodHint = book.theme?.dedication || "her gün biraz daha büyüyen, her sayfada yeni bir ışık keşfeden bir çocuğa";

    return `CHILDREN'S STORYBOOK DEDICATION PAGE (İthaf) — 2:3 portrait, FLAT FULL PAGE.

THE PAGE: Soft cream/ivory watercolor stationery paper with gentle warm texture and a hint of dusty rose tint, edge-to-edge full-bleed. NO table, NO 3D perspective. The paper IS the page. Calming, intimate, almost like a private love letter.

DECORATIVE FRAME (delicate, asymmetric):
- Top-left: small watercolor cluster — themed motif (${themeDecos.split(",")[0]}) in soft pastel
- Top-right: a few delicate gold-leaf strokes / tiny stars
- Bottom-left: a single hand-painted flower (baby's breath / wildflower) with a thin ribbon trail
- Bottom-right: small watercolor heart in warm coral (#E8927C)
- The decorations are SPARSE and intentional — not crowded; the page breathes.

CENTER STACK (vertical, very generous spacing):

Line 1 (top, hand-lettered italic warm brown calligraphy, ~26pt): "İthaf"

Line 2 (mid-upper, warm hand-lettered serif, ~38pt, optically centered):
"Bu kitap ${name}'a..."
- "${name}" in subtle warm coral italic with a tiny heart drawn next to it

Line 3 (center body, italic warm-brown serif, ~24pt, 1.6 line spacing, soft and intimate):
"Kalbinde taşıdığı her duygu için,
gözlerinde parlayan her hayal için,
küçük adımlarıyla aştığı her engel için —
bu hikaye senin için."

Line 4 (mid-lower, small italic warm-gray serif, signature style):
"— Sevgiyle, MasalSensin"

Line 5 (very bottom-center, very small italic warm-gray): "2026"

LANGUAGE: ALL text MUST be in TURKISH. Do NOT translate. Write EXACTLY as provided above.

TYPOGRAPHY:
- "İthaf": flowing italic calligraphy in warm brown (#4E342E)
- Dedication body: elegant italic serif in warm chocolate brown (#3E2723), generous spacing
- Child name "${name}": soft warm coral (#E8927C) italic with tiny heart accent
- Signature line: smaller, italic, warm gray
- Turkish diacritics (ş ç ğ ü ö ı İ) MUST be PERFECT
- "İthaf" with capital İ (DOTTED), NOT "Ithaf"

CRITICAL:
- FLAT full bleed — paper IS the page, no 3D perspective, no curl
- Feels like a private, heartfelt dedication — NOT promotional, NOT loud
- Warm, intimate, emotionally resonant — softness over brightness
- NO sihir/büyü/mucize wording (brand convention) — use grounded emotional words
- Generous white space — the page should breathe
- Only ONE dedication body; do NOT duplicate

ART STYLE: Watercolor stationery with hand-lettered typography. Soft warm palette (cream + dusty rose + warm chocolate + soft coral + touch of gold). Premium, intimate, heirloom quality — like a personal letter slipped into the front of the book.`;
  }

  /**
   * KAPANIS (SON) sayfasi prompt'u — kitabin son sayfasi, sicak ve duygusal.
   * Closing message + decorative motifs. Optionally includes parent message.
   */
  buildEndingPrompt(options = {}) {
    const book = this.bookData;
    const name = this.childInfo.name;
    const themeDecos = this._getThemeDecorations(book);
    const customMessage = (this.childInfo.customMessage && this.childInfo.customMessage.trim().length > 10)
      ? this.childInfo.customMessage.trim()
      : null;

    const closingBody = customMessage
      ? customMessage
      : `Bu hikaye burada sona erse de, ${name}'in macerası daha yeni başlıyor.\n\nHer yeni gün, yeni bir sayfa.\nHer adım, yeni bir keşif.\nVe her gece, yeni bir yıldız.`;

    return `CHILDREN'S STORYBOOK CLOSING PAGE (SON) — 2:3 portrait, FLAT FULL PAGE.

THE PAGE: Warm cream/honey-tinted vintage paper with a soft golden-hour glow on the texture, edge-to-edge full-bleed. NO table, NO 3D perspective. The paper IS the page. Like the last page of a beloved bedtime book — warm, nostalgic, hopeful.

DECORATIVE FRAME (golden-hour atmosphere):
- Top: a delicate hand-painted golden sunset arc with subtle warm rays radiating downward
- Bottom: a horizon line of soft watercolor — themed gentle silhouettes (${themeDecos.split(",")[0]}) in warm amber
- Scattered: a few small gold stars / fireflies / sparkle dots gently floating around the page edges
- Corners: tiny ornate flourishes in warm chocolate brown
- The atmosphere should feel like the closing scene of a Pixar film — warm, heartfelt, emotional

CENTER STACK (vertical, ceremonial spacing):

Line 1 (top-center, large hand-lettered Turkish display, ~62pt, warm chocolate brown #3E2723):
"SON"
- Bold serif display font, slightly playful, with two small gold laurel sprigs on either side
- Optically centered, generous space below

Line 2 (mid-upper, italic warm brown serif, ~28pt, optically centered):
"Hikayemiz burada bitti..."

Line 3 (center body, warm hand-lettered italic serif, ~22pt, 1.7 line spacing, soft and warm):
${JSON.stringify(closingBody)}

Line 4 (mid-lower, italic warm coral, ~24pt, signature flourish):
"İyi geceler ${name}."

Line 5 (very bottom, small italic warm-gray serif): "MasalSensin · 2026"

PERSONALIZATION SEAL (BOTTOM-LEFT, ~12% frame width):
- Gold-foil circular emboss seal (#D4A574)
- Center icon: small crescent moon + star
- Ring text: "Bu kitap ${name} için"

LANGUAGE: ALL text MUST be in TURKISH. Do NOT translate. Write EXACTLY as provided above.

TYPOGRAPHY:
- "SON": large bold serif display in warm chocolate brown
- Subtitle: italic warm brown serif
- Body: warm hand-lettered italic serif (Fraunces Italic / Recoleta Italic feel), generous line spacing, intimate
- Child name "${name}": warm coral italic with a tiny heart or star accent
- Turkish diacritics (ş ç ğ ü ö ı İ) MUST be PERFECT
- "İyi geceler" with capital İ (DOTTED), NOT "Iyi geceler"

CRITICAL:
- FLAT full bleed — paper IS the page, no 3D perspective, no curl
- Feels warm, nostalgic, hopeful — like the closing of a beloved bedtime story
- Golden-hour atmosphere — warm, emotional, comforting
- NO sihir/büyü/mucize wording (brand convention) — use grounded emotional words like "ışık", "yıldız", "hayal", "kıvılcım", "kalp"
- Generous breathing room — not crowded
- Only ONE "SON"; do NOT duplicate

ART STYLE: Premium vintage storybook closing-page aesthetic with watercolor warmth. Warm palette (cream + honey + warm chocolate + coral + gold). Heartfelt, nostalgic, emotionally resonant — like the last frame of a Pixar short film.`;
  }

  /**
   * Sahne metin sayfasi promptu - illustrasyonun karsi sayfasi
   * Test'te kanitlanmis format kullanir
   */
  buildTextPagePrompt(scene, options = {}) {
    const book = this.bookData;
    const name = this.childInfo.name;
    const title = scene.title || "";
    const mood = scene.mood || "warm";
    const themeDecos = this._getThemeDecorations(book);

    let text = (scene.text || "").replace(/\{CHILD_NAME\}/g, name);

    const isDark = /magical|mysterious|climactic|intense/.test(mood);
    const bgDesc = this._getMoodBackground(mood);

    // Sahne iceriginden atmosfer ipuclari cikar
    const sceneAtmosphere = this._extractAtmosphereFromText(title, text);

    const colors = isDark
      ? "golden yellow (#FFD600) title, cream white (#FFF8E1) body, warm amber (#FFE082) dialogue, gold bold (#FFD600) for child name"
      : "warm brown (#4E342E) title, dark chocolate (#3E2723) body, warm orange italic (#E65100) dialogue, burnt orange bold (#BF360C) for child name";

    const sceneOutfit = options.sceneOutfit || "";
    const sceneAction = options.sceneAction || title;
    const setting = options.setting || "";
    const miniPose = this._getMiniCharacterPose(mood, title, text);
    const sceneBackdrop = this._getSceneBackdrop(book, mood, title, text);

    return "CHILDREN'S STORYBOOK TEXT PAGE with MINIATURE SCENE VIGNETTE \u2014 2:3 portrait format. This page sits OPPOSITE the scene illustration in a double-page spread. The page shows: a beautiful atmospheric SCENE BACKGROUND matching this moment's weather and environment (rainy court if rain scene, sunny park if park scene, starry night if magical scene, etc.) + a LARGE CENTRAL TEXT PANEL holding the story text + ONE small miniature character acting out the scene in the foreground.\n\n" +
      "CRITICAL NEGATIVE CONSTRAINTS (MUST OBEY):\n" +
      "- DO NOT reproduce the exact composition of the opposite illustration page. Choose a fresh camera angle / framing that reads clearly as a TEXT PAGE.\n" +
      "- DO NOT render a life-size hero character portrait filling the page \u2014 the character is miniature and supporting.\n" +
      "- DO NOT stamp the text directly over a busy illustration. ALWAYS place text inside a clean panel with high contrast.\n\n" +
      "REQUIRED LAYOUT:\n" +
      "- Background: a beautifully illustrated scene atmosphere matching this moment (same weather, same time of day, same setting type as the opposite illustration) but rendered more softly / painterly / out-of-focus in the upper and outer areas so the text panel stays readable. This is NOT a blank decorative page \u2014 it IS the scene world, just staged for reading.\n" +
      "- Central text panel: soft cream / warm off-white with gentle rounded corners and a subtle drop shadow. Dominant in the composition, sitting over the scene background. Holds the full story text clearly.\n" +
      "- Miniature character: ONE small figure (20-30% of page height) placed in the lower foreground or beside the text panel, acting out this exact scene moment \u2014 think storybook \"diorama\" vignette.\n\n" +
      "SCENE TITLE: \"" + title + "\"\n\n" +
      "STORY TEXT (display this EXACT Turkish text inside the central panel, beautifully formatted, fully readable):\n\"\"\"\n" + text + "\n\"\"\"\n\n" +
      "MINIATURE CHARACTER (small, adorable, supporting role \u2014 NOT the main focus):\n" +
      "- " + name + ", a " + this.age + "-year-old Turkish " + this.genderEn + ", SAME exact face and hairstyle as the character profile reference image.\n" +
      "- Rendered in the SAME 3D Pixar-style as the opposite illustration page, high-quality consistent.\n" +
      "- SMALL size: occupies only 20-30% of the page area, positioned at a lower corner or margin beside the text panel \u2014 NEVER over the text.\n" +
      "- SCENE-LOCKED OUTFIT: the miniature MUST be wearing EXACTLY this outfit \u2014 \"" + (sceneOutfit || "the same outfit shown in the scene") + "\". If the outfit reference image is a GRID showing multiple outfits, pick ONLY the outfit matching the description above; DO NOT use any other outfit from the grid. Match colors, style and details precisely.\n" +
      "- SCENE-SPECIFIC ACTION: the miniature is performing / re-enacting this scene's action \u2014 \"" + sceneAction + "\"" + (setting ? " (setting context: " + setting + ")" : "") + ". Use a small charming prop if the scene has one (e.g., basketball, book, telescope) so it reads as a vignette of this exact moment.\n" +
      "- Suggested pose (adjust to fit the action above): " + miniPose + "\n" +
      "- Expression must match the scene mood (\"" + mood + "\").\n" +
      "- Use the reference images provided to lock face, hairstyle, skin tone, and outfit.\n\n" +
      "SCENE BACKGROUND (softly painterly, matching this exact moment):\n" +
      "- " + sceneBackdrop + "\n" +
      "- " + bgDesc + "\n" +
      "- " + sceneAtmosphere + "\n" +
      "- Weather / time-of-day / environment MUST match the scene (rainy if rain scene, golden-hour if sunset scene, etc.).\n" +
      "- Keep the area behind the text panel softer / more desaturated / out-of-focus so text reads with 7:1+ contrast.\n" +
      "- Integrate " + themeDecos + " as small tasteful ornaments scattered around the edges.\n\n" +
      "DESIGN:\n" +
      "- Scene title \"" + title + "\" in large playful bold decorative font at the TOP of the text panel.\n" +
      "- Ornamental decorative divider between title and body text.\n" +
      "- Text panel contrast: always ensure body text has 7:1+ readability against its panel background.\n" +
      "- One (and only one) miniature character figure on the page. No crowds, no duplicated character.\n\n" +
      "TYPOGRAPHY (CRITICAL):\n" +
      "- Use warm rounded friendly sans-serif font throughout (Nunito or Quicksand style).\n" +
      "- Title: VERY LARGE, EXTRA BOLD, subtle shadow, decorative.\n" +
      "- Body text: comfortable children's book reading size, generous 1.6x line spacing, LEFT-ALIGNED prose.\n" +
      "- EMPHASIS:\n" +
      "  * Child name \"" + name + "\" = BOLD + DIFFERENT WARM COLOR.\n" +
      "  * Dialogue in quotes = ITALIC + ACCENT COLOR.\n" +
      "  * Key emotional words = slightly BOLDER.\n" +
      "  * Final sentence = ITALIC for emotional punch.\n" +
      "- NO scene/chapter/page numbers anywhere.\n\n" +
      "TURKISH CHARACTERS (ABSOLUTELY CRITICAL):\n" +
      "Turkish special characters MUST appear EXACTLY as provided:\n" +
      "\u00e7 \u015f \u011f \u00fc \u00f6 \u0131 \u0130 \u2014 do NOT replace with ASCII equivalents.\n" +
      "This is a TURKISH language book. Every character must be perfect.\n\n" +
      "MASALSENSIN BRAND VOCAB (MUTLAK):\n" +
      "- \"sihir\", \"sihirli\", \"b\u00fcy\u00fc\", \"b\u00fcy\u00fcl\u00fc\", \"mucize\", \"t\u0131ls\u0131m\" KEL\u0130MELER\u0130 YASAK (g\u00f6rselde dahi).\n" +
      "- Yerine: \"\u0131\u015f\u0131k\", \"y\u0131ld\u0131z\", \"k\u0131v\u0131lc\u0131m\", \"hayal\", \"kalp\" gibi yere basan kelimeler.\n\n" +
      "COLORS: " + colors + "\n\n" +
      "COMPOSITION DIVERSITY (CRITICAL):\n" +
      "- The miniature character is NOT a copy of the opposite scene illustration. Choose a FRESH camera angle, DIFFERENT pose/staging, side-view or 3/4 view possible.\n" +
      "- Variety is the goal \u2014 a small diorama figurine acting out the scene from a NEW perspective, not the same composition as the scene illustration.\n" +
      "- Place the miniature at a lower corner or beside the panel like a sticker, NOT centered in the page.\n\n" +
      "ART STYLE: Premium children's storybook interior, cinematic miniature-diorama feel \u2014 the character performs the scene in a small charming vignette while the story text anchors the page. Reference visual language: high-quality Pixar/DreamWorks 3D style, same as scene illustrations. NOT flat typography, NOT a pure text page \u2014 the page is ALIVE.";
  }

  /**
   * Mood ve sahne iceriginden minyatur karakter pozu sec
   */
  _getMiniCharacterPose(mood, title, text) {
    const t = ((title || "") + " " + (text || "")).toLowerCase();
    const m = (mood || "").toLowerCase();
    if (/mysterious|magical|curious/.test(m) || /yıldız|gök|uzay|keşif/.test(t)) return "reaching up curiously toward a small floating glow, eyes wide with wonder";
    if (/triumphant|proud|confident/.test(m) || /zafer|kazandı|ödül|şampiyon/.test(t)) return "arms raised in quiet victory, warm proud smile";
    if (/joyful|excited|energetic|humorous/.test(m)) return "mid-jump with a bright laugh, arms out, energy radiating";
    if (/dreamy|peaceful|reflective|emotional/.test(m)) return "sitting cross-legged with chin on hands, looking softly toward the text panel, gentle smile";
    if (/determined|intense|climactic/.test(m)) return "leaning forward with focused expression, fists lightly clenched, ready pose";
    if (/nervous/.test(m)) return "shyly peeking from behind the text panel edge, one hand half-raised in a small wave";
    return "standing in a relaxed storytelling pose beside the text panel, one hand gesturing toward the story, friendly smile";
  }

  /**
   * Sahne icin yumusak arka plan tarifi
   */
  _getSceneBackdrop(book, mood, title, text) {
    const theme = (book && book.theme && book.theme.environment) || this._getThemeScene(book) || "the story world";
    const t = ((title || "") + " " + (text || "")).toLowerCase();
    let focal = theme;
    if (/park|saha|pota|top|takım/.test(t)) focal = "a basketball court / park corner seen from a soft distance";
    else if (/orman|ağaç|dağ/.test(t)) focal = "a forest or mountain clearing in soft depth";
    else if (/deniz|kum|sahil/.test(t)) focal = "a sunlit beach and calm waves in the distance";
    else if (/gök|yıldız|uzay|galaksi/.test(t)) focal = "a starlit night sky with distant galaxies and drifting sparkles";
    else if (/oda|ev|masa/.test(t)) focal = "a cozy warm room with soft daylight through a window";
    return "A softly blurred atmospheric rendering of " + focal + ", painterly bokeh, low-contrast so the text panel stays the reading hero";
  }

  /**
   * Mood'a gore metin sayfasi arka plan stili
   */
  _getMoodBackground(mood) {
    const moods = {
      "dreamy": "Soft warm cream to light lavender gradient, gentle dreamy morning atmosphere",
      "dreamy-excited": "Warm cream to soft golden gradient, excited yet dreamy feel",
      "nervous-excited": "Light warm cream to pale green gradient, fresh hopeful atmosphere",
      "joyful": "Warm golden cream to light peach gradient, joyful sunny feel",
      "joyful-energetic": "Bright warm cream to soft orange gradient, energetic happy mood",
      "mysterious": "Deep indigo to dark purple gradient with golden sparkles at edges, mysterious magical night",
      "magical": "Deep navy to dark violet gradient with subtle golden sparkles at edges, magical enchanted night",
      "magical-epic": "Dark royal blue to deep purple gradient with golden light effects, epic magical atmosphere",
      "determined": "Warm amber cream to soft sunset orange gradient, strong determined feel",
      "reflective": "Soft silver-grey to light blue gradient, thoughtful reflective mood",
      "triumphant": "Warm golden to rich amber gradient, triumphant victorious glow",
      "triumphant-emotional": "Rich gold to warm amber gradient with subtle celebration sparkles, emotional victory",
      "inspirational": "Warm cream to soft gold gradient, inspiring hopeful atmosphere",
      "intense": "Deep warm grey to dark amber gradient, intense focused atmosphere",
      "climactic": "Dark dramatic blue to deep grey gradient, tense climactic moment",
      "emotional": "Soft warm cream to gentle pink-peach gradient, tender emotional feel",
      "proud": "Warm golden cream gradient, proud accomplished feeling",
      "humorous": "Light cheerful cream to soft yellow gradient, fun playful mood",
      "excited": "Bright warm cream to vivid peach gradient, excited energetic feel",
      "peaceful": "Soft mint to gentle cream gradient, calm peaceful nature feel",
      "warm": "Warm golden cream to soft amber gradient, cozy family warmth",
      "curious": "Light cream to soft sky blue gradient, curious wondering mood",
      "confident-exciting": "Warm golden to amber gradient, confident exciting atmosphere",
    };
    return moods[mood] || moods[(mood || "").split("-")[0]] || "Soft warm cream to light peach gradient, warm inviting atmosphere";
  }

  /**
   * Sahne basligindan ve metninden atmosfer ipuclari cikarir
   * Ornek: "Yagmurda Kalan" → yagmur efektleri ekle
   */
  _extractAtmosphereFromText(title, text) {
    var t = (title + " " + text).toLowerCase();
    var hints = [];

    if (t.includes("yağmur") || t.includes("yagmur") || t.includes("fırtına") || t.includes("firtina"))
      hints.push("Rain drops and water splash elements at edges, cool grey-blue watercolor tones, stormy atmosphere with rain streaks");
    else if (t.includes("gece") || t.includes("yıldız") || t.includes("yildiz") || t.includes("karanlık") || t.includes("karanlik"))
      hints.push("Night sky elements, tiny stars and moon crescents at corners, dark mystical atmosphere");
    else if (t.includes("güneş") || t.includes("gunes") || t.includes("sabah") || t.includes("şafak") || t.includes("safak"))
      hints.push("Warm sunrise elements, golden light rays at edges, bright morning feel");
    else if (t.includes("gün batımı") || t.includes("gun batimi") || t.includes("akşam") || t.includes("aksam"))
      hints.push("Warm sunset orange and purple tones, golden hour atmosphere at edges");
    else if (t.includes("kar yağ") || t.includes("kartopu") || t.includes("buz ") || t.includes("kış gel") || t.includes("kış mevsim"))
      hints.push("Snowflake elements at edges, cool icy blue tones, winter atmosphere");
    else if (t.includes("çiçek") || t.includes("cicek") || t.includes("bahçe") || t.includes("bahce"))
      hints.push("Flower and leaf elements at corners, fresh green and pink tones, garden feel");
    else if (t.includes("stadyum") || t.includes("tribün") || t.includes("tribun") || t.includes("arena"))
      hints.push("Stadium light elements, spotlight beams at edges, epic arena atmosphere");
    else if (t.includes("uzay") || t.includes("gezegen") || t.includes("roket"))
      hints.push("Space elements, tiny planets and stars at corners, cosmic atmosphere");
    else if (t.includes("deniz") || t.includes("okyanus") || t.includes("dalga"))
      hints.push("Ocean wave watercolor elements at edges, blue-turquoise tones");
    else if (t.includes("zafer") || t.includes("kazandı") || t.includes("kazandi") || t.includes("şampiyon") || t.includes("kutlama"))
      hints.push("Celebration confetti and sparkle elements at edges, golden victory glow");

    return hints.length > 0 ? hints.join(". ") : "Atmospheric elements matching the scene mood at edges";
  }

  /**
   * Arka kapak prompt'u — test'te kanitlanmis format
   */
  buildBackCoverPrompt(options = {}) {
    const book = this.bookData;
    const name = this.childInfo.name;
    const lessons = book.lessons || [];
    const description = book.description || "";
    const themeDecos = this._getThemeDecorations(book);

    // Kisisellestirilmis hikaye ozeti
    const summary = `${name}, cesaretiyle, azmiyle ve kalbindeki tutkuyla ${description.includes("parkta") || description.includes("sahada") ? "parktan başlayan" : "başlayan"} yolculuğunda kendini keşfetti. Bu sadece bir hikâye değildi; bu, onun büyürken yazdığı ilk masaldı.`;

    // Kazanimlar metni
    let lessonsText = "";
    if (lessons.length > 0) {
      const emojis = ["\uD83D\uDC9B", "\uD83C\uDFC0", "\u2B50", "\uD83C\uDF1F"];
      const explanations = {
        "Azim ve karar\u0131l\u0131k": "D\u00fc\u015ft\u00fc\u011f\u00fcnde kalkt\u0131, her seferinde daha g\u00fc\u00e7l\u00fc d\u00f6nd\u00fc.",
        "Azim ve tutku": "D\u00fc\u015ft\u00fc\u011f\u00fcnde kalkt\u0131, tutkusuyla devam etti.",
        "Tak\u0131m \u00e7al\u0131\u015fmas\u0131": "Arkada\u015flar\u0131yla birlikte oynaman\u0131n de\u011ferini \u00f6\u011frendi.",
        "Tak\u0131m ruhu": "Birlikte oynaman\u0131n g\u00fcc\u00fcn\u00fc ke\u015ffetti.",
        "Asla pes etmeme": "Zorluklar kar\u015f\u0131s\u0131nda vazge\u00e7medi.",
        "\u00c7al\u0131\u015fman\u0131n kar\u015f\u0131l\u0131\u011f\u0131n\u0131 alma": "Emeklerinin kar\u015f\u0131l\u0131\u011f\u0131n\u0131 ald\u0131.",
        "Cesaret": "Bilinmeyene ad\u0131m atmaktan korkmad\u0131.",
        "Hayallerin pe\u015finden ko\u015fma": "Kendi d\u00fcnyas\u0131n\u0131 kurdu ve hayallerinin pe\u015finden ko\u015ftu.",
        "Yenilgiyi kabullenme": "Yenilgiden ders \u00e7\u0131karmay\u0131 \u00f6\u011frendi.",
        "Yenilgiden ders \u00e7\u0131karma": "Her yenilgiyi bir \u00f6\u011frenme f\u0131rsat\u0131na d\u00f6n\u00fc\u015ft\u00fcrd\u00fc.",
        "Sorumluluk alma": "Kendi ba\u015f\u0131na yapabilmenin gururunu ya\u015fad\u0131.",
        "Ba\u011f\u0131ms\u0131zl\u0131k": "Kendi ayaklar\u0131 \u00fczerine durmay\u0131 \u00f6\u011frendi.",
        "Yard\u0131mseverlik": "Ba\u015fkalar\u0131na yard\u0131m etmenin mutlulu\u011funu ke\u015ffetti.",
        "Kendine g\u00fcven": "\u0130\u00e7indeki g\u00fcc\u00fc ke\u015ffetti.",
        "Hayal g\u00fcc\u00fc": "Hayal kurman\u0131n s\u0131n\u0131r tan\u0131mad\u0131\u011f\u0131n\u0131 \u00f6\u011frendi.",
      };

      lessonsText = lessons.map(function(l, i) {
        const emoji = emojis[i] || "\u2728";
        const explanation = explanations[l] || "";
        return emoji + " " + l + ": " + explanation;
      }).join("\n");
    }

    return `CHILDREN'S STORYBOOK BACK COVER PAGE — 2:3 portrait format. FLAT full-bleed print-ready back cover.

LANGUAGE: ALL text on this page MUST be in TURKISH. Do NOT translate any Turkish text to English. Write EXACTLY as provided below.

HEADER (display this EXACT Turkish text): "Masal Bitti Ama İzleri Kaldı..."
Style: large elegant decorative bold font at top, warm brown color.

STORY SUMMARY (display this EXACT Turkish text):
"${summary}"

SECTION HEADING (display this EXACT Turkish text): "KAZANIMLAR"
Style: bold playful display font, centered.

ACHIEVEMENTS (display as a 2x2 grid with emoji icons and subtle card frames, ALL IN TURKISH):
${lessonsText}

FOOTER LINE (display this EXACT Turkish text): "Her çocuk kendi hikâyesinin kahramanıdır..."
Style: elegant italic warm script font.

BRAND SECTION at very bottom:
- Small book/magic icon illustration
- "www.masalsensin.com" in elegant small font
- Small personalization badge: "Bu kitap ${name} için özel olarak hazırlanmıştır ❤️"

CHARACTER: ${name} as a small cute 3D illustration peeking from the bottom left corner with a happy confident smile. The character's FACE MUST BE IDENTICAL to the reference profile image provided — SAME eyes, SAME nose, SAME mouth, SAME eyebrows, SAME hairstyle, SAME skin tone, SAME overall face shape. Do NOT invent a new or generic child face. Do NOT change hair color or style. Small and subtle, not dominating the page — occupies maximum 18% of the page area. Same rendering style as the scene illustrations (Pixar-style 3D CGI).

DESIGN:
- Soft warm cream to light peach gradient background
- Subtle ${themeDecos} as watercolor decorations at edges
- Clean, elegant, premium book quality
- Warm brown and orange color palette for text
- The achievements section has subtle card/frame around each item
- Gentle decorative vine/leaf borders at top and bottom edges

TYPOGRAPHY:
- Header: large decorative bold serif, warm brown (#4E342E)
- Summary: elegant readable serif, dark brown (#5D4037)
- "KAZANIMLAR": bold playful display font, warm orange (#E65100)
- Achievement items: readable sans-serif with emoji icons
- Footer quote: elegant italic script, warm orange (#BF360C)
- Turkish characters (ş ç ğ ü ö ı İ) MUST be PERFECT — do NOT replace with ASCII
- Brand: small elegant serif
- Turkish characters PERFECT \u2014 \u00e7 \u015f \u011f \u00fc \u00f6 \u0131 \u0130 must be exact

MASALSENSIN BRAND VOCAB (MUTLAK):
- "sihir", "sihirli", "büyü", "büyülü", "mucize", "tılsım" KELİMELERİ YASAK (görsel metninde dahi).
- Yerine: "ışık", "yıldız", "kıvılcım", "hayal", "kalp" gibi yere basan kelimeler kullan.

ART STYLE: Premium children's book back cover. Clean, warm, professional. Mix of elegant typography and minimal 3D character illustration. Text and achievements are the STARS.`;
  }

  // ===================================================
  // YARDIMCI METODLAR
  // ===================================================

  /**
   * Kitap basligini cocuk adiyla kisisellestirir
   */
  _personalizeTitle(title, name) {
    // "Altın Basketbol" -> "Toprak'ın Altın Basketbol Macerası"
    // "Fenerbahçe'nin Yıldızı" -> "Toprak: Fenerbahçe'nin Yıldızı"
    if (title.includes("'")) {
      // Zaten possessive var
      return `${name}: ${title}`;
    }
    // Genel: "Altın Basketbol" -> "Toprak'ın Altın Basketbol Macerası"
    const suffix = this._getNameSuffix(name);
    return `${name}'${suffix} ${title} Macerası`;
  }

  /**
   * Turkce isim eki (buyuk unlu uyumu basitlestirilmis)
   */
  _getNameSuffix(name) {
    const lastChar = name.charAt(name.length - 1).toLowerCase();
    const backVowels = "aıou";
    const frontVowels = "eüöi";
    // Son harfe gore basit kontrol
    if (backVowels.includes(lastChar)) return "nın";
    if (frontVowels.includes(lastChar)) return "nin";
    // Unsuzle bitiyorsa, son unluye bak
    for (let i = name.length - 1; i >= 0; i--) {
      const c = name.charAt(i).toLowerCase();
      if (backVowels.includes(c)) return "ın";
      if (frontVowels.includes(c)) return "in";
    }
    return "ın"; // fallback
  }

  /**
   * Tema bazli kapak tipografisi
   */
  _getCoverTypography(book) {
    const id = book.id || "";
    const typos = {
      "altin-basketbol": "Title in bold sporty block letters with dynamic angle, name in energetic brush script. Colors: bright orange and white.",
      "altin-futbol": "Title in powerful athletic condensed bold font, name in dynamic hand-drawn script. Colors: bright white and golden yellow with dark shadow. MUST contrast against green field background.",
      "altin-tenis": "Title in elegant sporty serif font, name in flowing cursive. Colors: white and green.",
      "fenerbahce-yildizi": "Title in strong bold condensed font with yellow glow, name in dynamic script. Colors: bright yellow and white on dark blue.",
      "cimbomun-aslani": "Title in fierce bold display font, name in energetic brush lettering. Colors: red and gold.",
      "kartalin-gucu": "Title in sharp angular bold font, name in dramatic script. Colors: white and silver on black.",
      "karadeniz-firtinasi": "Title in strong rounded bold font, name in flowing script. Colors: burgundy and white.",
      "minik-kedi-miyav": "Title in soft rounded bubbly children's font, name in warm handwritten style. Colors: dark chocolate brown and warm gold with light outline. MUST contrast against colorful garden background.",
      "cesur-fil-dumbo": "Title in playful rounded bold font, name in friendly handwritten script. Colors: warm grey and orange.",
      "uzay-kasifleri": "Title in futuristic tech bold font with glow effect, name in space-age italic. Colors: electric blue and white.",
      "dijital-dedektifler": "Title in digital pixel-inspired bold font, name in tech handwriting. Colors: neon green and white.",
      "kucuk-kahraman": "Title in heroic comic-book bold font, name in playful hand-lettered script. Colors: bright golden yellow with dark outline and white with dark shadow. MUST contrast against bedroom scene.",
      "banyo-zamani": "Title in bubbly round fun font with bubble effects, name in playful script. Colors: blue and white.",
      "traktor-tikir-tikir": "Title in rustic wooden textured bold font, name in country handwritten style. Colors: red and warm brown.",
      "kayip-haritanin-sirri": "Title in aged adventure map-style font, name in explorer's handwriting. Colors: gold and dark brown.",
      "sessiz-kahramanin-sesi": "Title in theatrical elegant bold font, name in expressive script. Colors: purple and gold.",
      "yagmur-damlasi-damla": "Title in soft watercolor-style flowing font, name in gentle handwritten script. Colors: sky blue and white.",
      "yildiz-toplayicisi-zeynep": "Title in magical sparkling display font, name in whimsical fairy-tale script. Colors: golden and purple.",
    };
    return typos[id] || "Title in playful bold children's book display font, name in warm handwritten script. Bright cheerful colors with good contrast.";
  }

  /**
   * Gonderen basligini belirle
   */
  _getSenderTitle(childInfo) {
    const sender = childInfo.senderName || "";
    const senderLower = sender.toLowerCase();
    if (senderLower.includes("anne") && senderLower.includes("baba")) return "Annen ve babandan...";
    if (senderLower.includes("anne")) return "Annenden...";
    if (senderLower.includes("baba")) return "Babandan...";
    if (senderLower.includes("dede")) return "Dedenden...";
    if (senderLower.includes("nine") || senderLower.includes("anneanne") || senderLower.includes("babaanne")) return "Ninenden...";
    if (senderLower.includes("abi")) return "Abinden...";
    if (senderLower.includes("abla")) return "Ablandan...";
    if (senderLower.includes("dayi") || senderLower.includes("dayı")) return "Dayından...";
    if (senderLower.includes("teyze")) return "Teyzenden...";
    if (senderLower.includes("hala")) return "Halandan...";
    if (senderLower.includes("amca")) return "Amcandan...";
    if (senderLower.includes("aile")) return "Ailenden...";
    if (senderLower.includes("seven")) return "Seni çok sevenlerden...";
    if (sender) {
      // Turkce unlu uyumu: son unlu kalin ise -dan, ince ise -den
      const lastVowel = sender.match(/[aeıioöuü]/gi);
      const suffix = lastVowel && /[eöüi]/i.test(lastVowel[lastVowel.length - 1]) ? "'den..." : "'dan...";
      return sender + suffix;
    }
    return "Sana bir not...";
  }

  /**
   * Tema bazli sahne aciklamasi
   */
  _getThemeScene(book) {
    const id = book.id || "";
    const scenes = {
      "altin-basketbol": "Standing heroically in center of a massive basketball arena, holding basketball against hip, dramatic spotlight from above, golden confetti, packed cheering crowd",
      "altin-futbol": "Standing on a professional football pitch with one foot on a golden ball, massive stadium with bright floodlights, green grass, white lines",
      "altin-tenis": "Standing on a pristine tennis court holding racket confidently, tennis stadium backdrop, golden sunlight",
      "fenerbahce-yildizi": "Standing in Kadikoy stadium with yellow and navy blue flags waving, arms crossed confidently, Fenerbahce atmosphere",
      "cimbomun-aslani": "Standing in RAMS Park stadium with red and yellow scarves, fist raised in victory, Galatasaray atmosphere",
      "kartalin-gucu": "Standing in Tupras Stadium with arms spread like eagle wings, black and white flags, dramatic moonlit atmosphere",
      "karadeniz-firtinasi": "Standing in Papara Park stadium with Black Sea visible, dramatic storm clouds and golden sunlight breaking through",
      "minik-kedi-miyav": "Standing in a magical flower garden holding a cute small kitten, surrounded by butterflies and colorful flowers",
      "cesur-fil-dumbo": "Standing next to a baby elephant in African savanna at golden hour, acacia trees silhouetted",
      "paylasan-tavsan-pamuk": "Sitting in a flower meadow with a fluffy white rabbit, sharing from a basket, rainbow in sky",
      "uzay-kasifleri": "Floating in outer space wearing astronaut suit, Earth in background, colorful nebulas and stars, spaceship nearby",
      "dijital-dedektifler": "Wearing detective outfit with magnifying glass, surrounded by holographic screens and digital elements",
      "banyo-zamani": "Sitting happily in a colorful bathtub full of bubbles and rubber ducks, cheerful bathroom",
      "traktor-tikir-tikir": "Sitting on a big red shiny tractor in a green farm field, golden wheat, cute farm animals",
      "kayip-haritanin-sirri": "Holding an ancient treasure map at entrance of a jungle cave, torchlight, compass glowing",
      "sessiz-kahramanin-sesi": "Standing on a stage with spotlight, microphone in hand, audience in background, butterflies of courage",
      "yagmur-damlasi-damla": "Standing in magical rain shower, arms spread catching sparkly raindrops, rainbow overhead",
      "yildiz-toplayicisi-zeynep": "Reaching up to catch a glowing star from purple night sky, jar of collected stars beside",
    };
    return scenes[id] || "Standing in a beautiful themed scene related to the story";
  }

  /**
   * Tema bazli dekoratif elemanlar
   */
  _getThemeDecorations(book) {
    const id = book.id || "";
    const decos = {
      "altin-basketbol": "basketballs, hoops, stars, golden trophies, arena elements",
      "altin-futbol": "footballs, goal posts, grass, stadium lights, golden boots",
      "altin-tenis": "tennis rackets, balls, nets, court lines, golden trophies",
      "fenerbahce-yildizi": "yellow and navy blue stripes, canary birds, football elements",
      "cimbomun-aslani": "red and yellow stripes, lion motifs, football elements",
      "kartalin-gucu": "black and white eagles, football elements, night sky stars",
      "karadeniz-firtinasi": "burgundy and blue waves, sea elements, mountain silhouettes",
      "minik-kedi-miyav": "paw prints, butterflies, flowers, yarn balls, fish",
      "cesur-fil-dumbo": "elephant silhouettes, African trees, safari elements",
      "paylasan-tavsan-pamuk": "carrots, flowers, hearts, rainbow elements",
      "uzay-kasifleri": "planets, stars, rockets, astronaut helmets, nebulas",
      "dijital-dedektifler": "binary code, magnifying glasses, circuit boards, screens",
      "banyo-zamani": "bubbles, rubber ducks, water drops, soap bars",
      "traktor-tikir-tikir": "wheat, tractors, farm animals, sunflowers",
      "kayip-haritanin-sirri": "treasure maps, compasses, jungle leaves, treasure chests",
      "sessiz-kahramanin-sesi": "microphones, musical notes, stage lights, butterflies",
      "yagmur-damlasi-damla": "raindrops, rainbows, clouds, flowers blooming",
      "yildiz-toplayicisi-zeynep": "stars, moon, shooting stars, magical jars of light",
    };
    return decos[id] || "thematic decorative elements matching the story";
  }

  _getCharacterClothing(book) {
    const id = book.id || "";
    const clothes = {
      "altin-basketbol": "Wearing professional red and gold basketball jersey with number 10, basketball shorts, high-top sneakers",
      "altin-futbol": "Wearing professional dark blue football jersey with gold number 10, football shorts, cleats",
      "altin-tenis": "Wearing white tennis outfit with green trim, holding tennis racket",
      "fenerbahce-yildizi": "Wearing bright yellow Fenerbahce jersey with navy blue trim and number 10",
      "cimbomun-aslani": "Wearing red Galatasaray jersey with yellow trim and number 10",
      "kartalin-gucu": "Wearing black Besiktas jersey with white trim and number 10",
      "karadeniz-firtinasi": "Wearing burgundy Trabzonspor jersey with blue trim and number 10",
      "minik-kedi-miyav": "Wearing casual colorful clothes, gentle and kind appearance",
      "cesur-fil-dumbo": "Wearing safari explorer outfit with hat and vest",
      "uzay-kasifleri": "Wearing futuristic white and blue astronaut suit with clear helmet visor",
      "dijital-dedektifler": "Wearing cool detective outfit with gadgets",
      "banyo-zamani": "Wearing cozy pajamas or bathrobe",
      "traktor-tikir-tikir": "Wearing farmer overalls and boots",
      "kayip-haritanin-sirri": "Wearing adventure explorer outfit with hat",
      "sessiz-kahramanin-sesi": "Wearing nice performance outfit",
      "yagmur-damlasi-damla": "Wearing rain boots and colorful raincoat",
      "yildiz-toplayicisi-zeynep": "Wearing magical starry cape with glowing elements",
    };
    return clothes[id] || "Wearing appropriate themed clothing";
  }

  _getMoodTr(book) {
    const id = book.id || "";
    const moods = {
      "altin-basketbol": "kararlı, özgüvenli, heyecanlı",
      "altin-futbol": "tutkulu, azimli, heyecanlı",
      "altin-tenis": "odaklanmış, kararlı, zarif",
      "fenerbahce-yildizi": "gururlu, tutkulu, sarı-lacivert aşk",
      "cimbomun-aslani": "cesur, güçlü, aslan yürekli",
      "kartalin-gucu": "özgür, kararlı, güçlü",
      "karadeniz-firtinasi": "dayanıklı, tutkulu, fırtına gibi",
      "minik-kedi-miyav": "sevgi dolu, meraklı, sıcak",
      "cesur-fil-dumbo": "cesur, sevecen, maceraperest",
      "uzay-kasifleri": "meraklı, cesur, keşifçi",
      "dijital-dedektifler": "zeki, meraklı, teknoloji sever",
      "banyo-zamani": "neşeli, eğlenceli, temiz",
      "traktor-tikir-tikir": "doğa sever, çalışkan, mutlu",
      "kayip-haritanin-sirri": "maceraperest, cesur, meraklı",
      "sessiz-kahramanin-sesi": "cesur, kararlı, güçlü",
      "yagmur-damlasi-damla": "huzurlu, büyülü, neşeli",
      "yildiz-toplayicisi-zeynep": "hayalperest, büyülü, umutlu",
    };
    return moods[id] || "heyecanlı, meraklı";
  }

  _getDefaultCharacterDesc() {
    return `Short brown hair, big expressive ${this.genderEn === "girl" ? "hazel" : "brown"} eyes, cute round face, friendly smile`;
  }

  _getArtStyle(book) {
    if (book.category === "boyama") {
      return "Clean black and white line art coloring book style — thick bold outlines, no shading, no color, pure black lines on white background, large areas for coloring.";
    }
    return "3D Pixar/Disney CGI — Stylized 3D cartoon, vibrant warm colors, soft volumetric lighting, hyper-detailed textures, cinematic composition, character face Pixar-ified with cute proportions.";
  }
}

module.exports = CoverPromptArchitect;
