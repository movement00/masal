/**
 * productVisualsAgent.js — Node port of
 *   MasalSensinUrunStudio/src/services/productVisualsAgent.ts
 *
 * 1:1 functional parity. No added features.
 *
 * Exports:
 *   - generateFlatLay(concept, frontCoverRef, category?)
 *   - generateOpenBook(concept, frontCoverRef, category?)
 *   - generateGiftBox(concept, frontCoverRef)
 *   - generateSpecLabels(concept, frontCoverRef)
 *   - generatePrintQuality(concept, frontCoverRef)        // kept for back-compat
 *   - generateNotePage(concept, category?)
 *   - generateStoryboard(concept, frontCoverRef)
 *   - generateCoverDuo(concept, frontCoverRef, backCoverRef)
 *   - generateMeslekDiplomaPage(concept, frontCoverRef?)
 *
 * Notes:
 *   - BOOK_FORMAT_DIRECTIVE inlined verbatim from UrunStudio's coverAgent.ts.
 *   - `generateText` is loaded lazily inside generateNoteBody to mirror the
 *     original dynamic import pattern.
 */

const { generateImage, generateText } = require("./geminiClient");
const { getMeslekProfileFromTitle } = require("../rules/meslek-profiles");

// Verbatim from UrunStudio coverAgent.ts
const BOOK_FORMAT_DIRECTIVE = `═══ BOOK FORMAT — THIN MAGAZINE-STYLE PAPERBACK (CRITICAL) ═══
This product is a THIN FLEXIBLE MAGAZINE-STYLE PAPERBACK — think National Geographic Kids, a children's activity magazine, or a school workbook. It is NOT a hardcover book.
- THICKNESS: approximately 3-5mm total — very thin, like a magazine, NEVER like a novel or chapter book
- COVER: soft flexible paper, bendy, you could roll it up like a magazine. Cover paper is a single thin sheet of matte or soft-gloss cardstock — NOT a rigid cardboard board
- NO visible binding details: do NOT draw staples, do NOT draw stitches, do NOT draw glue lines. Just a clean, simple paper edge — the binding is not rendered.
- ABSOLUTELY NOT: hardcover, case-bound, leather, cloth, thick spine, embossed raised letters, gold-foil raised title, rigid board, chunky binding
- Physical reference the AI should imagine: a thin children's activity magazine or a National Geographic Kids issue — that flexibility and thinness
- If the rendered book looks thick, chunky, hardcover, or has a rigid spine with raised letters, the IMAGE IS WRONG and must be regenerated
- For flat-product shots: render as COMPLETELY FLAT single page (2:3 portrait), NO 3D mockup, NO page curl, NO bent corners, NO wavy paper, NO warp, NO perspective. The cover must sit STRAIGHT and RIGID as if scanned flat.`;

function detectMeslekProfile(concept) {
  return (
    getMeslekProfileFromTitle(concept.kahraman.kiyafet) ||
    getMeslekProfileFromTitle(concept.baslik)
  );
}

/**
 * Flat-lay mockup — book lying flat with lifestyle props, top-down view
 */
async function generateFlatLay(concept, frontCoverRef, category) {
  if (category && category.group === "boyama") {
    return generateBoyamaFlatLay(concept, frontCoverRef);
  }
  if (category && category.id === "meslek-hikayeleri") {
    return generateMeslekFlatLay(concept, frontCoverRef);
  }
  const prompt = `Top-down flat-lay product photograph of a thin soft-cover A4 children's storybook "${concept.baslik}".

LAYOUT: Bird's-eye view (directly from above), the book lies FLAT in the center of the frame.

THE BOOK: THIN FLEXIBLE PAPERBACK — magazine-style, saddle-stitched. NOT hardcover, NOT thick spine, NO embossed title. The front cover MUST reproduce the reference image artwork EXACTLY: same title "${concept.baslik}", same character illustration, same colors, same typography. If you draw a different cover, image is WRONG. A4 size, thin bendy paper cover.

PROPS AROUND THE BOOK (arranged aesthetically):
- Colored pencils (scattered naturally, warm tones)
- A small plush toy (bunny or bear, soft and cute)
- A few dried flowers or a small succulent
- A warm cup of cocoa/milk (small, ceramic, cute)
- A pair of tiny children's glasses (optional, for charm)
- Small star-shaped confetti or sparkle stickers scattered lightly
- A small handwritten note card saying "Seninle başlıyor ✨"

SURFACE: Clean warm cream/beige linen tablecloth or light wooden table. Natural texture visible.

LIGHTING: Bright soft natural daylight from above-left. Gentle shadows. Clean and airy.

STYLE: Instagram-worthy product flat-lay. Professional e-commerce photography. Warm, inviting, premium but playful. Think Papier or Rifle Paper Co product shots.

TECHNICAL: Sharp focus on the book, slight natural vignette. Clean bright image. No text overlays. 2:3 portrait format.

${BOOK_FORMAT_DIRECTIVE}`;

  const imageUrl = await generateImage(prompt, [frontCoverRef], "2:3");
  return { imageUrl, prompt };
}

// Boyama flat-lay: show book + TWO interior sample pages (one colored, one still line-art) + crayons.
async function generateBoyamaFlatLay(concept, frontCoverRef) {
  const prompt = `Top-down flat-lay product photograph of a thin soft-cover A4 children's COLORING BOOK "${concept.baslik}".

LAYOUT: Bird's-eye view (directly from above). The closed book is on the LEFT. To the RIGHT of the book, TWO SINGLE SAMPLE PAGES are laid out flat (as if torn out or printed separately): one is a FULLY COLORED example (vibrant hand-colored feel — filled in with crayon texture), the other is the SAME page but uncolored (pure black-and-white line art, waiting to be colored). The two pages should sit next to each other so the customer sees the "before and after".

THE BOOK: THIN FLEXIBLE A4 PAPERBACK, magazine-style, saddle-stitched. NOT hardcover. Front cover MUST reproduce the reference image artwork EXACTLY: same title "${concept.baslik}", same character illustration, same colors, same typography. If you draw a different cover, image is WRONG.

SAMPLE PAGES (key visual proof of contents):
- PAGE A (colored): a printed page showing a simple coloring-book scene from the theme "${concept.baslik}" — the same scene as Page B, but fully hand-colored with warm crayon-style fills, some imperfect strokes, visible paper texture. Should look like a real child's coloring work.
- PAGE B (line-art): identical scene but PURE BLACK INK LINE-ART on white paper, no fills at all, generous coloring areas, child-friendly thick outlines.
- The two pages should be visually identical in composition (same subject, same layout) — only the coloring state differs.

PROPS AROUND THE SCENE (arranged aesthetically):
- A fan spread of colored crayons (8-12 count, warm bright colors)
- A tin of colored pencils, partially open
- A few felt-tip markers with caps off
- A small wooden ruler or color wheel card (optional)
- 1-2 tiny star-shaped stickers or washi tape squares
- A soft warm-toned plush or wooden toy (small, on the edge)

SURFACE: Clean warm cream linen tablecloth OR light wooden tabletop. Natural texture visible.

LIGHTING: Bright soft natural daylight from above-left. Gentle shadows around the book and pages. Clean and airy.

STYLE: Instagram-worthy product flat-lay, premium kids' craft magazine aesthetic. Warm, inviting, playful. The TWO sample pages are the stars — they scream "this is what you get inside, and here's how it comes to life".

TECHNICAL: Sharp focus on the book and the two pages. Slight natural vignette. 2:3 portrait format. Turkish diacritics on the cover must be PERFECT.`;

  const imageUrl = await generateImage(prompt, [frontCoverRef], "2:3");
  return { imageUrl, prompt };
}

/**
 * Open book interior — showing illustrated pages inside
 */
async function generateOpenBook(concept, frontCoverRef, category) {
  if (category && category.group === "boyama") {
    return generateBoyamaOpenBook(concept, frontCoverRef);
  }
  if (category && category.id === "meslek-hikayeleri") {
    return generateMeslekOpenBook(concept, frontCoverRef);
  }
  const { baslik, kahraman, sahneler } = concept;
  const scene = sahneler[1] || sahneler[0] || "magical adventure scene";

  const prompt = `Product photograph of the children's storybook "${baslik}" lying OPEN, showing an interior illustrated spread.

THE OPEN BOOK: A4 THIN FLEXIBLE PAPERBACK (magazine-style, NOT hardcover) opened to a middle page. Visible thin flexible paper — no rigid spine, no hardback. Two illustrated pages visible side by side. Character art style must match the reference cover image.

LEFT PAGE: A vivid 3D Pixar-style illustration showing the character ${kahraman.isim} in "${scene}". The character matches the cover art from the reference image. Colorful, detailed, magical scene.

RIGHT PAGE: SHORT and SIMPLE Turkish story text — MAX 2 short paragraphs (3-4 sentences TOTAL). Child-friendly vocabulary, LARGE readable font size, plenty of white space. The child's name "${kahraman.isim}" appears 1-2 times in bold. Think picture book — minimal text, easy to read. NOT a wall of text, NOT a novel. Warm cream paper texture, clean children's book typography.

SETTING: The book lies on a clean warm surface (light wood desk or cream blanket). Slightly angled to show page depth. A child's hand gently touching the bottom corner of a page (as if turning it).

LIGHTING: Warm soft natural light. Pages well-lit and readable. Slight page shadow at the spine.

STYLE: Professional book interior preview photograph. Shows the customer exactly what the inside looks like. Premium quality printing visible. Clean, bright, inviting.

TECHNICAL: Sharp focus on the book pages. Background softly blurred. 2:3 portrait format.`;

  const imageUrl = await generateImage(prompt, [frontCoverRef], "2:3");
  return { imageUrl, prompt };
}

// Boyama open-book: show OPEN book, one page fully line-art waiting, other page partially colored by a child.
async function generateBoyamaOpenBook(concept, frontCoverRef) {
  const sceneHint = concept.sahneler[0] || "a friendly themed subject";
  const prompt = `Product photograph of the children's COLORING BOOK "${concept.baslik}" lying OPEN on a warm surface, showing an interior B/W coloring spread in progress.

THE OPEN BOOK: A4 THIN FLEXIBLE PAPERBACK (magazine-style, NOT hardcover, no rigid spine). Open to a middle-spread. Two facing pages visible.

LEFT PAGE: a fully PURE BLACK LINE-ART COLORING PAGE — clean thick outlines, generous white coloring areas, child-friendly. Subject: ${sceneHint}. NO color on this page — completely uncolored, waiting.

RIGHT PAGE: the SAME composition but PARTIALLY colored — a child has started coloring in crayon/pencil: some areas vibrantly filled in (maybe the sky, one character's clothes, a leaf), other areas still empty line-art. The coloring strokes should look authentic — slightly imperfect crayon textures, a few stray marks, warm colors. This visualizes "the child is mid-process".

Above the open spread (just slightly visible at top of frame): the child's hand holding a single crayon, mid-stroke, as if still coloring. Small scatter of crayons beside the book (3-5 of them).

SETTING: Warm wooden table or cream linen surface. Soft natural daylight from the side. Slight angle showing the open page depth and saddle-stitched binding (no hardcover spine).

STYLE: Premium book-interior preview photo. Customer sees exactly what a page inside looks like, and what it becomes when colored. Clean, warm, inviting — Papier-style aesthetic.

TECHNICAL: Sharp focus on the two pages. Background softly blurred. 2:3 portrait format.`;

  const imageUrl = await generateImage(prompt, [frontCoverRef], "2:3");
  return { imageUrl, prompt };
}

/**
 * Gift box presentation — book emerging from MasalSensin gift box
 */
async function generateGiftBox(concept, frontCoverRef) {
  const prompt = `Beautiful gift presentation photograph of the children's storybook "${concept.baslik}" in a premium gift box.

THE GIFT BOX: A beautiful cream/white magnetic closure gift box with a warm orange ribbon/bow. The box is OPEN, lid tilted back, revealing the book inside nestled in cream tissue paper. The book MUST be a THIN FLEXIBLE PAPERBACK (magazine-style, NOT hardcover) with the cover reproducing the reference image EXACTLY — same title "${concept.baslik}", same artwork, same colors. Not a generic storybook.

DETAILS:
- Tissue paper: soft cream, slightly crinkled naturally
- A small "MasalSensin" branded card or tag attached to the ribbon
- Small dried flower sprig or a tiny sparkle star tucked beside the book
- The book peeks out invitingly — "unwrap me" feeling

SETTING: Clean warm surface (marble, light wood, or cream linen). Soft natural window light from the side. Warm golden tones.

MOOD: "The perfect gift." Premium, thoughtful, special. This photo should make someone think "I want to give THIS to someone I love." Gift-giving joy.

STYLE: Luxury gift brand photography (think Jo Malone, Mejuri unboxing). Clean, warm, premium. Instagram-worthy unboxing moment.

TECHNICAL: Sharp focus on box + book, background softly blurred. Warm color grading. 2:3 portrait format.`;

  const imageUrl = await generateImage(prompt, [frontCoverRef], "2:3");
  return { imageUrl, prompt };
}

/**
 * Spec labels page — the book centered with 4 premium trust badges around it.
 */
async function generateSpecLabels(concept, frontCoverRef) {
  const prompt = `MODERN PRODUCT SPEC COMPOSITION — 2:3 portrait format.

Place the personalized children's book "${concept.baslik}" SMALL in the CENTER (~22-26% frame width, front cover matching the reference image exactly, thin flexible paperback, FLAT cover no perspective distortion). Around the book, 4 modern flat trust cards are arranged in a 2x2 grid — two stacked on the left of the book, two stacked on the right (balanced).

Above the book add small title "Her Kitabımızda" in deep navy (#3F4F8A) geometric sans (medium weight). Book is SUPPORTING the cards — cards are the heroes.

═══ DİL KURALI (MUTLAK) ═══
Kartların ÜZERİNDEKİ HER KELİME TÜRKÇE olmalı. HİÇBİR İngilizce kelime olmamalı — "PAGES", "PAPER", "SPECIAL", "GIFT", "QUALITY" gibi kelimeler YASAK. Sadece verilen Türkçe metinleri birebir yaz. Türkçe diacritic'ler (Ü, Ş, İ, Ç, Ğ, Ö) MUTLAKA doğru yazılmalı.

═══ 4 KART TASARIMI (modern, premium, zengin) ═══

Her kart ~30% frame genişliği, yumuşak yuvarlak köşe (20-24px), 2x2 grid düzeni, aralarında bolca boşluk (~6-8% frame).

TASARIM SİSTEMİ:
- Her kartın üst yarısında BÜYÜK dairesel ikon kutucuğu (kartın içinde merkez-üst, çap ~40% kart yüksekliği), arka rengi kart ana renginden farklı kontrast renk, ikon beyaz ya da kart rengi
- Kartın alt yarısında: büyük rakam veya anahtar kelime (çok bold, 1-2 satır) + altında açıklama satırı
- Tipografi: modern premium sans-serif (Inter, DM Sans, Nunito Bold). Rakam/anahtar kelime: 900 weight. Açıklama: 500 weight.
- Hafif gradient backgrounds (düz tek renk değil), soft shadow (8-16px blur, 6% opacity), iç spacing bol

KART 1 (üst-sol):
- Ana renk: pastel lavanta-mavi (#E8ECFA)
- İkon kutusu: koyu lacivert (#3F4F8A), içinde beyaz minimal kitap ikonu
- Büyük metin: "24-32" (çok iri, lacivert)
- Altında: "SAYFA" (büyük harf, küçük, lacivert)
- En altında tek satır: "her kitap özenle hazırlanır"

KART 2 (üst-sağ):
- Ana renk: pastel şeftali-krem (#FAEBE0)
- İkon kutusu: sıcak turuncu (#F4A261), içinde beyaz minimal kağıt/sayfa ikonu
- Büyük metin: "170 gr"
- Altında: "KUŞE KAĞIT"
- En altında tek satır: "premium baskı kalitesi"

KART 3 (alt-sol):
- Ana renk: pastel teal-krem (#E4F1EC)
- İkon kutusu: koyu teal (#3F7A6C), içinde beyaz minimal kıvılcım/yıldız ikonu
- Büyük metin: "KİŞİYE ÖZEL"
- Altında: "%100"
- En altında tek satır: "çocuğunun adıyla yazılır"

KART 4 (alt-sağ):
- Ana renk: pastel gül (#F7E4E4)
- İkon kutusu: sıcak terracota (#C46A5B), içinde beyaz minimal hediye kutusu ikonu
- Büyük metin: "HEDİYE"
- Altında: "KUTULU"
- En altında tek satır: "şık ambalajla teslim"

Tüm kart metinleri yukarıda verilen Türkçe metinlerle birebir eşleşmeli. Hiç ek İngilizce kelime eklenmemeli.

═══ BACKGROUND ═══
- Warm cream / soft linen gradient (#FDF8F0 → #F5EFE6)
- Very subtle paper texture
- Optional small decorative elements in the far corners (faded star, tiny dotted trail)
- Clean and spacious — the book and badges are the heroes

═══ LIGHTING ═══
- Bright soft natural daylight from the upper-left
- Gentle warm shadows
- No harsh highlights, no gloss — matte premium feel

═══ COMPOSITION RULES ═══
- 2:3 portrait
- Book in center, SMALL (~22-26% frame width) — just a supporting anchor, NOT the hero
- 4 cards flank the book, 2 on each side, each ~30% frame width
- Cards are larger than the book
- No watermark, no website URL, no English words

CATALOG-READY spec visual — clean modern editorial look.`;

  const imageUrl = await generateImage(prompt, [frontCoverRef], "2:3");
  return { imageUrl, prompt };
}

// Kept for backwards compat (not wired in orchestrator — uses generateSpecLabels now)
async function generatePrintQuality(concept, frontCoverRef) {
  const prompt = `PREMIUM MACRO CLOSE-UP PRODUCT PHOTOGRAPH — 2:3 portrait format.

SUBJECT: a close-up detail shot of the interior of the personalized children's book "${concept.baslik}" — showing the PAPER quality and PRINT quality.

═══ COMPOSITION ═══
- Macro / close-up framing: only a small portion of an open book page fills the frame
- A thumb or index finger at the edge of the page, gently pinching or turning the page corner — this reveals the PAPER THICKNESS (~170gr kuşe / coated art paper)
- Visible layers: the front page in sharp focus (you can see the paper edge, its slight sheen, vivid ink), another page slightly behind showing continued illustration
- Slight top-down camera angle, shallow depth of field

═══ THE PAPER ═══
- THICK premium matte-coated kuşe art paper (~170gr / 170gsm)
- Slight natural sheen at grazing light — NOT glossy/shiny, NOT plain copy paper, clearly a PREMIUM coated card-stock used in quality children's books
- The paper edge is visibly thicker than regular printer paper but still flexible (magazine-style softcover, not cardboard)
- Texture: smooth to the touch, no visible fibers, high-end print feel

═══ THE PRINT ═══
- Vivid, saturated colors from a Pixar-style illustration (matching the cover reference character style)
- Ink sits richly on the paper — blacks are deep, colors are punchy but not over-saturated
- Sharp crisp detail at macro range — you can see the fine line quality
- NO pixelation, NO banding, NO muddy color

═══ LIGHTING ═══
- Warm natural diffused light from the upper-left
- Gentle highlight on the paper's top edge to accentuate thickness
- Soft shadow underneath (depth), no harsh flash
- Warm color grading — cozy, inviting, premium

═══ TEXT OVERLAY (ONE small stylish label, top-right or bottom-right corner) ═══
"170 gr Kuşe Kağıt · Canlı Renkler"
Style: clean elegant modern sans-serif, warm brown (#5D4037), small size (~2% of frame), subtle drop shadow, NOT dominating the image. This is a spec label, not a big banner.

═══ ABSOLUTE RULES ═══
- 2:3 portrait format
- Macro close-up — NOT a wide product shot, NOT the full book, NOT a flat-lay
- The PAPER and PRINT are the hero — not the character
- A real human finger/thumb visible at page edge (for scale + tactile feel)
- Warm premium product photography (iPhone 15 Pro portrait mode feel)
- Perfect Turkish diacritics on the label (ş, ğ)
- NO watermarks, NO logos, NO brand names beyond the small spec label`;

  const imageUrl = await generateImage(prompt, [frontCoverRef], "2:3");
  return { imageUrl, prompt };
}

// ───────────────────────────── Personal note page ─────────────────────────────

// hitap is a function of (name, childGender) — "Oğlum" (boy) vs "Kızım" (girl) for parents.
// For others we use gender-neutral "Canım torunum" / "Canım yeğenim" etc.
const SENDER_POOL = [
  { key: "anne+baba", hitap: (n) => `Canım ${n}`,                                  signoff: "Seni çok seven,\nAnnen ve Baban ❤️" },
  { key: "anne",      hitap: (n) => `Canım ${n}`,                                  signoff: "Seni çok seven,\nAnnen ❤️" },
  { key: "baba",      hitap: (n, g) => `${g === "kız" ? "Kızım" : "Oğlum"} ${n}`,   signoff: "Seninle gurur duyan,\nBaban ❤️" },
  { key: "anneanne",  hitap: (n) => `Canım torunum ${n}`,                          signoff: "Seni çok seven,\nAnneannen ❤️" },
  { key: "babaanne",  hitap: (n) => `Canım torunum ${n}`,                          signoff: "Seni çok seven,\nBabaannen ❤️" },
  { key: "dede",      hitap: (n) => `Canım torunum ${n}`,                          signoff: "Seni çok seven,\nDeden ❤️" },
  { key: "teyze",     hitap: (n) => `Canım yeğenim ${n}`,                          signoff: "Seni çok seven,\nTeyzen ❤️" },
  { key: "hala",      hitap: (n) => `Canım yeğenim ${n}`,                          signoff: "Seni çok seven,\nHalan ❤️" },
  { key: "dayi",      hitap: (n) => `Canım yeğenim ${n}`,                          signoff: "Seni çok seven,\nDayın ❤️" },
  { key: "amca",      hitap: (n) => `Canım yeğenim ${n}`,                          signoff: "Seni çok seven,\nAmcan ❤️" },
];

// Map Turkish relation labels (customer-provided) → SENDER_POOL keys.
const RELATION_TO_KEY = {
  "anne": "anne", "annem": "anne", "annesi": "anne",
  "baba": "baba", "babam": "baba", "babası": "baba",
  "anneanne": "anneanne", "anneannem": "anneanne",
  "babaanne": "babaanne", "babaannem": "babaanne",
  "dede": "dede", "dedem": "dede", "büyükbaba": "dede",
  "teyze": "teyze", "teyzem": "teyze",
  "hala": "hala", "halam": "hala",
  "dayı": "dayi", "dayi": "dayi", "dayım": "dayi", "dayim": "dayi",
  "amca": "amca", "amcam": "amca",
};

// Pick sender deterministically from customer-provided concept.gonderen info.
// Falls back to random ONLY if no information at all.
function pickSender(concept) {
  const g = concept?.gonderen || {};
  const rel = (g.iliski || "").toLowerCase().trim();
  const cins = (g.cinsiyet || "").toLowerCase();

  // 1) Explicit relation mapping
  if (rel && RELATION_TO_KEY[rel]) {
    const key = RELATION_TO_KEY[rel];
    const entry = SENDER_POOL.find((s) => s.key === key);
    if (entry) return entry;
  }

  // 2) Gender fallback: kadin → anne, erkek → baba (if sender name suggests parent)
  if (cins === "kadin" || cins === "kadın") {
    return SENDER_POOL.find((s) => s.key === "anne");
  }
  if (cins === "erkek") {
    return SENDER_POOL.find((s) => s.key === "baba");
  }

  // 3) Final fallback: generic "anne+baba" (non-gendered, always safe)
  return SENDER_POOL.find((s) => s.key === "anne+baba");
}

async function generateNoteBody(concept, senderKey) {
  const senderHuman = {
    "anne+baba": "anne ve baba",
    anne: "anne",
    baba: "baba",
    anneanne: "anneanne",
    babaanne: "babaanne",
    dede: "dede",
    teyze: "teyze",
    hala: "hala",
    dayi: "dayı",
    amca: "amca",
  };
  const persona = senderHuman[senderKey] || "aile büyüğü";
  const prompt = `${concept.kahraman.isim} adında ${concept.kahraman.yas} yaşında bir Türk çocuğu için kişiye özel bir kitap yazdık. Kitap "${concept.baslik}" — temasi: ${concept.mood}. Özet: ${concept.ozet}. Kazanımları: ${concept.kazanimlar.slice(0, 3).join(", ")}.

GÖREV: Bu kitabın ilk sayfasına eklenecek bir not yaz. Notu YAZAN kişi ${persona} olacak. Çocuğa ${persona === "anne ve baba" ? "ikisinden" : "kendisinden"} duygusal, sıcak, samimi bir mektup gibi olmalı.

KURAL:
- 3-4 kısa paragraf, toplam 4-7 cümle
- Çocuğun adı (${concept.kahraman.isim}) en az 1 kez geçsin
- Hikayenin temasına HAFIF bir gönderme olsun (örnek: kitap macera ise "her macerada yanındayız", uyku ise "her gece rüyalarında" gibi)
- Aşırı klişe değil, gerçek bir aile büyüğünün el yazısıyla yazdığı doğal bir not havası
- Türkçe karakterler MUTLAKA doğru: ş ç ğ ü ö ı İ
- Klişe başlangıçlar yasak ("Canım kızım..." gibi başlama, doğrudan duyguyla başla)
- "Bu kitap özel..." gibi giriş cümlesi kullan ama mutlaka yeniden yorumla, kopyala-yapıştır gibi olmasın
- ÇIKTI: SADECE not metni (hitap ve imza zaten ayrı, onları yazma)`;

  const text = await generateText(prompt);
  return text.trim().slice(0, 800);
}

// Boyama: "Tamamlandı Sertifikası" — replaces the personalized handwritten note for coloring books.
async function generateBoyamaCertificatePage(concept) {
  const name = concept.kahraman.isim;
  const prompt = `CHILDREN'S COLORING BOOK "TAMAMLANDI SERTİFİKASI" — 2:3 portrait format, FLAT FULL PAGE — the page IS the stationery paper, filling the entire frame edge to edge. No table, no background surface.

THE PAGE: Premium cream/ivory certificate paper with warm subtle texture and an ornate border frame. Slightly aged corners, gentle vintage feel. Paper fills the ENTIRE frame.

TOP (decorative header):
- Large hand-lettered Turkish title: "TAMAMLANDI" — thick bold serif display font, warm chocolate brown (#3E2723), with a small golden laurel wreath on each side
- Below it, in smaller warm italic script: "Bir boyama kitabı daha hayat buldu"

ORNATE BORDER:
- All four edges have a hand-drawn decorative frame: small crayons, tiny paintbrushes, dotted lines, little stars in warm orange/peach/gold. Think "end-of-year school certificate" meets "craft journal sticker border".
- Corners have small ornamental flourishes (little rosettes)

CENTER CONTENT (displayed in elegant Turkish text):

Line 1 (centered, warm brown serif): "Bu boyama kitabını renklendiren harika sanatçı:"

Line 2 — BIG hand-lettered child name, calligraphic display script, warm orange (#D17A2C), with a subtle golden underline flourish: "${name}"

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
- Child name "${name}": large calligraphic warm-orange script with hand-drawn underline flourish — the HERO of the page
- Body lines: elegant readable serif in warm brown, natural spacing, each line comfortably breathing
- Turkish diacritics (ş ç ğ ü ö ı İ) PERFECT — every dot and cedilla exact

CRITICAL:
- FLAT full bleed — paper IS the page, no table, no 3D perspective, no curl, no bent corners, no warp
- Feels PREMIUM and PROUD — like a certificate a child will frame on their wall
- Warm, celebratory, heartfelt — NOT childish or cartoonish
- Only ONE of each text block; do NOT duplicate

ART STYLE: Premium vintage certificate aesthetic with children's craft-journal warmth. Authentic hand-lettering feeling. No AI-cold perfection — small imperfections welcomed for warmth.`;

  const imageUrl = await generateImage(prompt, [], "2:3");
  return { imageUrl, prompt };
}

async function generateNotePage(concept, category) {
  if (category && category.group === "boyama") {
    return generateBoyamaCertificatePage(concept);
  }
  // Meslek KEEPS the generic personalized note (family letter with profession flavor).
  // Diploma page is a SEPARATE stage (generateMeslekDiplomaPage).
  const { kahraman } = concept;
  const name = kahraman.isim;
  const sender = pickSender(concept);
  const hitap = sender.hitap(name, kahraman.cinsiyet);

  let body;
  try {
    body = await generateNoteBody(concept, sender.key);
  } catch (e) {
    // Fallback to safe static body if AI fails
    body = `Bu kitap senin için özel olarak hazırlandı. Çünkü dünyada senden daha özel bir çocuk yok.\n\nTıpkı bu hikâyedeki gibi, sen de her gün biraz daha büyüyorsun. Bazen zorlanırsın — ama biz her zaman yanındayız.\n\nSenin gözlerindeki ışığı görmek bizim için en güzel şey.`;
  }
  const signoff = sender.signoff;

  const prompt = `CHILDREN'S STORYBOOK PERSONAL NOTE PAGE — 2:3 portrait format. FLAT FULL PAGE — the page IS the stationery paper, filling the entire frame edge to edge. No table, no background surface.

THE PAGE: Beautiful aged cream/ivory vintage stationery paper with warm subtle texture. Slightly yellowed corners, gentle aged feel. The paper fills the ENTIRE frame.

TOP: An ornate wax seal with a heart in the center, warm burgundy color, positioned top-center. Below it a delicate decorative line.

LETTER TEXT — written in GENUINE HANDWRITTEN dark brown ink:
"""
${hitap},

${body}

${signoff}
"""

LANGUAGE: ALL text MUST be in TURKISH. Do NOT translate to English. Write EXACTLY as provided above.

TYPOGRAPHY:
1. "${hitap}" — large flowing elegant cursive at top, dark brown ink, personal and warm
2. The child name "${name}" — bolder with more ink pressure wherever it appears
3. Body — genuine warm handwriting, dark brown (#3E2723), natural organic flow, slightly uneven baselines, generous 1.8x line spacing
4. Signature — larger stylized calligraphic handwriting with small hand-drawn heart
5. Turkish characters (ş ç ğ ü ö ı İ) MUST be PERFECT

DECORATIVE DETAILS ON THE PAPER:
- Top center: wax seal with heart (burgundy)
- Top right corner: a tiny hand-painted watercolor star
- Bottom left: a small watercolor golden star
- Bottom right: a beautiful vintage fountain pen lying diagonally with a tiny ink drop
- Very subtle delicate pencil-sketch vine decorations along left margin

CRITICAL:
- FLAT full bleed — paper IS the page, no table, no 3D perspective
- The handwriting must feel REAL and WARM
- ALL TEXT IN TURKISH — do NOT translate

ART STYLE: Photorealistic vintage stationery, genuine handwritten letter aesthetic. Warm, intimate, personal.`;

  const imageUrl = await generateImage(prompt, [], "2:3");
  return { imageUrl, prompt };
}

/**
 * Story flow — 4-panel storyboard showing the book's plot progression
 */
async function generateStoryboard(concept, frontCoverRef) {
  const { baslik, kahraman, sahneler } = concept;
  const panels = [
    sahneler[0] || "the beginning of the adventure",
    sahneler[1] || sahneler[0] || "discovering the challenge",
    sahneler[2] || sahneler[1] || "the key moment",
    sahneler[3] || sahneler[sahneler.length - 1] || "the happy ending",
  ];

  const prompt = `Premium 4-panel STORY FLOW key-art for the personalized children's book "${baslik}" — 2:3 portrait, single unified composition.

LAYOUT: A 2×2 grid of 4 cinematic Pixar-style mini scenes showing the story's progression from beginning to end. Each panel ~48% × 48% of the frame, separated by clean warm-cream gutters (~3% thick).

CHARACTER CONSISTENCY (CRITICAL): In ALL 4 panels, the same child ${kahraman.isim} appears — identical face, hair, clothing, and age across panels, matching the reference cover image EXACTLY (same Pixar-style stylization). If the character looks different between panels, image is WRONG.

═══ 4 PANELS (in reading order: top-left → top-right → bottom-left → bottom-right) ═══

PANEL 1 — "Başlangıç" (top-left): ${panels[0]}
  Mood: curious/wonder. Soft morning light.

PANEL 2 — "Keşif" (top-right): ${panels[1]}
  Mood: discovery/excitement. Warm golden light.

PANEL 3 — "Dönüm Noktası" (bottom-left): ${panels[2]}
  Mood: tension/bravery. Dramatic rim lighting.

PANEL 4 — "Mutlu Son" (bottom-right): ${panels[3]}
  Mood: joy/triumph. Golden-hour warm glow.

═══ PANEL LABELS ═══
Each panel has a SMALL eyebrow label in the top-left corner of the panel:
- Panel 1: "1 • BAŞLANGIÇ"
- Panel 2: "2 • KEŞİF"
- Panel 3: "3 • DÖNÜM NOKTASI"
- Panel 4: "4 • MUTLU SON"
Style: small caps, wide tracking, warm cream on a subtle dark pill badge, ~9-11pt, humanist sans (Inter/DM Sans).

═══ HEADER (top of the full image, above the grid) ═══
Turkish text: "Hikayenin Akışı"
Style: medium editorial serif (Fraunces/Recoleta feel), warm brown (#3F2A1A), centered, ~24pt.

═══ FOOTER (bottom of the full image, below the grid) ═══
Small center text: "${baslik}" in italic warm golden-orange (#D17A2C), humble accent.

═══ STYLE ═══
- Cinematic Pixar/Disney CGI quality per panel
- Consistent warm color palette across all 4 panels: warm cream + soft navy + golden orange + dusty rose
- Each panel has subtle soft rounded corners (~12px)
- Overall background: warm cream #F5EFE6 with very subtle paper texture
- Turkish diacritics PERFECT: ş ğ ü ö ç ı İ

═══ ABSOLUTE RULES ═══
- 2:3 portrait format
- 4 distinct scenes, NOT repeated
- Same child face across all 4 panels
- Clean grid, clean labels, readable header
- No watermarks, no logos, no brand names`;

  const imageUrl = await generateImage(prompt, [frontCoverRef], "2:3");
  return { imageUrl, prompt };
}

/**
 * Front + Back cover together — showing both covers in elegant composition.
 */
async function generateCoverDuo(concept, frontCoverRef, backCoverRef) {
  const prompt = `Elegant product photograph showing BOTH the front cover AND back cover of the children's storybook "${concept.baslik}" as an OVERLAPPING STACK — front on the LEFT, back on the RIGHT.

BOOK FORMAT — MAGAZINE STYLE, FLAT AND STRAIGHT:
- Each book is a thin flexible A4 magazine-style paperback, saddle-stitched. FLAT cover, NO bending, NO curling, NO curving, NO wavy paper, NO warped pages. The books sit STRAIGHT and RIGID in the photo as if freshly printed.
- Definitely NOT hardcover, NOT thick spine, NO embossed title, NO rigid binding. If you draw a hardcover or bent book, image is WRONG.

LAYOUT — overlapping stack composition:
- FRONT COVER on the LEFT: the hero book. Standing straight upright, closest to camera, fully visible, razor-sharp, the title rendered EXACTLY ONCE on the cover (never duplicated). Covers the left 50-55% of the book area.
- BACK COVER on the RIGHT: positioned slightly BEHIND the front but SHIFTED RIGHT so that ~45-50% of the back cover is VISIBLE to the right of the front cover. Reproduce the back cover EXACTLY as it appears in the SECOND reference image — whatever header, layout, imagery, and text is in the reference image must be faithfully reproduced. Do NOT apply a generic back-cover template or substitute different text.
- The books OVERLAP at the left edge of the back cover — the front book covers the left ~50-55% of the back book. They are stacked close together, tilted at a subtle matching angle (5-10° toward camera) for depth.
- CRITICAL: front is on the LEFT, back is on the RIGHT. Back cover peeks out generously on the right (close to half visible) so the buyer can read its content.

Both book covers MUST match the reference images exactly — first reference = front (LEFT, dominant), second reference = back (RIGHT, ~half visible). Reproduce EACH cover's title/text/layout/imagery EXACTLY ONCE — never repeat, never duplicate, never substitute with a default template. Whatever text, header, or visual the back cover reference shows, render THAT exact thing on the back side of the right book.

SETTING: Clean warm cream surface with subtle linen/paper texture. A few tasteful decorative elements — sparkle confetti, a dried flower, tiny stars, soft fairy-light bokeh far in the background. Uncluttered.

LIGHTING: Bright warm natural light from the top-left. Both covers well-lit and readable. Soft natural shadows showing the books' flat thin profile.

STYLE: Premium editorial publishing product shot. Flat magazine look, not hand-held-notebook look.

TECHNICAL: Both covers sharp and legible. Turkish text perfect (diacritics intact). Each title appears ONLY ONCE on its cover. Warm color grading. 2:3 portrait format.

${BOOK_FORMAT_DIRECTIVE}`;

  const imageUrl = await generateImage(prompt, [frontCoverRef, backCoverRef], "2:3");
  return { imageUrl, prompt };
}

// ═══════════════════════════════════════════════════════════════════════════
// MESLEK VISUALS — flat-lay, open-book, diploma page
// ═══════════════════════════════════════════════════════════════════════════

async function generateMeslekFlatLay(concept, frontCoverRef) {
  const profile = detectMeslekProfile(concept);
  const meslekLabel = (profile && profile.labelTR) || "Meslek";
  const toolsEN = (profile && profile.toolsEN) || "profession tools";
  const uniformEN = (profile && profile.uniformEN) || "";

  const prompt = `Top-down flat-lay product photograph of a thin soft-cover A4 children's PERSONALIZED STORYBOOK "${concept.baslik}" — a book about becoming a ${meslekLabel}.

═══ PROFESSION IDENTITY (READ FIRST, CRITICAL) ═══
This book is specifically about becoming a ${meslekLabel}. EVERY prop, uniform element, and tool in this flat-lay must come from the ${meslekLabel} profession. Do NOT include props from any other profession — only items that a ${meslekLabel} would use in their actual work.

LAYOUT: Bird's-eye view (directly from above), the book lies FLAT in the center of the frame.

THE BOOK: THIN FLEXIBLE PAPERBACK — magazine-style, saddle-stitched. NOT hardcover, NO thick spine, NO embossed title. The front cover MUST reproduce the reference image artwork EXACTLY: same title "${concept.baslik}", same character in ${meslekLabel} uniform, same colors, same typography. If you draw a different cover, image is WRONG.

PROFESSION-SPECIFIC PROPS arranged aesthetically around the book (THIS IS THE KEY VISUAL — the props scream "${meslekLabel}"):
- Small KID-SIZED version of the ${meslekLabel.toLowerCase()} uniform neatly folded beside the book — the folded uniform matches: ${uniformEN.split(",").slice(0, 3).join(",")}
- Key profession tools scattered naturally: ${toolsEN}
- A small hand-written note card saying "Hayalinin kahramanı ol ✨"
- A small plush toy peeking in from one corner (bunny or bear, still warm & kid-friendly)
- A few tiny stars or sparkle accents
- A small framed photo of the child (optional, corner of frame, subtle)

IMPORTANT: the props must be RECOGNIZABLY from the ${meslekLabel} profession — not generic. Uniform hint: ${uniformEN.split(",")[0]}. A viewer glancing at the photo should INSTANTLY know "this book is about a ${meslekLabel}" — even without reading the title.

SURFACE: Clean warm cream/beige linen tablecloth OR light wooden table. Natural texture visible. NO clutter — each prop has intention.

LIGHTING: Bright soft natural daylight from above-left. Gentle shadows around each object. Clean and airy, editorial feel.

STYLE: Instagram-worthy product flat-lay, professional e-commerce photography. Warm, aspirational, premium — "every child's dream starter kit" vibe. Think Wonderbly / Lovevery-style product photography.

TECHNICAL: Sharp focus on the book, slight natural vignette around edges. Clean bright image. No text overlays (except the small note card). 2:3 portrait format. Turkish diacritics on the cover PERFECT.

${BOOK_FORMAT_DIRECTIVE}`;

  const imageUrl = await generateImage(prompt, [frontCoverRef], "2:3");
  return { imageUrl, prompt };
}

async function generateMeslekOpenBook(concept, frontCoverRef) {
  const profile = detectMeslekProfile(concept);
  const meslekLabel = (profile && profile.labelTR) || "Meslek";
  const uniformEN = (profile && profile.uniformEN) || concept.kahraman.kiyafet;
  const workplaceEN = (profile && profile.workplaceEN) || "the professional workplace";
  const iconicHint =
    (profile && profile.iconicSceneHints) ||
    concept.sahneler[1] ||
    concept.sahneler[0] ||
    "an iconic profession moment";
  const name = concept.kahraman.isim;

  const prompt = `Product photograph of the personalized children's storybook "${concept.baslik}" lying OPEN, showing an interior illustrated spread. This is a book about ${name} being a ${meslekLabel}.

═══ PROFESSION IDENTITY (READ FIRST, CRITICAL) ═══
The character on the left interior page MUST be in ${meslekLabel} context — uniform, tools, workplace all from ${meslekLabel}. Do NOT render football, medicine, space, dance, or any other profession unless the profession IS ${meslekLabel}.

THE OPEN BOOK: A4 THIN FLEXIBLE PAPERBACK (magazine-style, NOT hardcover) opened to a mid-book page. Visible thin flexible paper — no rigid spine, no hardback. Two illustrated pages visible side by side. Character art style matches the reference cover image.

LEFT PAGE: A vivid 3D Pixar-style illustration showing ${name} IN THE ${meslekLabel.toUpperCase()} UNIFORM performing an iconic profession moment. Uniform MUST match EXACTLY: ${uniformEN}. Setting: ${workplaceEN}. Draw inspiration from these signature moments: ${iconicHint}. Child's face matches cover reference. Confident, engaged pose mid-action. Warm cinematic lighting.

RIGHT PAGE: SHORT and SIMPLE Turkish story text — MAX 2 short paragraphs (3-4 sentences TOTAL). Child-friendly vocabulary, LARGE readable font, plenty of white space. The child's name "${name}" appears 1-2 times in bold. A narrative beat matching the illustration on the left — e.g., "${name}, ${meslekLabel.toLowerCase()} olmanın ne kadar güzel olduğunu öğreniyordu..." — but the exact text is AI-generated for THIS book. Warm cream paper texture, clean children's book typography.

SETTING (real-world of the flat-lay shot): The book lies on a clean warm surface (light wood desk or cream blanket). Slightly angled to show page depth. A child's hand gently touching the bottom corner of a page (as if turning it).

LIGHTING: Warm soft natural light. Pages well-lit and readable. Slight page shadow at the spine.

STYLE: Professional book interior preview photograph. Shows the customer exactly what the inside looks like. Premium quality printing visible. Clean, bright, inviting.

CRITICAL:
- Uniform on the left-page character MUST match the profession (${uniformEN.split(",")[0]}...)
- Turkish diacritics in any printed text PERFECT
- NO generic children's book interior — this page is PROFESSION-SPECIFIC
- 2:3 portrait format`;

  const imageUrl = await generateImage(prompt, [frontCoverRef], "2:3");
  return { imageUrl, prompt };
}

/**
 * Meslek diploma page — official profession diploma/certificate.
 * Takes frontCoverRef so the small child illustration matches the cover character's face.
 */
async function generateMeslekDiplomaPage(concept, frontCoverRef) {
  const profile = detectMeslekProfile(concept);
  const name = concept.kahraman.isim;
  const meslekLabel = (profile && profile.labelTR) || "Meslek Kahramanı";
  const diplomaTitle =
    (profile && profile.diplomaTitle) || `${meslekLabel.toUpperCase()} DİPLOMASI`;
  const toolsEN = (profile && profile.toolsEN) || "";

  const prompt = `CHILDREN'S STORYBOOK OFFICIAL DIPLOMA PAGE — 2:3 portrait format, FLAT FULL PAGE, the page IS the parchment filling the entire frame edge to edge. No table, no 3D, no curl, no perspective.

═══ PROFESSION IDENTITY (READ FIRST, CRITICAL) ═══
This diploma is specifically for ${name} as a ${meslekLabel}. ONLY ${meslekLabel} context. Every symbol, emblem, color, illustration must come from ${meslekLabel}. Do NOT use symbols from football, medicine, space, dance, or any other profession unless this book IS that profession.

This is the closing emotional page of a personalized children's book about ${name} becoming a ${meslekLabel}. It is a REAL-looking diploma that a 5-9 year old child will proudly show to their family.

THE PAGE: Premium warm ivory/cream parchment with subtle aged texture and a rich ornate border frame. Slightly aged corners, gentle vintage feel. Paper fills the ENTIRE frame.

ORNATE BORDER (4 edges):
- Gold-foil ornamental frame with laurel wreaths, fine flourishes, and these specific ${meslekLabel} heraldic symbols at the corners: ${(profile && profile.diplomaSymbols) || "profession-matched emblems"}. Do NOT draw symbols of other professions.
- Corners: small ornamental rosettes
- Delicate gold-leaf pattern running along all 4 edges

TOP HEADER (large, centered):
"${diplomaTitle}" — in ornate calligraphic display serif, deep navy (#1A237E) with subtle gold shimmer. Letter-spaced, elegant, optically centered. Small laurel wreath under the heading.

CENTER CONTENT (displayed in elegant Turkish):

Line 1 (centered, warm brown serif italic): "İşbu belge ile"

Line 2 — BIG hand-lettered child name, calligraphic display script, rich gold (#C9A227), with a subtle gold underline flourish: "${name}"

Line 3 (centered, warm brown serif):
"adlı kahramanın ${meslekLabel.toLowerCase()} olarak resmi onayını ilan eder."

Line 4 — CENTER MEDALLION (circular emblem ~25% frame width): a beautifully illustrated profession emblem. The emblem contains the PROFESSION SYMBOLS arranged heraldically (using: ${toolsEN}). The emblem has a ribbon banner underneath reading: "HAYALİN GERÇEK OLDU"

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

CRITICAL:
- FLAT full bleed — parchment IS the page, no 3D, no curl, no warp, no perspective. If any corner bends, image is WRONG.
- Feels PREMIUM and OFFICIAL — like a real graduation diploma
- Small 3D Pixar illustration of ${name} bottom-right supports but does NOT compete with the diploma text
- Only ONE of each text block; no duplications
- The DIPLOMA is the hero — it should look like something a child would FRAME on their wall

ART STYLE: Premium vintage-meets-modern diploma aesthetic. Rich cream parchment, gold foil accents, heraldic profession symbols, elegant calligraphy. Warmth + authority. Think Hogwarts acceptance letter meets children's graduation ceremony.

═══ CHARACTER IDENTITY (FROM REFERENCE IMAGE — CRITICAL) ═══
The small 3D Pixar illustration of ${name} in the bottom-right corner MUST match the child character shown in the REFERENCE IMAGE (the front cover). Same face, same hair, same skin tone, same eyes, same recognizable features — only the profession uniform and pose differ. If the rendered child looks like a different kid, the image is WRONG.`;

  const refs = frontCoverRef ? [frontCoverRef] : [];
  const imageUrl = await generateImage(prompt, refs, "2:3");
  return { imageUrl, prompt };
}

module.exports = {
  generateFlatLay,
  generateOpenBook,
  generateGiftBox,
  generateSpecLabels,
  generatePrintQuality,
  generateNotePage,
  generateStoryboard,
  generateCoverDuo,
  generateMeslekDiplomaPage,
};
