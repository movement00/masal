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

    return `FULL PAGE CHILDREN'S STORYBOOK FRONT COVER ILLUSTRATION — 2:3 portrait format. This is a FLAT full-bleed print-ready cover, NOT a 3D mockup. No book spine, no page curl, no 3D perspective, no shadow effects. Just a flat illustrated cover page.

TITLE TEXT: "${personalizedTitle}"
TYPOGRAPHY — ${typographyStyle} Strong contrast against background.

TURKISH CHARACTERS (CRITICAL — spell EXACTLY):
The title "${personalizedTitle}" must be spelled EXACTLY as shown, letter by letter.
Turkish special characters that MUST appear correctly:
- ı (dotless i) — NOT regular i
- İ (capital I with dot) — NOT regular I
- ş (s with cedilla) — NOT regular s
- ç (c with cedilla) — NOT regular c
- ğ (g with breve) — NOT regular g
- ö (o with umlaut) — NOT regular o
- ü (u with umlaut) — NOT regular u
Do NOT use ALL CAPS for Turkish text — mixed case as provided. "Macerası" NOT "MACERASI" or "MACERAŞI".

CRITICAL CONTRAST RULE: Title text MUST be clearly readable against the scene background.

PERSONALIZATION BADGE: "Bu kitap ${name} için özel olarak üretilmiştir" — small corner badge, gold color.

CHARACTER: ${name}, a ${this.age}-year-old Turkish ${this.genderEn}. ${characterDesc || this._getDefaultCharacterDesc()}. ${characterClothing}. ${sceneDesc}.

COMPOSITION: Title top 25%, character + scene middle 55%, badge bottom right corner 15%.

ART STYLE: ${this._getArtStyle(book)} Mood: ${moodTr}.`;
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
   * "Gonderenden Not" sayfasi prompt'u — mektup kagidi formati
   */
  buildSenderNotePrompt(options = {}) {
    const book = this.bookData;
    const name = this.childInfo.name;
    const senderName = this.childInfo.senderName || "Seni \u00e7ok seven ailenden";
    const themeDecos = this._getThemeDecorations(book);

    // Dinamik not metni olustur
    const noteContent = this._buildDynamicNote(name, senderName, book);
    const senderTitle = this._getSenderTitle(this.childInfo);
    const signoff = this._getSenderSignoff(senderName);

    return "CHILDREN'S STORYBOOK PERSONAL NOTE PAGE \u2014 2:3 portrait format. FLAT FULL PAGE \u2014 the page IS the stationery paper, filling the entire frame edge to edge. No table, no background surface.\n\n" +
"THE PAGE: Beautiful aged cream/ivory vintage stationery paper with warm subtle texture. Slightly yellowed corners, gentle aged feel. The paper fills the ENTIRE frame.\n\n" +
"TOP: An ornate wax seal with a heart in the center, warm burgundy color, positioned top-center. Below it a delicate decorative line.\n\n" +
"LETTER TEXT \u2014 written in GENUINE HANDWRITTEN dark brown ink:\n" +
"\"\"\"\n" +
senderTitle + "\n\n" +
noteContent + "\n\n" +
signoff + "\n" +
"\"\"\"\n\n" +
"LANGUAGE: ALL text MUST be in TURKISH. Do NOT translate to English. Write EXACTLY as provided above.\n\n" +
"TYPOGRAPHY:\n" +
"1. \"" + senderTitle + "\" \u2014 large flowing elegant cursive at top, dark brown ink, personal and warm\n" +
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

    return "TEXT-ONLY PAGE for a children's storybook \u2014 2:3 portrait format.\n" +
      "IMPORTANT: This is NOT an illustration page. Do NOT draw any 3D characters, people, or scene. This is a TYPOGRAPHY page with text on a decorated background. No characters, no people, no 3D rendering.\n\n" +
      "SCENE TITLE: \"" + title + "\"\n\n" +
      "STORY TEXT (display this EXACT Turkish text on the page, beautifully formatted):\n\"\"\"\n" + text + "\n\"\"\"\n\n" +
      "DESIGN:\n" +
      "- " + bgDesc + "\n" +
      "- " + sceneAtmosphere + "\n" +
      "- Subtle " + themeDecos + " as decorative elements ONLY in corners and margins\n" +
      "- Scene title \"" + title + "\" in large playful bold decorative font at top\n" +
      "- Ornamental decorative divider between title and text\n" +
      "- Small decorative themed element at bottom center\n" +
      "- ABSOLUTELY NO people, NO characters, NO 3D figures anywhere on this page\n\n" +
      "TYPOGRAPHY (CRITICAL):\n" +
      "- Use warm rounded friendly sans-serif font throughout (Nunito or Quicksand style)\n" +
      "- Title: VERY LARGE, EXTRA BOLD, with subtle shadow effect, decorative and eye-catching\n" +
      "- Body text: comfortable children's book reading size, generous 1.6x line spacing\n" +
      "- EMPHASIS RULES (make these VISUALLY OBVIOUS):\n" +
      "  * Child name \"" + name + "\" = BOLD WEIGHT + DIFFERENT WARM COLOR \u2014 clearly stands out from surrounding text\n" +
      "  * Dialogue in quotation marks = ITALIC + ACCENT COLOR + slightly larger\n" +
      "  * Key action/emotional words = slightly BOLDER than regular text\n" +
      "  * Final sentence = ITALIC for emotional punch\n" +
      "- Text LEFT-ALIGNED, flowing prose paragraphs \u2014 NOT centered, NOT poetry/verse\n" +
      "- Clear generous paragraph breaks\n" +
      "- NO scene numbers, NO chapter numbers, NO page numbers\n\n" +
      "TURKISH CHARACTERS (ABSOLUTELY CRITICAL):\n" +
      "Turkish special characters MUST appear EXACTLY as provided:\n" +
      "\u00e7 \u015f \u011f \u00fc \u00f6 \u0131 \u0130 \u2014 do NOT replace with ASCII equivalents.\n" +
      "This is a TURKISH language book. Every character must be perfect.\n\n" +
      "COLORS: " + colors + "\n\n" +
      "ART STYLE: Elegant children's book interior typography page. Soft watercolor decorative borders, NOT a full 3D illustration. No 3D characters, no people, no rendered scenes. Text is the STAR, decorations are subtle at edges only.";
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

CHARACTER: CHARACTER_DESC as a small cute 3D illustration peeking from the bottom left corner with a happy confident smile. The character must have the EXACT SAME face as the reference photo. Small and subtle, not dominating the page.

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
