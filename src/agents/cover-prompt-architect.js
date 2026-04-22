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
const { detectMeslekProfileFromBook } = require("../rules/meslek-profiles");

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

async function generateNoteBody(bookData, heroName, heroAge, senderKey, customName) {
  const senderHuman = {
    "anne+baba": "anne ve baba", anne: "anne", baba: "baba",
    anneanne: "anneanne", babaanne: "babaanne", dede: "dede",
    teyze: "teyze", hala: "hala", dayi: "dayı", amca: "amca",
    abla: "abla", abi: "ağabey", arkadas: "yakın arkadaş",
    diger: "yakınlarından biri",
  };
  let persona = senderHuman[senderKey] || "aile büyüğü";
  // customName (örn. "Reha") verilmişse, "yakınlarından biri adı Reha olan kişi" gibi
  // ek bilgi promptun içinde AI'a geçsin — not metninde isim geçmese bile persona doğru.
  if (customName) persona = `${persona} (adı: ${customName})`;
  const theme = bookData.theme || bookData.title || "macera";
  const ozet = bookData.description || bookData.ozet || "";
  const kazanimlar = (bookData.lessons || bookData.kazanimlar || []).slice(0, 3).join(", ");
  const promptText = `${heroName} adında ${heroAge || "6"} yaşında bir Türk çocuğu için kişiye özel bir kitap yazdık. Kitap "${bookData.title || theme}" — teması: ${theme}. Özet: ${ozet}. Kazanımları: ${kazanimlar}.

GÖREV: Bu kitabın ilk sayfasına eklenecek bir not yaz. Notu YAZAN kişi ${persona} olacak. Çocuğa ${persona === "anne ve baba" ? "ikisinden" : "kendisinden"} duygusal, sıcak, samimi bir mektup gibi olmalı.

KURAL:
- TAM 3 paragraf, HER paragraf 2-3 cümle → TOPLAM 6-8 cümle (MİNİMUM 6, MAKSİMUM 9)
- HER CÜMLE NOKTA İLE BİTMELİ. Hiçbir cümle yarım kalmamalı.
- Toplam ~350-500 karakter (kısa değil, uzun değil, orta dolu)
- Çocuğun adı (${heroName}) tam 1-2 kez geçsin (3+ fazla)
- Hikayenin temasına HAFIF bir gönderme olsun (örnek: kitap macera ise "her macerada yanındayız", uyku ise "her gece rüyalarında" gibi)
- Aşırı klişe değil, gerçek bir aile büyüğünün el yazısıyla yazdığı doğal bir not havası
- Türkçe karakterler MUTLAKA doğru: ş ç ğ ü ö ı İ
- "sihir", "sihirli", "büyü", "büyülü", "mucize" KELİMELERİ YASAK — yerine "ışık", "yıldız", "kıvılcım", "hayal", "kalp" gibi yere basan kelimeler kullan
- Klişe başlangıçlar yasak ("Canım kızım..." gibi başlama, doğrudan duyguyla başla)
- "Bu kitap özel..." gibi giriş cümlesi kullan ama mutlaka yeniden yorumla, kopyala-yapıştır gibi olmasın
- ÇIKTI: SADECE not metni (hitap ve imza zaten ayrı, onları yazma)
- ÇIKTI DOĞRULAMA: çıktının SON KARAKTERİ nokta (.) olmalı. Çıktıyı kontrol et, son karakter nokta değilse ekle. ASLA "..." (üç nokta) ile bitme — tek nokta yeterli.`;

  try {
    const ai = new GoogleGenAI({ apiKey: config.google.apiKey });
    const res = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: promptText,
      config: { temperature: 0.85, maxOutputTokens: 1500, thinkingConfig: { thinkingBudget: 2048 } },
    });
    let text = (res.text || "").trim().slice(0, 1500);
    if (!text) throw new Error("empty text");
    // Ensure ends with a full sentence (last char is '.') — never a cut mid-word
    if (!/[.!?]$/.test(text)) {
      // Last period index
      const lastPeriod = text.lastIndexOf(".");
      if (lastPeriod > text.length * 0.3) text = text.slice(0, lastPeriod + 1);
      else text += ".";
    }
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

    // ── CATEGORY DISPATCH — per-category cover prompt branches ──
    const cat = (book.category || "").toLowerCase();

    // Meslek → detailed profile-based branch
    if (cat.includes("meslek")) {
      const meslekProfile = detectMeslekProfileFromBook(book);
      if (meslekProfile) return this.buildMeslekCoverPrompt({ ...options, profile: meslekProfile });
    }

    // Boyama → existing branch (coloring book)
    if (cat.includes("boyama") && book.coverPrompt) {
      return book.coverPrompt;
    }

    // Other categories with config-driven branches
    const catKey = this._detectCategoryKey(cat);
    if (catKey && catKey !== "default") {
      return this.buildCategoryCover({ ...options, catKey });
    }

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
- Title INTERACTS with the scene — letters breathe alongside scene elements (clouds, light beams, soft foliage) but SCENE ELEMENTS MUST NEVER OCCLUDE OR CROP ANY LETTER.
- The child's name "${name}" in playful HAND-LETTERED warm-color script with decorative flourishes.
- Rest of the title in chunky friendly display font with contrasting weight.
- NOT a floating text block above the scene — PART of the world, but LEGIBLE TOP TO BOTTOM.
- Title appears ONLY ONCE on the cover. No repetition. No subtitle restatement.

═══ TITLE SAFE ZONE (ABSOLUTE) ═══
- Reserve the TOP 30-35% of the canvas as a CLEAN TITLE BAND with minimum foreground interference.
- No leaves, branches, or objects may cover ANY part of any letter — especially the final letter of each word. A clipped "ı", "i", dot over "İ", or tail of "ş", "ğ", "ç" makes the cover UNUSABLE.
- Check: read every word of "${personalizedTitle}" from left to right. Every letter including diacritics MUST be 100% visible. If any letter is partially hidden, the image is WRONG.
- Title wraps on its natural word-break only (no mid-word wraps). Line 1 and Line 2 are both fully readable and contained within safe horizontal margins (min 8% breathing room each side).
- Keep the CENTER of the cover for the character; title stays TOP.

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
   * Kategoriye göre anahtarı belirler (config map'i için).
   */
  _detectCategoryKey(cat) {
    cat = (cat || "").toLowerCase();
    if (cat.includes("duygu")) return "duygu";
    if (cat.includes("hayvan")) return "hayvan";
    if (cat.includes("gunluk-degerler") || cat.includes("günlük-değerler")) return "gunluk";
    if (cat.includes("yeni-kardes") || cat.includes("kardeş")) return "yenikardes";
    if (cat.includes("dogum-gunu") || cat.includes("doğum-günü")) return "dogumgunu";
    if (cat.includes("anneler")) return "annelergunu";
    if (cat.includes("23-nisan") || cat.includes("nisan")) return "23nisan";
    if (cat.includes("spor") || cat.includes("altin")) return "spor";
    if (cat.includes("bebek")) return "bebek";
    return "default";
  }

  /**
   * Kategoriye özel ön kapak prompt'u — config-driven per-category directives.
   */
  buildCategoryCover(options = {}) {
    const { catKey, characterDesc } = options;
    const book = this.bookData;
    const name = this.childInfo.name;
    const personalizedTitle = this._personalizeTitle(book.title, name);
    const firstScene = (book.scenes?.[0]?.title || "") + " — " + (book.scenes?.[0]?.text || "").slice(0, 180);
    const charDesc = characterDesc || this._getDefaultCharacterDesc();

    const configs = {
      duygu: {
        outfitDirective: "COZY EVERYDAY KIDS' CLOTHES — soft pastel sweater or t-shirt with a small heart/star motif, comfortable pants/leggings. ABSOLUTELY NOT a suit, NOT a formal jacket, NOT a uniform. Age-appropriate preschool/kindergarten outfit.",
        sceneDirective: `HOME OR NEARBY EVERYDAY SETTING matching the story's first moment (bedroom, park corner, kitchen, living-room, garden). Scene: ${firstScene}. NO İstanbul skyline, NO generic city silhouette, NO mosque — the setting is INTIMATE and child-sized.`,
        metaphorDirective: `The emotion metaphor (e.g., cloud, butterfly, small lantern) is the SECOND FOCAL POINT, positioned near the child — on the shoulder, beside the cheek, floating 20cm away. Size ~15-20% of frame width. The metaphor has a subtle face/expression that ECHOES the emotion.`,
        emotionDirective: `The child's face shows the NAMED emotion clearly: pink cheeks for utanç, wide wondering eyes for merak, gentle tears-on-edge for üzüntü, peaceful acceptance for sabır, sparkling joy for sevinç. Emotion is the TITLE CARD of the cover — visible from a thumbnail.`,
        paletteHint: "warm pastel palette — blush pink, butter cream, soft lavender, honey, warm brown. Dreamy emotional lighting, NOT dramatic.",
        titleIconHint: "a tiny heart, small cloud, or emotion-metaphor silhouette integrated next to or above the title",
      },
      hayvan: {
        outfitDirective: "Casual outdoor kid's outfit — denim overalls, cozy sweater, sneakers, or a light jacket. Age-appropriate and dirt-friendly (playing with animals).",
        sceneDirective: `ANIMAL SIDEKICK'S NATURAL HABITAT (meadow, park, garden, countryside, beach). The pet/animal character IS IN THE SCENE beside the child. Scene: ${firstScene}.`,
        metaphorDirective: `The animal companion (kedi, köpek, tavşan, kuş, etc.) is PROMINENT — beside the child, ~25-30% of frame, visual partner. Both caught mid-interaction (petting, running together, eye contact).`,
        emotionDirective: "Joyful warmth between child and animal. Both faces visible. Child kneeling/crouching to be level with animal works well.",
        paletteHint: "meadow green, honey gold, blush, cream, soft sky blue. Golden-hour afternoon warmth.",
        titleIconHint: "a tiny paw print, leaf, or animal silhouette integrated with the title",
      },
      gunluk: {
        outfitDirective: "Cozy morning home clothes — pajamas, robe, or simple everyday wear. Age-appropriate preschool outfit. Barefoot or soft slippers OK.",
        sceneDirective: `HOME INTERIOR — child's bedroom, family kitchen, breakfast table. Morning light streaming through window. Scene: ${firstScene}.`,
        metaphorDirective: "Daily-rule objects subtly in scene: neat bed, fruit plate, toothbrush in cup, folded towel — 1-2 visible as environmental storytelling, NOT inventory dump.",
        emotionDirective: "Child caught in a moment of gentle pride, quiet discovery, or morning warmth. Face: curious, small smile.",
        paletteHint: "cream, peach, honey, soft orange morning light.",
        titleIconHint: "a tiny sun, star, or small sparkle integrated with the title",
      },
      yenikardes: {
        outfitDirective: "Cozy home clothes with a small heart motif. Age-appropriate. If older sibling: slightly mature looking; if new baby: swaddle/blanket visible.",
        sceneDirective: `FAMILY NURSERY OR LIVING ROOM — crib, soft lighting, family presence implied (parent arm, toys in scene). Scene: ${firstScene}.`,
        metaphorDirective: `BOTH SIBLINGS VISIBLE — older child (${name}) holding/looking at new baby OR baby in crib with older child beside. The sibling bond is the cover's emotional anchor.`,
        emotionDirective: "Warm, tender, slightly protective. Older sibling's face: gentle curiosity, dawning love. New baby: peaceful sleep or small smile.",
        paletteHint: "nursery pastels — blush pink, butter cream, mint, warm honey.",
        titleIconHint: "a tiny heart, small star, or soft cloud integrated with the title",
      },
      dogumgunu: {
        outfitDirective: "Festive birthday outfit — party dress/shirt, party hat, balloons in hand, possibly a sash.",
        sceneDirective: `BIRTHDAY PARTY SCENE — cake with candles, balloons (multi-color), streamers, small gifts, decorated table. Scene: ${firstScene}.`,
        metaphorDirective: "Cake with candles, balloons floating, colorful confetti — festive but NOT crammed. Child is the hero, celebration around them.",
        emotionDirective: "Joyful birthday wonder — eyes wide watching candles, big smile, anticipation face.",
        paletteHint: "warm pink, butter yellow, mint turquoise, cream, gold.",
        titleIconHint: "a tiny balloon, candle, or cake slice integrated with the title",
      },
      annelergunu: {
        outfitDirective: "Cozy home outfit with a small heart motif. Could have flower in hair or hand (a small bouquet).",
        sceneDirective: `TENDER HOME MOMENT WITH MOTHER — garden or living room, flowers, warm window light. Mother may be present (partial, blurred midground, or hands visible). Scene: ${firstScene}.`,
        metaphorDirective: "Flowers (roses, daisies) and heart motifs integrated into the scene. Child giving flowers OR sharing a quiet moment with mother.",
        emotionDirective: "Tender love. Child's face: proud, gentle, slightly shy. If mother visible: warm knowing smile.",
        paletteHint: "blush rose, sage green, cream, warm honey. Romantic soft light.",
        titleIconHint: "a tiny rose, heart, or bouquet integrated with the title",
      },
      "23nisan": {
        outfitDirective: "School-uniform inspired OR cozy everyday wear with a small red ribbon or Turkish flag pin. Age-appropriate.",
        sceneDirective: `SCHOOL SCHOOL YARD / CLASSROOM MORNING with Turkish flag, children-holding-hands silhouettes in background, golden morning light. Scene: ${firstScene}. Subtle patriotic ambiance, NOT military.`,
        metaphorDirective: "A small Turkish flag on a stick, a laurel wreath, or a dove — subtle national day motifs as secondary elements.",
        emotionDirective: "Gentle pride, childlike celebration, hope. Child's face: bright morning-energy smile.",
        paletteHint: "cream, pale blue, warm honey, soft red accent. Gentle not aggressive.",
        titleIconHint: "a tiny flag, dove, or star-and-crescent integrated with the title",
      },
      spor: {
        outfitDirective: `Sport-appropriate uniform matching the book's sport (basketball jersey + shorts, football kit, tennis outfit, etc.). Team colors prominent.`,
        sceneDirective: `SPORT VENUE — stadium at sunset, basketball court, tennis court, football field. 3-layer depth with equipment in foreground. Scene: ${firstScene}.`,
        metaphorDirective: "Sport ball/equipment prominent — basketball mid-bounce, football mid-kick, tennis racket in action.",
        emotionDirective: "Determined athletic focus. Child caught mid-action — jumping for a shot, sprinting, swinging. Emotion: focus + joy.",
        paletteHint: "warm gold sunset + venue green + cream. Stadium golden-hour light.",
        titleIconHint: "a tiny ball, trophy, or victory ribbon integrated with the title",
      },
      bebek: {
        outfitDirective: "Baby/toddler appropriate outfit — onesie, soft romper, baby cap. Swaddle or soft blanket optional.",
        sceneDirective: `NURSERY OR FAMILY SETTING — crib, soft toys, mobile, parent presence. Scene: ${firstScene}.`,
        metaphorDirective: "Baby essentials subtly: pacifier, rattle, small teddy bear. Family warmth implied.",
        emotionDirective: "Pure baby innocence — gentle sleep, first smile, curious look.",
        paletteHint: "nursery pastels — blush, butter, mint, cream.",
        titleIconHint: "a tiny star, moon, or baby footprint integrated with the title",
      },
    };

    const cfg = configs[catKey] || {};

    return `A PREMIUM CINEMATIC PIXAR-STYLE PERSONALIZED CHILDREN'S BOOK COVER — 2:3 portrait format. Full 3D Pixar/Disney CGI quality like a frame from an animated feature film.

═══ CATEGORY IDENTITY (read first) ═══
Category: ${book.category}. This cover MUST visually reflect the SPECIFIC category (not a generic Turkish kid cover). Every element — outfit, scene, props, metaphor — must tell the viewer the category from a thumbnail.

═══ OUTFIT (CRITICAL) ═══
${cfg.outfitDirective || "Age-appropriate casual Turkish kids' clothes."}
NEVER a formal suit, NEVER a tuxedo, NEVER a blazer. Clothing must be believable for a ${this.age}-year-old Turkish ${this.genderEn}.

═══ SCENE ═══
${cfg.sceneDirective || "Warm themed scene matching the book's story world."}
NO İstanbul skyline / mosque / generic Turkish city backdrop unless the story specifically calls for it.

═══ SYMBOL / METAPHOR ═══
${cfg.metaphorDirective || ""}

═══ EMOTION ═══
${cfg.emotionDirective || "Child's face is the focal point — emotion first."}

═══ CINEMATIC COMPOSITION (3-layer depth) ═══
- FOREGROUND: scene props close to camera, slightly blurred
- MIDGROUND: ${name} in dynamic pose, sharp focus, emotional anchor
- BACKGROUND: rich themed environment, soft focus
This creates CINEMATIC DEPTH like a Pixar key frame.

═══ CINEMATIC LIGHTING ═══
- Golden hour rim light on character
- Volumetric light beams, soft dust particles
- Palette: ${cfg.paletteHint || "warm cinematic tones matched to the story"}
- NO flat even lighting

═══ TITLE TYPOGRAPHY ═══
"${personalizedTitle}"
- Top of cover, occupies ~25-30% vertical
- Warm hand-lettered decorative serif, cream/ivory (#F5EFE6), with subtle drop-shadow
- Child name line slightly larger, playful; rest of title chunky
- ${cfg.titleIconHint || "Small decorative flourish integrated with the title"}
- Title appears EXACTLY ONCE

═══ TITLE SAFE ZONE (ABSOLUTE) ═══
- Top 30-35% reserved for title band with MINIMUM foreground interference
- No leaves/branches/objects may occlude ANY letter (especially the final letter of each word)
- Every letter of "${personalizedTitle}" including diacritics MUST be 100% visible

═══ TURKISH CHARACTERS (CRITICAL) ═══
"${personalizedTitle}" spelled EXACTLY letter by letter.
- ı ≠ i | İ ≠ I | ş ≠ s | ç ≠ c | ğ ≠ g | ö ≠ o | ü ≠ u
- Mixed case as provided

═══ CHARACTER + FACE CONSISTENCY ═══
${charDesc}
Face MUST match the reference photo EXACTLY (same eyes, nose, mouth, hair, skin tone, age impression for ${this.age} years). Pixar stylization OK, identity NOT.

═══ BOTTOM-RIGHT PERSONALIZATION SEAL ═══
Gold-foil circular seal (#D4A574) with subtle emboss, ~14-18% frame width. Turkish text inside: "Bu kitap ${name} için özel üretilmiştir". Small decorative laurel/ornament around the seal edge.

═══ BOOK FORMAT (CRITICAL) ═══
- THIN FLEXIBLE PAPERBACK (not hardcover)
- Render as FLAT print-ready cover page (2:3 portrait, full-bleed). NO 3D mockup, NO page curl, NO shelf perspective, NO hands holding the book, NO visible spine
- ABSOLUTELY NOT: hardcover, case-bound, leather, cloth, embossed raised letters

═══ BRAND VOCAB (MUTLAK) ═══
- "sihir", "sihirli", "büyü", "büyülü", "mucize", "tılsım" KELİMELERİ YASAK (görselde dahi)
- Yerine: "ışık", "yıldız", "kıvılcım", "hayal", "kalp"

═══ ART STYLE ═══
Full 3D Pixar / Disney / DreamWorks CGI — subsurface scattering, volumetric lighting, hyper-detailed textures. Magazine-cover polish. NO anime, NO 2D flat, NO cheap mobile-game look.

═══ CRITICAL ═══
- Turkish diacritics PERFECT
- Title appears EXACTLY ONCE
- No barcode, no price, no ISBN
- Thumbnail-level category recognition: a stranger seeing this cover at 200px should INSTANTLY know what kind of book it is (emotion / animal / daily-rule / birthday / mother's day / 23-April / sport / new-sibling / baby).`;
  }

  /**
   * Kategoriye özel ARKA kapak prompt'u (default-plus).
   * Category-specific decorations at edges + semantic kazanım icons.
   */
  buildCategoryBackCover(options = {}) {
    const { catKey } = options;
    const book = this.bookData;
    const name = this.childInfo.name;
    const allLessons = (book.lessons || []).slice(0, 4);

    let summary = book.description || "";
    if (summary.length > 340) {
      const cut = summary.slice(0, 340);
      const lastPeriod = cut.lastIndexOf(".");
      summary = lastPeriod > 180 ? cut.slice(0, lastPeriod + 1) : cut.slice(0, 337) + "...";
    }

    const kazanimGrid = allLessons.map((k, i) =>
      `Card ${i + 1} — text: "${k}" — icon: a small 3D-illustrated icon that SEMANTICALLY MATCHES the meaning of this specific Turkish text. EACH CARD MUST HAVE A DIFFERENT ICON. Pick the icon that best represents "${k}" — e.g., cesaret → lion/shield; sevgi → heart; merak → magnifying glass; paylaşım → joined hands; sabır → hourglass; hayal → cloud with stars; uyku → moon; yemek → fruit bowl; temizlik → soap+bubbles; düzen → neat shelf; kardeş → two small hands together; kutlama → cake+candle; anne-sevgisi → rose+heart; bayrak → Turkish flag.`
    ).join("\n");

    const decorMap = {
      duygu: "soft emotion-themed watercolor: tiny hearts, floating feathers, dream-clouds, gentle rainbow arc",
      hayvan: "soft paw-prints, leaves, butterflies, small flowers",
      gunluk: "morning motifs: toothbrush, spoon, folded towel, crescent moon, star, sunrise",
      yenikardes: "nursery motifs: pacifier, tiny sock, swaddle, small star, heart charm",
      dogumgunu: "confetti, balloons, ribbons, small cupcakes, sparkles",
      annelergunu: "rose petals, tea cups, folded love-notes, flower wreaths",
      "23nisan": "tiny Turkish flags, doves, laurel wreaths, little star-and-crescent motifs",
      spor: "sport balls (matching the book's sport), victory ribbons, medals, whistles",
      bebek: "tiny feet prints, stars, moon, pacifier, cloud",
    };
    const decor = decorMap[catKey] || "warm storybook motifs: open book, lantern, star cluster, feather quill";

    return `CHILDREN'S STORYBOOK BACK COVER — 2:3 portrait.

═══ BOOK FORMAT — ABSOLUTE ═══
FLAT print-ready page, rendered as if scanned flat on a scanner bed. Straight, rigid, parallel to viewer. NO 3D mockup, NO bent corners, NO page curl, NO wavy paper, NO lifted edges, NO curved sides, NO shadows implying a 3D page, NO perspective, NO thickness shown, NO spine. Every corner is a perfect 90°. If any corner bends or page curves, the image is WRONG.
You are rendering the print-ready ARTWORK FILE, not a photograph of a book.

═══ CATEGORY IDENTITY ═══
Category: ${book.category}. This back cover must feel part of the same visual language as its front cover.

═══ LAYOUT (top to bottom) ═══

HEADER — display EXACTLY:
→ Masal Bitti Ama İzleri Kaldı...
Do NOT insert child's name or category words into the header.
Style: large elegant decorative bold serif, warm brown (#4E342E), optically centered.

STORY SUMMARY (display EXACT Turkish text):
"${summary}"
Style: elegant readable serif, dark brown (#5D4037), centered, max 3 lines, breathing.

SECTION HEADING (display EXACT Turkish text): "NE ÖĞRENDİ?"
Style: bold playful display, warm orange (#E65100).

ACHIEVEMENTS GRID (2×2 of 4 subtle rounded cards, ALL IN TURKISH). Each card has an illustrated 3D icon SEMANTICALLY MATCHING its Turkish text. EACH CARD MUST HAVE A DIFFERENT ICON.

${kazanimGrid}

Style: rounded cards, warm cream background, thin warm-brown border. Icon left (~22% of card width), text right (clean Nunito sans-serif).

HERO CHARACTER ILLUSTRATION (bottom-left, NOT dominating):
A small 3D Pixar illustration of ${name} — Age-appropriate cozy clothing (NOT a suit). Face matches the front cover reference EXACTLY. Size ~20-25% frame width, playful pose, happy confident smile. Same category world (scene/props match front cover category).

FOOTER LINE (display EXACT Turkish text): "Her çocuk kendi hikâyesinin kahramanıdır..."
Style: elegant italic warm script, warm orange (#BF360C).

BRAND SECTION at very bottom (CRITICAL — use the LAST reference image as the brand logo):
- MasalSensin LOGO (from LAST reference image), centered at bottom, ~14-18% width. Reproduce AS-CLOSE-AS-POSSIBLE to the reference (castle + quill + open book + cursive wordmark). Do NOT redesign.
- Below logo: small text "www.masalsensin.com" in elegant subtle serif
- Small personalization badge: "Bu kitap ${name} için özel olarak hazırlanmıştır ❤️"

═══ DESIGN ═══
- Soft warm cream to light peach gradient background
- Edge decorations: ${decor}
- Warm brown / orange color palette for text
- Clean, elegant, premium book quality

═══ CRITICAL ═══
- Summary rendered VERBATIM
- Turkish diacritics (ş ç ğ ü ö ı İ) PERFECT
- "NE ÖĞRENDİ?" heading EXACTLY ONCE
- 4 kazanım cards, each with a DIFFERENT semantic icon
- Hero child bottom-left, ~20-25%, NOT dominating

═══ BRAND VOCAB (MUTLAK) ═══
- "sihir", "büyü", "mucize", "tılsım" KELİMELERİ YASAK.`;
  }

  /**
   * MESLEK kategorisine özel ön kapak prompt'u.
   * UrunStudio'dan port — meslek profili (uniform, workplace, tools, iconic scenes) ile profession-specific cover.
   */
  buildMeslekCoverPrompt(options = {}) {
    const { characterDesc, profile } = options;
    const book = this.bookData;
    const name = this.childInfo.name;
    const meslekLabel = profile?.labelTR || "Meslek";
    const workplaceEN = profile?.workplaceEN || "the professional workplace";
    const uniformEN = profile?.uniformEN || "age-appropriate professional uniform";
    const toolsEN = profile?.toolsEN || "";
    const iconicHint = profile?.iconicSceneHints || (book.scenes?.[0]?.title || "");
    const titleIcon = profile?.titleIcon || "a small decorative profession icon integrated with the title";
    const colorPaletteHint = profile?.colorPaletteHint || "warm cinematic tones matched to the profession";
    const personalizedTitle = this._personalizeTitle(book.title, name);
    const charDesc = characterDesc || this._getDefaultCharacterDesc();

    return `A PREMIUM CINEMATIC PIXAR-STYLE PERSONALIZED CHILDREN'S BOOK COVER — 2:3 portrait format. Full 3D Pixar/Disney CGI quality like a frame from an animated feature film. NOT 2D, NOT flat cartoon, NOT anime.

═══ PROFESSION IDENTITY (READ FIRST, CRITICAL) ═══
This book is specifically about ${name} as a ${meslekLabel}. ONLY ${meslekLabel} context. Do NOT render a football player, doctor, dancer, astronaut, chef, vet, or any other profession unless the profession IS ${meslekLabel}. Every visual element — uniform, workplace, tools, colors — must match ${meslekLabel} and NOTHING else. Even if the child's name or the scene could suggest another context, ignore that — this is a ${meslekLabel} book, full stop.

═══ HERO MOMENT ═══
The cover captures ${name} in a DEFINING ICONIC MOMENT of being a ${meslekLabel}. Choose ONE visually powerful beat from: ${iconicHint}
The child is caught MID-ACTION inside the profession — proud, focused, alive in the role. NOT posed for camera, NOT standing still. Dynamic body language, strong directional lighting, emotional facial expression.

═══ CINEMATIC COMPOSITION (3-layer depth like a Pixar film frame) ═══
- FOREGROUND: Profession-relevant objects close to camera (tool, desk edge, control panel corner) slightly blurred — adds depth
- MIDGROUND: The CHARACTER in dynamic action pose, in sharp focus, as the emotional focal point
- BACKGROUND: Rich workplace environment, softly focused — setting context without stealing attention
- This 3-layer approach creates CINEMATIC DEPTH like a key frame from a Pixar feature

═══ CINEMATIC LIGHTING (emotion through light) ═══
- Warm rim-light catching the character's hair and shoulder edges (golden / sky / workplace-appropriate)
- A MAGICAL or meaningful LIGHT SOURCE in the scene that fits the profession (cockpit instruments glowing, clinic bright overhead, stadium lights, stage spot, space porthole glow, kitchen hearth, lab screen, studio skylight)
- Volumetric light beams or gentle dust particles catching light
- Light = emotion: dramatic directional lighting, NOT flat even render

═══ THE ${meslekLabel.toUpperCase()} UNIFORM (CRITICAL — get this RIGHT) ═══
${name} wears this uniform EXACTLY: ${uniformEN}
Every detail of the uniform must be clearly visible and accurate. This is the single biggest signal that "kitap ne hakkında" — get the costume perfect.
Profession tools visible in composition: ${toolsEN}

═══ WORKPLACE ENVIRONMENT ═══
The setting is: ${workplaceEN}
Render as a FULL 3D WORLD with depth, atmosphere, realistic lighting. 3-layer cinematic depth: FOREGROUND (tools/props of trade), MIDGROUND (child in action), BACKGROUND (workplace context softly focused). This environment tells the viewer "this book is about being a ${meslekLabel}" instantly.

═══ HERO CHARACTER + FACE CONSISTENCY (NON-NEGOTIABLE) ═══
${name}, a ${this.age}-year-old Turkish ${this.genderEn}. ${charDesc}.

⚠️ REFERENCE PHOTO USAGE — CRITICAL:
The reference photo (character-profile.png) is provided ONLY for FACE/HAIR/SKIN identity. You MUST COMPLETELY IGNORE the background, environment, outfit, props, and lighting from the reference photo. Do NOT reproduce ANY element from the reference photo's surroundings. The ONLY thing to carry forward from the reference is the child's facial features and Turkish ethnicity. The ENVIRONMENT, BACKGROUND, OUTFIT, and LIGHTING of THIS cover MUST be the ${meslekLabel} workplace as specified in the WORKPLACE ENVIRONMENT section above.

FACE IDENTITY — ${name}'s face in this Pixar cover MUST be IMMEDIATELY recognizable as the SAME child from the reference photo.

EMOTION + POSE:
- Emotion on face is FOCAL POINT: proud determination / joyful confidence / dreamy focus
- Child caught MID-ACTION (not posed for camera) in the profession
- Age-appropriate for ${this.age} years — small child in a (slightly oversized but properly fitted) professional uniform, which amplifies the "playing grown-up" charm

═══ TITLE TYPOGRAPHY ═══
Main title: "${personalizedTitle}"
- ALL TITLE TEXT in WARM HAND-LETTERED DECORATIVE SERIF (think Fraunces / Recoleta / Playfair Display bold-italic feel) — warm cream/ivory color (#F5EFE6 or #F7E9CF) on the darker workplace background, with subtle soft drop-shadow for readability
- Child's name line slightly larger and more playful; rest of title slightly smaller but same decorative style — harmonious, not separated fonts
- INTEGRATED PROFESSION ICON: ${titleIcon} — small, warm-toned, plays with the letters naturally
- Title positioned TOP of the cover, takes ~25-30% vertical space
- Title appears EXACTLY ONCE
- Reference for typography style: classic storybook title — warm, inviting, decorative-but-readable

═══ TITLE SAFE ZONE (ABSOLUTE) ═══
- Reserve the TOP 30-35% of the canvas as a CLEAN TITLE BAND with minimum foreground interference.
- No leaves, branches, or objects may cover ANY part of any letter — especially the final letter of each word. A clipped "ı", "i", dot over "İ", or tail of "ş", "ğ", "ç" makes the cover UNUSABLE.
- Every letter of "${personalizedTitle}" including diacritics MUST be 100% visible.

═══ TURKISH CHARACTERS (CRITICAL) ═══
"${personalizedTitle}" spelled EXACTLY letter by letter.
- ı (dotless i) ≠ i | İ (dotted cap I) ≠ I | ş ≠ s | ç ≠ c | ğ ≠ g | ö ≠ o | ü ≠ u
- Mixed case as provided. "Macerası" NOT "MACERASI"

═══ BOTTOM-RIGHT PERSONALIZATION SEAL ═══
A beautiful gold-foil circular seal (#D4A574) with subtle emboss, ~14-18% frame width.
Inside the seal Turkish text: "Bu kitap ${name} için özel üretilmiştir"
Small decorative laurel/ornament around the seal edge.

═══ BOOK FORMAT (CRITICAL) ═══
- THIN FLEXIBLE PAPERBACK — magazine-style. NOT a thick novel. NOT a hardcover.
- Render as a FLAT print-ready cover page (2:3 portrait, full-bleed artwork). NO 3D mockup, NO page curl, NO shelf perspective, NO hands holding the book, NO spine visible.
- ABSOLUTELY NOT: hardcover, case-bound, leather, cloth, thick spine, gold-foil embossed title, raised letters.

═══ STYLE ═══
- Full Pixar/Ice Age 3D CGI — subsurface scattering, volumetric lighting, hyper-detailed textures, photorealistic fabric folds, cinematic depth
- Saturated cinematic color palette: ${colorPaletteHint}
- Rich textures: fabric folds on uniform, individual hair strands, skin subsurface, material-accurate surfaces (metal tools, cloth, leather)
- Environmental storytelling: small profession-specific details in the scene

═══ CRITICAL ═══
- Turkish diacritics PERFECT
- Title appears EXACTLY ONCE
- No barcode, no price, no ISBN, no publisher strip
- The uniform is the LOUDEST signal — someone glancing at the thumbnail must INSTANTLY know "this book is about a ${meslekLabel}"

═══ BRAND VOCAB (MUTLAK) ═══
- "sihir", "sihirli", "büyü", "büyülü", "mucize", "tılsım" KELİMELERİ YASAK (görselde dahi).
- Yerine: "ışık", "yıldız", "kıvılcım", "hayal", "kalp" gibi yere basan kelimeler.`;
  }

  /**
   * MESLEK kategorisine özel arka kapak prompt'u.
   */
  buildMeslekBackCoverPrompt(options = {}) {
    const { profile } = options;
    const book = this.bookData;
    const name = this.childInfo.name;
    const meslekLabel = profile?.labelTR || "Meslek";
    const uniformEN = profile?.uniformEN || "age-appropriate professional uniform";
    const diplomaTitle = profile?.diplomaTitle || "KAHRAMANLIK SERTİFİKASI";
    const meslekSymbols = profile?.diplomaSymbols || "profession-matched icons";
    const kazanimlar = (book.lessons || []).slice(0, 4);

    // Summary — keep ~2 full sentences (up to ~340 chars), balanced between 280 (1-cümle) and 460 (3-cümle)
    let summary = book.description || `${name}, ${meslekLabel} olmanın heyecanını ve sorumluluğunu keşfettiği bir yolculuğa çıkar.`;
    if (summary.length > 340) {
      const cut = summary.slice(0, 340);
      const lastPeriod = cut.lastIndexOf(".");
      summary = lastPeriod > 180 ? cut.slice(0, lastPeriod + 1) : cut.slice(0, 337) + "...";
    }

    const kazanimGrid = kazanimlar.map((k, i) =>
      `Card ${i + 1} — text: "${k}" — icon: a small 3D-illustrated icon that VISUALLY REPRESENTS the meaning of this specific ${meslekLabel} value. Example: cesaret → shield or lion; disiplin → target or star; liderlik → crown or compass; sorumluluk → clock or heart-hands; empati → heart with hands; yaratıcılık → lightbulb with sparkles; merak → magnifying glass; bilimsel düşünme → atom or book; gözlem → eye or magnifier; sabır → hourglass; azim → mountain peak; takım çalışması → connected people; hayal kurma → cloud with stars; hızlı karar → lightning bolt; dayanışma → hands together; yardımseverlik → heart with helping hand. Pick the MOST fitting icon for "${k}".`
    ).join("\n");

    return `CHILDREN'S STORYBOOK BACK COVER — 2:3 portrait.

═══ BOOK FORMAT — ABSOLUTE (read this FIRST, violation invalidates the image) ═══
The output MUST be a FLAT print-ready page, as if scanned flat on a scanner bed. The page sits STRAIGHT, RIGID, PARALLEL to the viewer. NO 3D mockup, NO bent corners, NO page curl, NO wavy paper, NO lifted edges, NO curved sides, NO shadows implying a 3D page, NO perspective, NO thickness shown, NO spine, NO binding visible. Every corner is a perfect 90° on the 2:3 rectangle. If ANY corner bends or the page curves even slightly, the image is WRONG and must be regenerated.
You are rendering the artwork FILE (the print-ready .pdf page design), not a photograph of a book.

═══ PROFESSION IDENTITY (READ FIRST, CRITICAL) ═══
This book is specifically about ${name} as a ${meslekLabel}. ONLY ${meslekLabel} context. Every symbol, color, icon must fit a ${meslekLabel}. Do NOT mix in elements from other professions.

This is the REVERSE SIDE of the front cover shown in the reference image. Same book, same visual language, same art style.

LANGUAGE: ALL text MUST be in TURKISH.

═══ LAYOUT (top to bottom) ═══

HEADER — display EXACTLY these 5 Turkish words with trailing ellipsis:
→ Masal Bitti Ama İzleri Kaldı...
Do NOT insert child's name, do NOT add "Kahraman", do NOT add profession word into the header.
Style: large elegant decorative bold serif at top, warm brown color (#4E342E), optically centered.

STORY SUMMARY (display EXACT Turkish text):
"${summary}"
Style: elegant readable serif, dark brown (#5D4037), centered, max 3 lines, breathing.

SECTION HEADING (display EXACT Turkish text): "NE ÖĞRENDİ?"
Style: bold playful display font, centered, warm orange (#E65100).

ACHIEVEMENTS GRID (2×2 grid of 4 subtle rounded cards, ALL IN TURKISH). Each card has an illustrated 3D icon that SEMANTICALLY MATCHES its Turkish text. EACH CARD MUST HAVE A DIFFERENT ICON from the other 3.

${kazanimGrid}

Style: each achievement in a subtle rounded card with warm cream background and thin warm-brown border. 3D illustrated icon on the LEFT (~22% of card width), Turkish text on the RIGHT. Clean readable sans-serif (Nunito). Icons visually distinct AND meaningfully tied to their text.

SMALL DIPLOMA PEEK (right of or below the kazanım grid):
A small illustrated folded parchment diploma-corner peeking in, showing just the top header text "${diplomaTitle}" and a hint of gold-foil ornamental border + small heraldic emblem using ${meslekLabel} symbols: ${meslekSymbols}. ~15-18% of the page, subtle gold glow, slight tilt.

HERO CHARACTER ILLUSTRATION (bottom area, NOT dominating):
A 3D Pixar illustration of ${name} wearing the ${meslekLabel} uniform: ${uniformEN.split(",").slice(0, 3).join(",")}, standing proudly, holding the actual diploma with one hand, smiling warmly. Face matches the front cover reference EXACTLY. Size ~25-30% frame width. Confident pose — NOT static, NOT posed — a "proud graduation moment".

FOOTER LINE (display EXACT Turkish text): "Her çocuğun hayallerine giden bir yolu vardır..."
Style: elegant italic warm script font, warm orange (#BF360C).

BRAND SECTION at very bottom (CRITICAL — use the LAST reference image as the brand logo):
- Place MasalSensin LOGO (from LAST reference image) centered at bottom, ~14-18% width. Reproduce AS-CLOSE-AS-POSSIBLE (castle + quill + open book + cursive wordmark). Do NOT redesign, do NOT stylize.
- Below logo: small text "www.masalsensin.com" in elegant subtle serif
- Small personalization badge: "Bu kitap ${name} için özel olarak hazırlanmıştır ❤️"

═══ DESIGN ═══
- Soft warm cream to light peach gradient background
- Subtle profession-themed watercolor decorations at edges (tools/symbols of ${meslekLabel}, not full scenes)
- Clean, elegant, premium book quality
- Warm brown and orange color palette for text

═══ CRITICAL ═══
- Summary rendered VERBATIM, Turkish diacritics (ş ç ğ ü ö ı İ) PERFECT
- "NE ÖĞRENDİ?" heading appears EXACTLY ONCE
- 4 kazanım cards, each with a DIFFERENT semantically matching icon
- Diploma PEEK is small (15-18%) — NOT a full diploma
- Hero child (uniform + diploma) bottom, ~25-30% — proud but not dominating
- NO barcode, NO price, NO ISBN

═══ BRAND VOCAB (MUTLAK) ═══
- "sihir", "büyü", "mucize", "tılsım" KELİMELERİ YASAK.`;
  }

  /**
   * "Hikayemizin Kahramani" sayfasi prompt'u — LEGACY (kept for backward compat).
   * New code should call buildHeroPagePromptV2() below.
   */
  buildHeroPagePrompt(options = {}) {
    return this.buildHeroPagePromptV2(options);
  }

  /**
   * HERO PAGE V2 — "Photo-first unified backdrop with category-aware decor band"
   *
   * Layout:
   *   - Unified top+middle backdrop (no band split). Title floats on it within top ~22%.
   *   - Middle area is pure gradient — NO drawn rectangle / frame / character.
   *     (A real photograph will be composited programmatically later by renderHeroPage().)
   *   - Bottom ~30% is a rich illustrated decor band matching the BOOK's CATEGORY.
   *
   * Caller provides no photos here — that's handled in renderHeroPage (sharp composite).
   */
  buildHeroPagePromptV2(options = {}) {
    const name = this.childInfo.name;
    const book = this.bookData;
    const category = book.category || options.category || "hikaye";

    const decor = this._getHeroDecorBand(category, book);

    return `A PREMIUM CHILDREN'S STORYBOOK HERO PAGE — 2:3 portrait, "Photo-first unified backdrop" concept. The page is designed around a real photograph that will be composited onto the middle area later.

═══ LAYOUT (UNIFIED TOP+MIDDLE, decorative bottom band) ═══

UNIFIED TOP+MIDDLE ZONE (~70% of the page, top to about y≈70%):
- A SINGLE SEAMLESS atmospheric backdrop flowing top to ~70%. NO horizontal band splits, NO visible transition line between title and photo area.
- Atmosphere: ${decor.backdrop}
- TITLE TEXT floats ON this atmosphere:
  • "Hikayemizin Kahramanı" — hand-lettered warm-orange script (#E65100), decorative, centered horizontally, positioned at ~y=3-9% of the page.
  • "${name}" — LARGE display typography directly below, warm brown (#4E342E), chunky friendly cursive with tiny star flourishes, positioned ~y=9-16%.
  • NO subtitle text. Nothing else below the name.
  • CRITICAL: The ENTIRE title block (both lines + any ornaments/stars/flourishes) MUST fit within the TOP 20% of the page. NO descenders, NO stars, NO ornament flourishes may extend below y=20%. Use a COMPACT display font so ascenders/descenders stay contained. Below the title, at least 8% of pure calm backdrop space must exist before anything else.
- NO drawn rectangles, NO placeholder boxes, NO frames, NO white boxes anywhere in this unified zone.
- NO drawn characters, NO people, NO hands in the middle zone.
- Very soft side ornaments (small watercolor leaves / tiny stars at the extreme edges only) — they should NOT intrude into the center ~75% of the width.
- The ENTIRE unified zone from top to ~70% reads as ONE calm painted backdrop — title sits on it like embossed text on a mural.

DECORATIVE STORY BAND (BOTTOM ~30% of page):
${decor.band}

═══ MOOD & STYLE ═══
${decor.moodStyle}
- Subtle paper-grain texture throughout.
- NO harsh lines between zones — decor band horizon melts softly into the gradient above.

═══ CRITICAL NEGATIVES ═══
- NO drawn child character, NO human figure anywhere on the page (real photo goes in the middle later).
- NO drawn frame / border in the middle zone (frame is added programmatically).
- NO rectangular placeholder / box / cream rectangle in the middle.
- DO NOT render the book's main title "${book.title || ""}" anywhere — this is NOT a cover.
- The ONLY text on this page is exactly two lines: "Hikayemizin Kahramanı" and "${name}". NO subtitle, NO tagline, NO extra line.
- Turkish diacritics (ş ç ğ ü ö ı İ) PERFECT.

═══ ART STYLE ═══
Premium 3D Pixar × storybook watercolor hybrid. Cozy, warm, handcrafted. Magazine-cover polish.

═══ QUALITY BAR ═══
A parent sees this page and thinks "my child belongs on this page" — and the child sees their own photo here and thinks "this book is about me."`;
  }

  /**
   * Kategori bazli hero-page decor band seçimi.
   * Returns { backdrop, band, moodStyle }.
   */
  _getHeroDecorBand(category, book) {
    const c = (category || "").toLowerCase();

    // Günlük değerler — yatak, yemek, diş, uyku
    if (c.includes("gunluk-degerler") || c.includes("günlük-değerler")) {
      return {
        backdrop: "dreamy morning-sky-to-ground gradient — pale peach/cream with hints of sunrise gold, barely visible floating bokeh, tiny sparkle particles. Feels like one continuous painted sky-wall.",
        band: `- Warm stylized morning horizon (rising sun on the left, gentle hill silhouette).
- Hand-painted watercolor daily-rule objects scattered in balanced rhythm: a neat tidy bed with pillow, a breakfast plate with fruit, a standing toothbrush in a cup, a folded towel, an open storybook, cozy slippers, a small alarm clock showing 07:00.
- Tiny sparkle motes and warm-orange dots between objects.
- A graceful decorative ribbon / vine curving along the bottom-most edge.`,
        moodStyle: "Palette: cream, peach, honey, warm brown, soft orange. Morning warmth × photographer's studio backdrop × children's book illustration.",
      };
    }
    // Meslek
    if (c.includes("meslek")) {
      return {
        backdrop: "dreamy SKY theme — soft morning clouds, pale blue-to-cream gradient, very light sunlight filtering through, tiny floating sparkle particles.",
        band: `- Watercolor scene of a gentle runway or horizon with golden sunset behind hills.
- Hand-painted profession icons scattered across the band: a pilot cap with gold wings pin, goggles, a clipboard with checklist, a compass rose, a small model airplane in warm honey, a cloud with propeller motif, a mini windsock.
- Tiny sparkle motes and paper-sketched propeller dots between objects.
- A graceful decorative pennant ribbon curving along the bottom-most edge.`,
        moodStyle: "Palette: pale sky-blue, cream, warm honey, gold, soft orange. Sky-at-dawn × children's book × career nostalgia.",
      };
    }
    // Hayvan dostum
    if (c.includes("hayvan")) {
      return {
        backdrop: "warm garden-meadow sky — pale green-to-cream gradient, soft sun flare, tiny dandelion puffs floating.",
        band: `- Watercolor meadow scene with gentle hills and a winding path.
- Hand-painted pet/animal motifs scattered rhythmically: a paw print cluster, a collar with heart tag, a small dog-bone, a bowl of food, a ball of yarn, a butterfly, a small fetch-ball, a tiny sleeping-cat curl.
- Tiny paw-print dots between objects.
- A graceful decorative vine with small flowers curving along the bottom-most edge.`,
        moodStyle: "Palette: meadow green, cream, warm honey, blush pink. Meadow afternoon × cozy pet corner.",
      };
    }
    // Duygu kontrolleri
    if (c.includes("duygu")) {
      return {
        backdrop: "dreamy dusk-to-twilight gradient — soft lavender-to-peach with hints of cloud shapes, barely visible sparkle particles, gentle rainbow mist at the edges.",
        band: `- Watercolor emotion metaphors scattered along the band: a happy cloud with sunshine smile, a sleeping cloud with moon, a tiny rainbow arc, a heart with soft glow, a thoughtful cloud with question mark, a brave star, a calm lotus petal.
- Tiny emotion-themed dots (hearts, stars, swirls) between objects.
- A graceful decorative wave / vine curving along the bottom-most edge.`,
        moodStyle: "Palette: soft lavender, peach, mint, blush, cream. Dreamy feelings × children's meditation book.",
      };
    }
    // Yeni kardes
    if (c.includes("yeni-kardes") || c.includes("kardeş")) {
      return {
        backdrop: "warm nursery-pastel gradient — soft pink-cream-to-butter, faint star-cluster motifs in corners, very subtle sparkle particles.",
        band: `- Watercolor newborn motifs scattered softly: a tiny crib with soft pillow, a baby bottle, a pacifier, a folded swaddle blanket, a pair of small booties, a teddy bear bottom-center, a sibling-hands-holding-hearts icon, a tiny rattle.
- Tiny sparkle dots and pastel stars between objects.
- A graceful decorative ribbon with a small heart charm at the center curving along the bottom-most edge.`,
        moodStyle: "Palette: blush pink, butter cream, mint, warm honey. Nursery warmth × cozy sibling moment.",
      };
    }
    // Dogum gunu
    if (c.includes("dogum-gunu") || c.includes("doğum-günü")) {
      return {
        backdrop: "festive warm backdrop — confetti-sky gradient, faint balloon-string motifs at corners, subtle sparkle particles.",
        band: `- Watercolor birthday motifs scattered rhythmically: a multi-tier birthday cake with lit candle, 3-4 floating balloons (pink/yellow/turquoise), a small gift box with ribbon, a party hat, a celebration banner reading only sparkles (no text), a confetti burst, a small cupcake.
- Tiny confetti dots between objects.
- A graceful decorative garland curving along the bottom-most edge.`,
        moodStyle: "Palette: warm pink, butter yellow, mint turquoise, cream, gold. Birthday morning × bakery window.",
      };
    }
    // 23 Nisan
    if (c.includes("23-nisan") || c.includes("nisan")) {
      return {
        backdrop: "pale national-holiday cream-to-blue gradient, soft sunlight, very subtle sparkle particles (no flags floating in center).",
        band: `- Watercolor national-day motifs scattered softly: a small Turkish flag on a little pole, a Atatürk silhouette portrait in a small oval, children-holding-hands-in-a-row silhouette, a tiny school bell, a small laurel wreath, a paper airplane, a dove.
- Tiny star-and-crescent dots between objects.
- A graceful decorative ribbon curving along the bottom-most edge.`,
        moodStyle: "Palette: cream, pale blue, warm honey, soft red accent. Gentle national pride × children's classroom morning.",
      };
    }
    // Anneler günü
    if (c.includes("anneler-gunu") || c.includes("anneler-günü")) {
      return {
        backdrop: "warm floral-pastel gradient — blush rose to butter cream, soft rose petals drifting, very subtle sparkle particles.",
        band: `- Watercolor mother's-day motifs scattered tenderly: a small bouquet of roses in a jar, a heart-shaped card, a tea cup with saucer, a folded handwritten note, a small garden-flower cluster, an apron-with-heart icon, a hand-in-hand silhouette.
- Tiny petal and heart dots between objects.
- A graceful decorative floral vine curving along the bottom-most edge.`,
        moodStyle: "Palette: blush rose, butter cream, sage green, warm brown. Rose garden morning × handwritten love note.",
      };
    }
    // Boyama
    if (c.includes("boyama")) {
      return {
        backdrop: "creamy art-studio gradient — pale cream with color-splash hints at edges, faint crayon-scribble texture, tiny sparkle particles.",
        band: `- Watercolor art-studio motifs scattered: a set of colored pencils fanned out, a paint palette with rainbow dots, a small paintbrush, an open coloring book, a sheet of stars and sparkles, a mini maze puzzle, a cluster of crayons, a tiny canvas with a smile painted on it.
- Tiny paint-dot splatters between objects.
- A graceful decorative rainbow ribbon curving along the bottom-most edge.`,
        moodStyle: "Palette: warm cream, rainbow accents (balanced, not overwhelming), warm brown. Art studio × sunlit craft table.",
      };
    }
    // Sport (altin-*) — spor kategori kodu yok, category="kisisel-hikayeler" olabilir
    if (c.includes("spor") || /altin-/i.test(book?.id || "")) {
      return {
        backdrop: "warm stadium-sunset gradient — golden peach with soft field-green bottom, subtle crowd-bokeh far in background, tiny sparkle particles.",
        band: `- Watercolor sports motifs scattered: a small sports ball (basketball / soccer / tennis depending on book), a tiny trophy, a whistle, a ribbon rosette, a small sneaker pair, a stopwatch, a mini victory banner.
- Tiny golden-dot sparkle between objects.
- A graceful decorative victory ribbon curving along the bottom-most edge.`,
        moodStyle: "Palette: warm gold, deep green, cream, honey brown. Sunset stadium × children's sports nostalgia.",
      };
    }
    // Default (generic hikaye)
    return {
      backdrop: "dreamy warm gradient — cream-to-peach-to-honey, soft bokeh, tiny sparkle particles floating.",
      band: `- Watercolor storybook motifs scattered: an open storybook, a small lantern, a tiny star cluster, a feather quill, a mini telescope, a few flower blossoms, a small sleeping-cloud.
- Tiny sparkle dots between objects.
- A graceful decorative ribbon / vine curving along the bottom-most edge.`,
      moodStyle: "Palette: cream, peach, honey, warm brown. Storybook warmth × children's reading corner.",
    };
  }

  /**
   * "Biliyor Muydunuz?" sayfasi prompt'u
   */
  buildFunFactPagePrompt(funFact, options = {}) {
    const book = this.bookData;
    const facts = (funFact.facts || []).slice(0, 3); // max 3 facts — cleaner layout
    const title = funFact.title || "Biliyor Muydunuz?";
    const icon = funFact.icon || book.theme?.icon || "✨";
    const themeElements = this._getThemeDecorations(book);

    // Fact'ları satır bazlı, numaralandırılmış olarak formatla — sıkı verbatim direktifi için
    const factsFormatted = facts.map((f, i) =>
      `  Fact ${i + 1} — render VERBATIM inside its own card (do not shorten, do not paraphrase):\n    "${f}"`
    ).join("\n\n");

    return `PREMIUM CHILDREN'S STORYBOOK FUN-FACTS PAGE — 2:3 portrait format, FLAT full-bleed print-ready page. The page sits between story scenes as a delightful "did you know?" interlude.

═══ THEME & MOOD ═══
Warm, magazine-quality children's fun facts spread. Mood: curious, warm, inviting. Makes a child stop reading the story for a moment and say "oooh!" — then jump back in.

═══ LAYOUT (premium 3-zone) ═══
TOP ZONE (~18% height):
- HEADER: "${title}" — hand-lettered display font, warm brown (#4E342E), large (font-size ~8-10% of page height).
- Paired with a SOFT ILLUSTRATED ICON matching theme "${icon}" — hand-drawn watercolor style, ~8% of frame width, sits left of the title.
- Decorative underline: thin warm-orange double rule with a small ornamental motif in the center.

MIDDLE ZONE (~65% height):
- ${facts.length} illustrated cards in a vertical stack (one per row), each sized for premium readability (~85% of page width, rounded corners, cream background #FBF6EC, thin warm-brown border #8B5E3C, subtle drop shadow).
- Each card has THREE parts (left → right):
  1. ROUND hand-drawn watercolor icon (~14% of card width) — SEMANTIC: icon must illustrate the fact's concept (e.g., a tiny sequoia for tree heights, a tiny moon for sleep rhythms, a tiny sun for plants that wake with sunrise, a tiny astronaut for space facts — PICK the most fitting illustration per fact).
  2. A small decorative divider (golden dotted line or tiny star ornament).
  3. Fact TEXT — readable children's serif (Nunito/Quicksand), dark chocolate (#3E2723), 1.55x line spacing, left-aligned.
- Cards are subtly different warm pastel tints (peach, butter, lavender) for visual rhythm — NOT identical clones.

BOTTOM ZONE (~17% height):
- Decorative footer: a horizontal row of tiny hand-drawn watercolor ornaments matching "${themeElements}" — think "spot illustrations" like stars, moons, plants, miniature world icons.
- Small decorative corner flourishes at both bottom corners.

═══ FACTS TO RENDER ═══
${factsFormatted}

═══ VERBATIM TEXT RULE (critical) ═══
- Each fact MUST appear CHARACTER-BY-CHARACTER as written above. DO NOT paraphrase, shorten, reorder, merge, or drop sentences.
- Turkish diacritics (ş ç ğ ü ö ı İ) MUST be rendered EXACTLY. No ASCII substitutions.
- DO NOT translate to English.
- If text does not fit, reduce font size or add a second line — NEVER truncate mid-word.

═══ TYPOGRAPHY ═══
- Header: hand-lettered serif, warm brown (#4E342E), generous kerning, decorative flourishes on first and last letters.
- Fact text: rounded warm serif, chocolate (#3E2723), comfortable reading size, 7:1+ contrast against its card.
- NO scene/chapter/page numbers. NO body-of-text errors ("bambambaşka" etc. FORBIDDEN).

═══ COLOR & MATERIAL ═══
- Background: soft cream-to-butter gradient (#FDF8F0 → #F5EFE6), subtle paper grain.
- Warm watercolor edge decorations (top & bottom), soft bokeh at corners.
- Cards: cream (#FBF6EC) with thin warm-brown border and tender drop shadow.
- Icons: hand-drawn watercolor, warm palette — no flat solid shapes, no stock clip-art.

═══ ART STYLE ═══
${this._getArtStyle(book)}. Pixar × storybook × children's magazine hybrid. Cozy, premium, handcrafted.
NOT: flat corporate infographic, NOT: cheap PowerPoint, NOT: AI-overproduced sterile look.

═══ BRAND VOCAB ═══
- "sihir", "büyü", "mucize", "tılsım" KELİMELERİ YASAK (görsel metninde dahi).

═══ QUALITY BAR ═══
A child sees this page and wants to read the facts twice before returning to the story. A parent flips open the book, pauses on this page, smiles, and thinks "this is lovely."`;
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

    // NOT: Boyama kitaplari icin de artik Not Sayfasi (hediyeyi hazirlayana ozel) kullanilir.
    // Boyama'nin Tamamlandi Sertifikasi ARTIK diploma step'inde uretiliyor (ayri sayfa).

    // ── SENDER RESOLVER ──
    // Oncelik: childInfo'da senderName varsa ve senderRelation ya da (webhook'tan gelen) giftSenderRelation
    // belirtilmisse → o isim + iliskiyi kullan. Yoksa SENDER_POOL'dan rastgele sec.
    const customName = this.childInfo.giftSenderName || this.childInfo.senderName || "";
    const customRelation = (this.childInfo.giftSenderRelation || "").toLowerCase();
    let sender, hitap;

    if (customName && customRelation) {
      // Iliski anahtarini SENDER_POOL'daki key'lere normalize et
      const relMap = {
        "anne": "anne", "baba": "baba", "anne+baba": "anne+baba", "anne-baba": "anne+baba",
        "anneanne/babaanne": "anneanne", "anneanne": "anneanne", "babaanne": "babaanne",
        "dede": "dede", "nine": "anneanne",
        "teyze/hala": "teyze", "teyze": "teyze", "hala": "hala",
        "amca/dayı": "dayi", "amca/dayi": "dayi", "amca": "amca", "dayı": "dayi", "dayi": "dayi",
        "abla": "abla", "abi": "abi", "agabey": "abi",
        "arkadaş": "arkadas", "arkadas": "arkadas",
      };
      const matchedKey = relMap[customRelation] || "diger";
      const found = SENDER_POOL.find((s) => s.key === matchedKey);
      if (found) {
        sender = found;
        hitap = found.hitap(name);
      } else {
        // "Diğer" veya eslesmeyen: generic hitap + custom name imza
        sender = { key: "diger", signoff: `Seni çok seven,\n${customName} ❤️` };
        hitap = `Sevgili ${name}`;
      }
    } else if (customName) {
      // Sadece isim geldi, ilişki yok → generic tone
      sender = { key: "diger", signoff: `Seni çok seven,\n${customName} ❤️` };
      hitap = `Sevgili ${name}`;
    } else {
      sender = pickSender();
      hitap = sender.hitap(name);
    }

    let noteContent;
    try {
      noteContent = await generateNoteBody(book, name, this.childInfo.age, sender.key, customName);
    } catch (e) {
      noteContent = this._buildDynamicNote(name, customName || this.childInfo.senderName || "ailen", book);
    }
    const themeDecos = this._getThemeDecorations(book);

    return "CHILDREN'S STORYBOOK PERSONAL NOTE PAGE \u2014 2:3 portrait format. FLAT FULL PAGE \u2014 the page IS the stationery paper, filling the entire frame edge to edge. No table, no background surface.\n\n" +
"THE PAGE: Beautiful aged cream/ivory vintage stationery paper with warm subtle texture. Slightly yellowed corners, gentle aged feel. The paper fills the ENTIRE frame.\n\n" +
"TOP: An ornate wax seal with a heart in the center, warm burgundy color, positioned top-center. Below it a delicate decorative line.\n\n" +
"LETTER TEXT \u2014 written in GENUINE HANDWRITTEN dark brown ink. VERBATIM CHARACTER-BY-CHARACTER RENDERING (non-negotiable):\n" +
"\"\"\"\n" +
hitap + ",\n\n" +
noteContent + "\n\n" +
sender.signoff + "\n" +
"\"\"\"\n\n" +
"LANGUAGE + EXACT TEXT RULE:\n" +
"- ALL text MUST be in TURKISH. Do NOT translate.\n" +
"- Render the letter EXACTLY word-by-word, sentence-by-sentence. DO NOT shorten, paraphrase, summarise, or cut mid-word.\n" +
"- Every sentence MUST END CLEANLY on the page. If space is tight, reduce font size and enlarge the paper — NEVER leave a sentence unfinished (no trailing \"iç\", \"bambaşk\", etc.).\n" +
"- Preserve all Turkish diacritics (\u015f \u00e7 \u011f \u00fc \u00f6 \u0131 \u0130) exactly.\n" +
"- Preserve line breaks between paragraphs. The signature block stays on its own lines at the bottom.\n\n" +
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
   * KATEGORI DIPLOMASI / SERTIFIKASI — TUM KATEGORILER icin uniform dispatcher.
   * Kategori-ozgu baslik + semboller + mini karakter kiyafeti ile diploma uretir.
   *
   * Mapping:
   *  - meslek-hikayeleri -> buildMeslekDiplomaPrompt (meslekProfile'a gore)
   *  - boyama (her) -> buildBoyamaCertificatePrompt (Tamamlandi Sertifikasi)
   *  - hayvan-dostum -> "HAYVAN DOST SERTIFIKASI" (pati + kalp)
   *  - gunluk-degerler-egitimi -> "YILDIZ COCUK SERTIFIKASI" (yildiz + check)
   *  - duygu-kontrolleri -> "DUYGU KAHRAMANI SERTIFIKASI" (kalp + nefes + duygu metaphor)
   *  - yeni-kardes-hikayeleri -> "ABLA/AGABEY SERTIFIKASI" (kardes kalpleri)
   *  - 23-nisan -> "CUMHURIYET COCUGU SERTIFIKASI" (bayrak + kitap)
   *  - anneler-gunu -> "SEVGI KAHRAMANI SERTIFIKASI" (kalp + cicek)
   *  - dogum-gunu -> "BUGUNUN YILDIZI SERTIFIKASI" (balon + pasta)
   *  - bebek-masallari -> "SEVIMLI BEBEK SERTIFIKASI" (soft icons)
   *  - default -> "KAHRAMAN SERTIFIKASI" (generic)
   */
  buildCategoryDiplomaPrompt(options = {}) {
    const book = this.bookData;
    const cat = (book.category || "").toLowerCase();
    const name = this.childInfo.name;

    // Boyama: Tamamlandi Sertifikasi (UrunStudio-tarzi)
    if (cat === "boyama" || /boyama/.test(cat)) {
      return buildBoyamaCertificatePrompt(name);
    }
    // Meslek: mevcut buildMeslekDiplomaPrompt
    if (cat === "meslek-hikayeleri") {
      return this.buildMeslekDiplomaPrompt(options);
    }

    // Kategori-ozgu baslik + semboller + mini karakter "costume"
    const catMap = {
      "hayvan-dostum": {
        title: "HAYVAN DOST SERTIFIKASI",
        body: "hayvan dostunla kurdugun sevgi bagi",
        symbols: "small paw prints + hearts + tiny animal silhouettes (puppy, kitten, rabbit) + soft watercolor vines",
        medallion: "paw print + heart inside a gold laurel, ribbon banner reading DOST ETMEK COK GUZEL",
        miniCostume: "her regular outfit with a tiny pet (paw print silhouette) beside her/him",
        palette: "warm cream + honey gold + soft terracotta + sage green accents",
      },
      "gunluk-degerler-egitimi": {
        title: "YILDIZ COCUK SERTIFIKASI",
        body: "gunun altin kurallarini basariyla ogrendin",
        symbols: "5-pointed gold stars + small check marks + tiny daily-habit icons (toothbrush, cereal bowl, folded clothes, bed) + gentle moral-tone watercolor",
        medallion: "large gold star with 5 small icons around it (yıkanma/yemek/giyinme/uyku/dis), ribbon banner reading YILDIZ GIBI PARLIYORSUN",
        miniCostume: "her day outfit holding a tiny gold star",
        palette: "honey yellow + warm chocolate brown + cream + soft golden gradient",
      },
      "duygu-kontrolleri": {
        title: "DUYGU KAHRAMANI SERTIFIKASI",
        body: "duygularini taniyip sag likla yonettin",
        symbols: "tiny hearts (various soft colors: peach, sky blue, dusty lavender) + breath swirls + small emotion metaphors (cloud, butterfly, rainbow) + calm watercolor",
        medallion: "large heart with smaller emotion icons around it (angry cloud, shy butterfly, sad raindrop, happy sun) — all softly colored, ribbon banner reading DUYGULARIMI TANIYORUM",
        miniCostume: "cozy sweater/jumper, holding a small heart in open palm",
        palette: "soft peach + dusty rose + pale sky-blue + cream + gentle lavender accents",
      },
      "yeni-kardes-hikayeleri": {
        title: "ABLA OLMA SERTIFIKASI",
        body: "kalbini acip kardesine yer actin",
        symbols: "two interlocking pastel hearts + small hand-in-hand silhouettes + soft baby-breath florals + gentle pastel pink/blue palette",
        medallion: "two hearts intertwined with ribbon, tiny baby footprint in center, banner reading KARDESINE KOL KANAT",
        miniCostume: "her regular outfit gently holding an imaginary small bundle close to heart",
        palette: "soft blush pink + cream + dusty sage + warm gold",
      },
      "23-nisan": {
        title: "CUMHURIYET COCUGU SERTIFIKASI",
        body: "Ataturk'un armaganini hak ettin",
        symbols: "small Turkish flags + laurel + open book + quill + star-crescent motifs + red+white color accents",
        medallion: "Turkish flag with star-crescent, open book beside, banner reading NE MUTLU TURKUM DIYENE",
        miniCostume: "crisp white shirt with red ribbon, holding a tiny flag",
        palette: "Turkish red (#E30A17) + pure white + warm navy + gold accents",
      },
      "anneler-gunu": {
        title: "SEVGI KAHRAMANI SERTIFIKASI",
        body: "kalbindeki sevgiyi tum anlamiyla paylasir gosterdin",
        symbols: "delicate hearts + small watercolor flowers (roses, tulips) + gentle feminine florals + golden ribbons",
        medallion: "large heart within a wreath of flowers, ribbon banner reading KALBIMIN KAHRAMANI",
        miniCostume: "pastel dress, holding a small bouquet",
        palette: "soft blush pink + rose gold + cream + warm coral",
      },
      "dogum-gunu": {
        title: "BUGUNUN YILDIZI SERTIFIKASI",
        body: "yeni bir yili kutladin, buyudun, parladin",
        symbols: "colorful balloons + confetti + tiny party hats + candles + cake slices + gift boxes + streamers",
        medallion: "large 'happy birthday' star with candles around, ribbon banner reading BUGUN SENIN GUNUN",
        miniCostume: "party outfit with a small party hat, holding a balloon",
        palette: "vibrant rainbow + cream + gold accents",
      },
      "bebek-masallari": {
        title: "SEVIMLI BEBEK SERTIFIKASI",
        body: "her yeni seyi merakla kesfediyorsun",
        symbols: "tiny pacifiers + baby booties + small cloud wisps + gentle stars + soft pastel accents + baby animal silhouettes",
        medallion: "round medallion with baby hand print, ribbon banner reading KUCUK AMA BUYUK KALPLI",
        miniCostume: "cozy pajamas, holding a tiny plush toy",
        palette: "soft baby-blue + pastel pink + cream + dusty gold",
      },
    };

    const cfg = catMap[cat] || {
      title: "KAHRAMAN SERTIFIKASI",
      body: "bu yolculuga cesur, merakli ve sicak bir kalple girdin",
      symbols: "small warm hearts + stars + laurel leaves + soft watercolor flourishes",
      medallion: "a warm sun with a heart in center, ribbon banner reading HIKAYENIN KAHRAMANI",
      miniCostume: "her regular outfit, beaming with pride",
      palette: "warm cream + soft gold + dusty rose + chocolate brown",
    };

    return `CHILDREN'S STORYBOOK OFFICIAL CERTIFICATE PAGE — 2:3 portrait format, FLAT FULL PAGE, the page IS the parchment filling the entire frame edge to edge. No table, no 3D, no curl, no perspective.

THE PAGE: Premium warm ivory/cream parchment with subtle aged texture and a rich ornate border frame. Slightly aged corners, gentle vintage feel. Paper fills the ENTIRE frame.

ORNATE BORDER (4 edges):
- Gold-foil ornamental frame with laurel wreaths, fine flourishes, and these specific symbols at the corners: ${cfg.symbols}
- Corners: small ornamental rosettes
- Delicate gold-leaf pattern running along all 4 edges
- Palette throughout: ${cfg.palette}

TOP HEADER (large, centered):
"${cfg.title}" — in ornate calligraphic display serif, deep navy (#1A237E) with subtle gold shimmer. Letter-spaced, elegant, optically centered. Small laurel wreath under the heading.

CENTER CONTENT (displayed in elegant Turkish):

Line 1 (centered, warm brown serif italic): "İşbu belge ile"

Line 2 — BIG hand-lettered child name, calligraphic display script, rich gold (#C9A227), with a subtle gold underline flourish: "${name}"

Line 3 (centered, warm brown serif):
"adlı kahramanın ${cfg.body}nı onaylar."

Line 4 — CENTER MEDALLION (circular emblem ~25% frame width): ${cfg.medallion}

Line 5 (centered, warm brown italic):
"Kalbi acikti, merakla oldu. Bu sertifikayi hak ettin."

TWO SIGNATURE LINES at the bottom of the diploma:
- LEFT: "MasalSensin Ekibi" — below a handwritten-style signature flourish
- RIGHT: "Kahramanin Kendisi" — below another signature flourish (signature line for child to sign)

DATE LINE (centered, between signatures):
"Tarih: _____ / _____ / _____" (dotted blank lines for the child to fill in)

BOTTOM-LEFT: a gold-foil circular seal (~14% frame width, emboss effect) with a small heart in center and text around the ring: "ONAY MUHRU".

BOTTOM-RIGHT: a small 3D Pixar illustration of ${name} wearing ${cfg.miniCostume}, beaming with pride holding this very certificate. ~18% frame width. Face matches the REFERENCE IMAGE exactly (same hair, skin, face).

LANGUAGE: ALL text MUST be in TURKISH. Do NOT translate. Write EXACTLY as provided above.

TYPOGRAPHY:
- "${cfg.title}": large ornate calligraphic serif, deep navy with gold shimmer
- Child name: large flowing calligraphic script in rich gold — the HERO of the page
- Body lines: elegant readable warm brown serif, natural spacing
- Italic lines: warm brown italic serif
- Turkish diacritics (ş ç ğ ü ö ı İ) PERFECT — every dot and cedilla exact

MASALSENSIN BRAND VOCAB (MUTLAK):
- "sihir", "sihirli", "büyü", "büyülü", "mucize", "tılsım" KELİMELERİ YASAK.
- Yerine: "ışık", "yıldız", "kıvılcım", "hayal", "kalp" kullan.

CRITICAL:
- FLAT full bleed — parchment IS the page, no 3D, no curl, no warp, no perspective.
- Feels PREMIUM and OFFICIAL — like a real certificate a child would frame
- Small 3D Pixar illustration of ${name} bottom-right supports but does NOT compete with the certificate text
- Only ONE of each text block; no duplications
- SINGLE COHESIVE FULL-BLEED page, NO panels, NO grids, NO split

═══ CHARACTER IDENTITY (FROM REFERENCE IMAGE — CRITICAL) ═══
The small 3D Pixar illustration of ${name} in the bottom-right corner MUST match the child character shown in the REFERENCE IMAGE (the front cover). Same face, same hair, same skin tone, same eyes. Only costume detail may differ.`;
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
      "STORY TEXT — ABSOLUTE FAITHFUL RENDER (non-negotiable):\n" +
      "The central panel MUST show the following Turkish text CHARACTER-BY-CHARACTER, WORD-BY-WORD, SENTENCE-BY-SENTENCE.\n" +
      "• DO NOT shorten, abbreviate, merge, or paraphrase.\n" +
      "• DO NOT invent new words. DO NOT insert extra syllables (e.g., \"bambambaşka\" is forbidden; only \"bambaşka\" if the source says so).\n" +
      "• DO NOT translate to English or any other language.\n" +
      "• DO NOT drop diacritics. (ş, ç, ğ, ü, ö, ı, İ must appear exactly as in the source.)\n" +
      "• Preserve Turkish possessive/case suffixes EXACTLY as given (e.g., \"Yaren'in\" stays \"Yaren'in\", never \"Yaren'nın\"; \"Yaren'e\" stays \"Yaren'e\", never \"Yaren'ye\").\n" +
      "• If text is too long to fit, make the panel larger or reduce font size — NEVER trim, NEVER summarise, NEVER replace with a paraphrase.\n" +
      "• Preserve line breaks and paragraph shape reasonably.\n" +
      "The text below is the single source of truth. Render it verbatim:\n\"\"\"\n" + text + "\n\"\"\"\n\n" +
      "MINIATURE CHARACTER (small, adorable, supporting role \u2014 NOT the main focus):\n" +
      "- " + name + ", a " + this.age + "-year-old Turkish " + this.genderEn + ". CHARACTER IDENTITY LOCK: face MUST be IDENTICAL to the FIRST reference image (character-profile.png) — same eye shape/color, same nose, same mouth, same hair COLOR + same hair LENGTH + same hair STYLE (curly stays curly, straight stays straight, long stays long — never change these), same skin tone, same face shape, same proportions. If the reference shows short curly brown hair, DO NOT render long straight blonde. Accessory consistency: if reference has glasses/hair clip/dimples, render them here too. Drift punishable — if output character's hair differs from reference, the image is WRONG.\n" +
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
      "COMPOSITION DIVERSITY (CRITICAL — THE BIGGEST FAILURE MODE):\n" +
      "- The miniature character MUST NOT copy the pose, gesture, or action from the scene illustration reference (if you see one in the references).\n" +
      "- Use the scene illustration ONLY for atmosphere/lighting/environment cues — NEVER for character pose. The miniature character is a SEPARATE rendering that re-imagines the moment from a fresh angle.\n" +
      "- Concrete examples of REQUIRED variety:\n" +
      "  * If the scene shows the child sitting cross-legged → miniature shows the child standing/walking instead.\n" +
      "  * If the scene shows the child reaching → miniature shows them looking back over the shoulder.\n" +
      "  * If the scene shows the child face-on → miniature shows side or 3/4 profile view.\n" +
      "  * If the scene shows hand on face → miniature shows arms outstretched or holding the prop differently.\n" +
      "- Camera angle MUST differ: scene = wide shot → miniature = close-up; scene = front-on → miniature = side; scene = high angle → miniature = eye-level.\n" +
      "- THE WHOLE POINT of the miniature is to give a DIFFERENT, complementary view of the same story moment, like a behind-the-scenes Polaroid sticker. If the miniature looks like a tiny copy of the scene, the page is WRONG.\n" +
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

    const cat = (book.category || "").toLowerCase();

    // Meslek → profile-based back cover
    if (cat.includes("meslek")) {
      const meslekProfile = detectMeslekProfileFromBook(book);
      if (meslekProfile) return this.buildMeslekBackCoverPrompt({ ...options, profile: meslekProfile });
    }

    // Other categories → config-driven back cover
    const catKey = this._detectCategoryKey(cat);
    if (catKey && catKey !== "default") {
      return this.buildCategoryBackCover({ ...options, catKey });
    }

    const allLessons = book.lessons || [];
    // 2x2 grid — 4 kazanım (UrunStudio pattern)
    const lessons = allLessons.slice(0, 4);
    const description = book.description || "";
    const themeDecos = this._getThemeDecorations(book);

    // Kisisellestirilmis hikaye ozeti — kitap açıklamasından türet (sport-centric şablonu kaldırıldı)
    let summary;
    if (description && description.length > 50) {
      // Mevcut description'ı kısalt — son nokta yerinde kes, asla "..." ile bitme
      const maxLen = 280;
      if (description.length <= maxLen) {
        summary = description;
      } else {
        const cut = description.slice(0, maxLen);
        const lastPeriod = cut.lastIndexOf(".");
        summary = lastPeriod > 120 ? cut.slice(0, lastPeriod + 1) : cut.slice(0, maxLen - 3) + "...";
      }
    } else {
      // Fallback neutral summary — kategori-agnostik
      summary = `${name}, bu hikâyenin içinde kendini keşfetti. Küçük bir adım bile, kocaman bir dünyanın kapısını aralamaya yeter.`;
    }

    // Kazanim listesi — semantik icon talimatıyla (UrunStudio yaklaşımı)
    // Her icon'un anlamı kazanım metnine uygun olmalı; default liste YOK.
    let lessonsText = "";
    if (lessons.length > 0) {
      lessonsText = lessons.map(function(l, i) {
        return "Card " + (i + 1) + " — text: \"" + l + "\" — icon: [AI must choose an illustrated icon that SEMANTICALLY MATCHES the meaning of this specific Turkish text. Examples: \"arkadaşlık/paylaşım\" → two small hands or hearts; \"cesaret\" → a lion or shield; \"hayal gücü\" → a lightbulb with sparkles; \"öğrenme/merak\" → an open book or magnifying glass; \"sevgi/aile\" → a glowing heart; \"düzen/temizlik\" → a broom or a neat shelf; \"uyku/gece\" → a crescent moon; \"yemek/beslenme\" → a fruit bowl or plate; \"söz dinleme\" → a listening ear or speech bubble; \"özgüven\" → a star or crown. Choose the MOST fitting one for THIS card's meaning — NEVER pick an unrelated icon like a basketball for a food-related lesson.]";
      }).join("\n");
    }

    return `CHILDREN'S STORYBOOK BACK COVER PAGE — 2:3 portrait format. FLAT full-bleed print-ready back cover.

LANGUAGE: ALL text on this page MUST be in TURKISH. Do NOT translate any Turkish text to English. Write EXACTLY as provided below.

HEADER (display this EXACT Turkish text): "Masal Bitti Ama İzleri Kaldı..."
Style: large elegant decorative bold font at top, warm brown color.

STORY SUMMARY (display this EXACT Turkish text):
"${summary}"

SECTION HEADING (display this EXACT Turkish text): "NE ÖĞRENDİ?"
Style: bold playful display font, centered, warm orange (#E65100).

ACHIEVEMENTS (display as a 2×2 grid of 4 subtle rounded cards, ALL IN TURKISH). Each card has an illustrated icon that SEMANTICALLY MATCHES its Turkish text (NOT a fixed icon, NOT random — the icon must relate to what the text says). EACH CARD MUST HAVE A DIFFERENT ICON from the other 3 cards.

${lessonsText}

Style: each achievement in a subtle rounded card/frame with warm cream background and thin warm-brown border. Illustrated 3D-style icon on the LEFT of each card (~22% of card width), Turkish text on the RIGHT. Clean readable sans-serif (Nunito/DM Sans). Icons must be visually distinct AND meaningfully tied to their text. If any icon is unrelated to its card's text OR if two cards show the same icon, the image is WRONG.

FOOTER LINE (display this EXACT Turkish text): "Her çocuk kendi hikâyesinin kahramanıdır..."
Style: elegant italic warm script font.

BRAND SECTION at very bottom (CRITICAL — use the LAST reference image as the brand logo):
- Place the MasalSensin LOGO (from the LAST reference image provided) centered at the bottom footer area, ~14-18% width of the page
- The logo features an open storybook with a small castle and quill above, plus the cursive wordmark "Masalsensin" — reproduce this composition AS-CLOSE-AS-POSSIBLE to that reference image (preserve castle + quill + open book + wordmark exactly as shown). DO NOT redesign, DO NOT stylize, DO NOT invent a new logo.
- Below the logo: small text "www.masalsensin.com" in elegant subtle serif
- Small personalization badge near the logo: "Bu kitap ${name} için özel olarak hazırlanmıştır ❤️"

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
    // Title zaten name ice riyorsa (orchestrator swap sonrasi) wrap etme — oldugu gibi don.
    // Ornek: title="Yaren ve Pati" + name="Yaren" -> "Yaren ve Pati" (wrap yok)
    if (title && name && new RegExp("\\b" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(title)) {
      return title;
    }
    // Zaten possessive var mi (ör. "Fenerbahçe'nin Yıldızı")
    if (title && title.includes("'")) {
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
