/**
 * hookAgent.js — Node port of
 *   MasalSensinUrunStudio/src/services/hookAgent.ts
 *
 * 1:1 functional parity. No added features.
 *
 * Exports:
 *   - generateHookVisual(concept, realPhotoRef, frontCoverRef, category?)
 *   - generateTransformationVisual(concept, realPhotoRef, frontCoverRef, category?)
 *
 * Notes:
 *   - BOOK_FORMAT_DIRECTIVE is inlined here verbatim from the UrunStudio
 *     coverAgent.ts (coverAgent is NOT part of this port), keeping the exact
 *     text the original prompts relied on.
 */

const { generateImage } = require("./geminiClient");
const { getMeslekProfileFromTitle } = require("../rules/meslek-profiles");

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function detectMeslekProfile(concept) {
  return (
    getMeslekProfileFromTitle(concept.kahraman.kiyafet) ||
    getMeslekProfileFromTitle(concept.baslik)
  );
}

// Verbatim copy of UrunStudio's coverAgent.ts `BOOK_FORMAT_DIRECTIVE`.
const BOOK_FORMAT_DIRECTIVE = `═══ BOOK FORMAT — THIN MAGAZINE-STYLE PAPERBACK (CRITICAL) ═══
This product is a THIN FLEXIBLE MAGAZINE-STYLE PAPERBACK — think National Geographic Kids, a children's activity magazine, or a school workbook. It is NOT a hardcover book.
- THICKNESS: approximately 3-5mm total — very thin, like a magazine, NEVER like a novel or chapter book
- COVER: soft flexible paper, bendy, you could roll it up like a magazine. Cover paper is a single thin sheet of matte or soft-gloss cardstock — NOT a rigid cardboard board
- NO visible binding details: do NOT draw staples, do NOT draw stitches, do NOT draw glue lines. Just a clean, simple paper edge — the binding is not rendered.
- ABSOLUTELY NOT: hardcover, case-bound, leather, cloth, thick spine, embossed raised letters, gold-foil raised title, rigid board, chunky binding
- Physical reference the AI should imagine: a thin children's activity magazine or a National Geographic Kids issue — that flexibility and thinness
- If the rendered book looks thick, chunky, hardcover, or has a rigid spine with raised letters, the IMAGE IS WRONG and must be regenerated
- For flat-product shots: render as COMPLETELY FLAT single page (2:3 portrait), NO 3D mockup, NO page curl, NO bent corners, NO wavy paper, NO warp, NO perspective. The cover must sit STRAIGHT and RIGID as if scanned flat.`;

// Boyama-specific hook scenes — child ACTIVELY coloring the book, not reading/eating/sleeping.
const BOYAMA_HOOK_SURFACES = [
  "warm wooden kids' desk with a small potted plant and a small cup of colored pencils",
  "soft boho carpet on the floor, pillows scattered, crayons in a wicker tray",
  "cozy kitchen table with sunlight streaming in and a little ceramic mug nearby",
  "child-sized activity table in a playroom with a dotty rug and soft morning light",
];
const BOYAMA_HOOK_TOOLS = [
  "a fanned spread of colorful wax crayons and 2 felt-tip markers",
  "a tin of chunky colored pencils and a few scattered triangular crayons",
  "a jar of rainbow markers and a small watercolor pan set with a thick brush",
  "a handful of oversized soft pastels and a few regular crayons",
];

const BOYAMA_HOOK_SCENES = [
  {
    label: "Masada Boyarken",
    scene: (c) => {
      const surface = pick(BOYAMA_HOOK_SURFACES);
      const tools = pick(BOYAMA_HOOK_TOOLS);
      return `Beautiful warm iPhone portrait photo: the child (from reference photo — EXACT same child, same face, same gender) sitting on a ${surface}, deeply focused, ACTIVELY COLORING an open page of the THIN FLEXIBLE A4 magazine-style personalized coloring book "${c.baslik}". A colorful crayon is IN the child's hand mid-stroke on the page. The open book shows a partially-colored black-and-white line-art illustration on the visible page — the child has ALREADY colored some areas (sky, one character's clothes) and is working on another area now. ${tools} are spread around the book. The child's expression: joyful concentration, tongue slightly out, tiny proud smile — the "absorbed in creating" look. Soft warm daylight, instagram-worthy "mom snapped this without them noticing" candid.`;
    },
  },
  {
    label: "Yerde Boyarken",
    scene: (c) => {
      const tools = pick(BOYAMA_HOOK_TOOLS);
      return `Warm overhead-angle iPhone photo: the child (from reference photo — EXACT same child, same face, same gender) lying on their tummy on a cozy rug, legs kicking up behind them, ACTIVELY COLORING a page in the open THIN FLEXIBLE personalized coloring book "${c.baslik}". The child holds a bright crayon in one hand, pressing onto the paper. Around them: ${tools}, a few already-finished colored pages torn out and proudly displayed nearby. Natural window light, peaceful home atmosphere. The child's face is partly visible — concentrating, small smile, "I'm making art" pose. Authentic candid moment.`;
    },
  },
  {
    label: "Anneyle Boyuyor",
    scene: (c) => {
      const tools = pick(BOYAMA_HOOK_TOOLS);
      return `Warm family iPhone photo: the child (from reference photo — EXACT same child, same face, same gender) sitting beside their mother at a sunny kitchen or living-room table. The open THIN FLEXIBLE personalized coloring book "${c.baslik}" is on the table between them. Both are coloring the same page together — the child is pressing a crayon onto one area, the mother is helping with another area. ${tools} are shared between them. Both are smiling — warm intimate "we're doing something together" moment. Soft natural daylight, authentic connection, not posed.`;
    },
  },
];

// Randomized ambiance pools — each hook picks one from each pool so backgrounds VARY across generations
const BEDROOM_WALLS = ["soft cream wall", "dusty mint-green wall", "pale rose-pink wall", "lavender pastel wall", "warm beige wall with wainscoting", "muted sage-green wall", "light grey-blue wall"];
const BEDROOM_BEDDING = ["striped pastel duvet", "star-pattern blanket", "plain warm mustard throw", "geometric navy-cream quilt", "floral sprig pattern sheets", "chunky knit cream blanket"];
const BEDROOM_PLUSH = ["a teddy bear", "a plush bunny", "a fuzzy fox plush", "a small sloth plush", "a handmade rag doll", "a tiny lion plush"];
const BEDROOM_LIGHT = ["warm bedside lamp with amber shade", "string of warm fairy lights above the headboard", "small mushroom-shaped night lamp", "paper moon wall lamp glowing soft", "cluster of tiny star lights", "dim globe pendant casting golden pool"];
const BEDROOM_EXTRA = ["a tiny wooden shelf with 3-4 books", "a framed illustration of a hot-air balloon on the wall", "a small potted plant on the nightstand", "a dreamcatcher hanging near the window", "a cozy rug with geometric pattern", "a canopy of soft tulle draped over the bed"];

const KITCHEN_STYLES = ["modern scandinavian white kitchen", "rustic wooden farmhouse kitchen", "cozy family corner with round breakfast table", "sunny cafe-style kitchen with pendant lights", "warm boho kitchen with hanging plants", "traditional Turkish home with patterned tiles"];
const KITCHEN_BREAKFAST = ["classic Turkish breakfast — cheese, tomato, olives, bread, milk", "fruit bowl with strawberries and pancakes", "simple toast with honey and fresh orange juice", "çilek, muz ve yoğurtlu müsli bowl", "scrambled egg, cheese cubes, and a glass of milk", "simit, peynir, and a warm çay glass"];
const KITCHEN_LIGHT = ["bright morning sun through a large window", "soft diffused light through sheer curtains", "golden backlight from behind the child", "overcast-soft daylight, even tones"];

const PARK_SETTINGS = ["a grassy picnic hill under a big oak tree", "wildflower meadow with soft breeze", "cherry-blossom garden path in spring", "lakeside bench with blue water behind", "sun-dappled forest clearing", "autumn park with golden leaves on the ground", "colorful playground with a plaid picnic blanket on the grass"];
const PARK_LIGHT = ["warm golden-hour side light", "bright mid-day dappled sunlight through leaves", "soft overcast glow", "sunset backlight with long shadows"];

const LIVINGROOM_SOFAS = ["cream linen couch with textured throw pillows", "warm terracotta velvet sofa", "sage-green sofa with boucle cushions", "navy blue couch with cream throw blanket", "beige corner sofa with Berber rug in front"];
const LIVINGROOM_STYLES = ["modern scandi living room with tall windows", "cozy boho living room with plants and macrame", "classic Turkish home with bookcase and rug", "minimalist warm-wood living room", "bright coastal living room with driftwood accents"];
const LIVINGROOM_LIGHT = ["soft afternoon golden light through sheer curtains", "warm side lamp glow + dim daylight", "bright mid-morning window light", "sunset orange tones flooding the room"];

const HOOK_SCENES = [
  {
    label: "Yemek Yerken",
    scene: (c) => {
      const style = pick(KITCHEN_STYLES);
      const breakfast = pick(KITCHEN_BREAKFAST);
      const light = pick(KITCHEN_LIGHT);
      return `Beautiful bright iPhone portrait photo: the child (from reference photo — EXACT same child, same face) sitting at a ${style}, ${light}. A THIN FLEXIBLE A4 magazine-style paperback (NOT hardcover, NOT thick spine — looks like a soft children's magazine, ~5mm thick maximum) — "${c.baslik}" — is propped open beside their plate. The book MUST look thin and bendy, like a magazine; if it appears as a thick hardcover or chunky bound book, the image is WRONG. Child is paused mid-bite, looking at the book with fascination. Breakfast scene: ${breakfast}. The child is wearing their everyday clothes (from reference). Book cover clearly visible. Instagram-worthy moment — "yemeği bile unutuyor!" Sweet, warm, bright.`;
    },
  },
  {
    label: "Uyurken Kitapla",
    scene: (c) => {
      const wall = pick(BEDROOM_WALLS);
      const bedding = pick(BEDROOM_BEDDING);
      const plush = pick(BEDROOM_PLUSH);
      const light = pick(BEDROOM_LIGHT);
      const extra = pick(BEDROOM_EXTRA);
      return `Warm tender iPhone photo: the child (from reference photo — EXACT same child) lying in a cozy bed, having fallen asleep while reading. Room has a ${wall}, ${bedding} on the bed. The THIN FLEXIBLE A4 magazine-style paperback (NOT hardcover, ~5mm thick max, soft bendy cover) "${c.baslik}" rests open on their chest, one small hand still touching a page. Lighting: ${light}. Child's face peaceful and angelic, small smile, relaxed. ${plush.charAt(0).toUpperCase() + plush.slice(1)} tucked beside them. Room detail: ${extra}. Soft warm tones, cozy intimate moment. A photo every parent wants to take of their child. Instagram-caption-worthy tender moment.`;
    },
  },
  {
    label: "Parkta Kitap Okuyor",
    scene: (c) => {
      const setting = pick(PARK_SETTINGS);
      const light = pick(PARK_LIGHT);
      return `Bright sunny iPhone photo: the child (from reference photo — EXACT same child) sitting cross-legged in ${setting}, ${light}. Deeply absorbed in reading the THIN FLEXIBLE A4 magazine-style paperback (NOT hardcover, ~5mm thick max, soft bendy cover) "${c.baslik}". Blue sky visible. The child is smiling down at an illustrated page, completely captivated. Book cover clearly visible. A natural candid moment of a child lost in their own story. Bright, joyful, Instagram-worthy.`;
    },
  },
  {
    label: "Anne Kucağında",
    scene: (c) => {
      const sofa = pick(LIVINGROOM_SOFAS);
      const style = pick(LIVINGROOM_STYLES);
      const light = pick(LIVINGROOM_LIGHT);
      return `Warm iPhone photo: the child (from reference photo — EXACT same child) sitting in their mother's lap on a ${sofa}, in a ${style}. Both looking at the open THIN FLEXIBLE A4 magazine-style paperback (NOT hardcover, ~5mm thick max, soft bendy cover) "${c.baslik}" together. Mother's hands gently holding the book open, child pointing at an illustration excitedly. Lighting: ${light}. Both smiling and engaged. Intimate family reading moment. Book cover visible from the angle. Warm, loving, authentic family moment.`;
    },
  },
];

// Meslek-specific hook scenes — child in dress-up profession uniform at home with the book nearby.
const MESLEK_HOOK_SCENES = [
  {
    label: "Mesleği Oynarken",
    scene: (c, profile) => {
      const meslek = (profile && profile.labelTR) || "meslek";
      const uniform = (profile && profile.uniformEN) || c.kahraman.kiyafet;
      const tools = (profile && profile.toolsEN) || "profession tools";
      return `Warm iPhone candid photo: the child (from reference photo — EXACT same child, same face) in their bedroom or playroom, wearing a small dress-up ${meslek.toLowerCase()} uniform (${uniform}), ACTING OUT the profession with toys/stuffed animals as "patients/teammates/customers". ${tools} in hand mid-action. The THIN FLEXIBLE personalized book "${c.baslik}" is open on the floor or table, open to an illustration showing the same scene the child is acting out — as if drawing inspiration from the book in real-time. Playful pretend-play energy, natural window light, authentic "my kid plays this all day" moment.`;
    },
  },
  {
    label: "Kitapla Hayal Kurarken",
    scene: (c, profile) => {
      const meslek = (profile && profile.labelTR) || "meslek";
      const meslekTools = (profile && profile.toolsEN) || "profession-specific props";
      return `Warm cozy iPhone photo: the child (from reference photo — EXACT same child) curled up in a reading nook or on the couch, holding the THIN FLEXIBLE personalized book "${c.baslik}" open, completely absorbed — eyes wide, dreaming. Next to them: a small ${meslek.toLowerCase()} costume laid out neatly (waiting to be worn), and 1-2 small ${meslek.toLowerCase()}-related physical props (chosen ONLY from this profession's tools: ${meslekTools}). Do NOT include props or costumes from other professions. Soft afternoon light, peaceful "mom spotted her in her own world" candid feeling. Book cover facing the camera clearly visible. The image captures the LINK between dreaming (book) and becoming (the props waiting).`;
    },
  },
];

/**
 * Generates ONE hook/kanca lifestyle photo — child naturally living with the book.
 * Uses the real-child reference photo for face consistency.
 *
 * @param {object} concept — BookConcept
 * @param {string} realPhotoRef — data URL of the real-child photo
 * @param {string} frontCoverRef — data URL of the rendered front cover
 * @param {object} [category] — { id, group, ... }
 * @returns {Promise<{ imageUrl: string, prompt: string, label: string }>}
 */
async function generateHookVisual(concept, realPhotoRef, frontCoverRef, category) {
  const isBoyama = category && category.group === "boyama";
  const isMeslek = category && category.id === "meslek-hikayeleri";
  const meslekProfile = isMeslek ? detectMeslekProfile(concept) : null;

  let hook;
  if (isBoyama) {
    hook = pick(BOYAMA_HOOK_SCENES);
  } else if (isMeslek) {
    const h = pick(MESLEK_HOOK_SCENES);
    hook = {
      label: h.label,
      scene: (c) => h.scene(c, meslekProfile),
    };
  } else {
    hook = pick(HOOK_SCENES);
  }

  const prompt = `${hook.scene(concept)}

PHOTO QUALITY:
- iPhone 15 Pro portrait mode — natural bokeh, face sharp
- Warm natural lighting — NOT dark, NOT gloomy
- Clean, bright, cheerful environment
- NO AI tells: no waxy skin, no merged fingers, no floating objects
- The child must look IDENTICAL to the FIRST reference photo — same face, same features, same gender

═══ BOOK COVER REPRODUCTION (CRITICAL) ═══
- The book in the child's hands MUST be EXACTLY the book from the SECOND reference image
- Reproduce the SECOND reference image's artwork AS-IS on the book cover: same title ("${concept.baslik}"), same character illustration, same colors, same layout, same typography
- This is NOT a generic children's book — this is THAT SPECIFIC book being held
- The child is holding OUR product, not a random storybook
- If you draw a generic fantasy cover or different title, the image is WRONG

${BOOK_FORMAT_DIRECTIVE}

- This should look like an Instagram-worthy family moment`;

  const imageUrl = await generateImage(prompt, [realPhotoRef, frontCoverRef], "3:4");
  return { imageUrl, prompt, label: hook.label };
}

/**
 * Generates the transformation visual: real photo → Pixar story character.
 * Split-screen marketing image.
 */
async function generateTransformationVisual(concept, realPhotoRef, frontCoverRef, category) {
  if (category && category.group === "boyama") {
    return generateBoyamaTransformationVisual(concept, realPhotoRef, frontCoverRef);
  }
  if (category && category.id === "meslek-hikayeleri") {
    return generateMeslekTransformationVisual(concept, realPhotoRef, frontCoverRef);
  }
  const prompt = `Cinematic Pixar-style "transformation" key-art for the personalized children's book "${concept.baslik}" — 2:3 portrait, premium product listing photo, single unified composition (NOT a hard split).

═══ COMPOSITION — magical seamless blend (NO HARD 50/50 SPLIT) ═══
- LEFT half: a small modern Instax-mini polaroid frame floating mid-air, holding the REAL child photo (from FIRST reference image — same child, same face, SAME CLOTHING). Polaroid slightly tilted ~6°, mild film grain, no handwritten text on the polaroid itself.
- CENTER: a magical horizontal stream of golden-orange sparkle dust + glowing micro-stars + soft light particles flowing from the polaroid TOWARD the right side, dissolving into the right character. This stream IS the visual transformation; no hard divider.
- RIGHT half: the SAME child reborn as a 3D Pixar/Ice-Age style storybook hero (matching the cover reference image style). CRITICAL: SAME CLOTHING colors and style as the real photo on the left, just Pixar-ified. Recognizable face: same hair, same eye color, same skin tone, same gender. The character has a soft warm GOLDEN HALO / rim-light around the silhouette as if magic energy is glowing on them. Confident hero pose, gentle smile, eye contact with viewer.

═══ BACKGROUND — cinematic atmosphere ═══
- An OPEN STORYBOOK lies horizontally at the bottom of the frame, slightly out of focus, pages glowing soft warm light from inside. The polaroid + sparkle stream + Pixar character all "rise from the book", as if the character is being born from the pages.
- Above and behind: a soft warm dusk-sky atmosphere — gentle navy-to-coral gradient, distant fairy-tale castle silhouette barely visible far in the background, a few faint stars and tiny floating paper birds.
- Soft subtle bokeh, light leaks, dreamy depth — Pixar key-art / movie poster level cinematography.
- Color palette: warm cream + soft navy + golden orange + dusty rose. Brand-aligned (#3F4F8A navy, #F4A261 orange, #F5EFE6 cream).

═══ LIGHTING ═══
- Warm golden-hour rim-light from upper-right
- Soft blue ambient fill from lower-left
- Polaroid catches a soft top-light
- Pixar character has a clear hero-rim around silhouette

═══ TYPOGRAPHY (rendered into the image) ═══
- Two SMALL eyebrow labels above each subject (do NOT make them billboards):
  - Above polaroid (left): "GERÇEK" — small caps, wide tracking, warm gray, clean humanist sans-serif (Inter/DM Sans), 9-11pt.
  - Above Pixar character (right): "KAHRAMAN" — same treatment, slightly highlighted in orange.
- ONE bottom headline, large, premium, EDITORIAL DISPLAY SERIF (Fraunces / Recoleta / Cormorant feel — warm rounded serif with personality, NOT cold Times, NOT geometric sans):
  "Her çocuk kendi hikayesinin **kahramanıdır**."
  - "Her çocuk kendi hikayesinin" in deep warm brown (#3F2A1A) regular serif weight
  - "kahramanıdır" in italic + warm golden-orange (#D17A2C), with a small subtle hand-drawn underline flourish beneath it
  - Sentence anchored centered at the bottom, balanced air above and below
- Turkish diacritics PERFECT: ş ğ ü ö ç ı İ — no missing dots, no substitutions, no duplicate letters.
- Headline appears EXACTLY ONCE in the image, no duplications.

═══ STYLE ═══
- Pixar movie key-art quality, "transformation moment" cinematography, premium editorial photography hybrid.
- Mood: magical, warm, aspirational — "your child becomes a story hero" feeling.
- This is THE marketing hero image for the product page; must look catalogue-ready, not amateur AI.

═══ ABSOLUTE RULES ═══
- 2:3 portrait format (DO NOT change).
- Single unified scene; NO hard vertical 50/50 line.
- Same child face on both sides.
- Same clothing colors on both sides (real on left, Pixar-ified on right).
- Headline rendered EXACTLY ONCE, perfect Turkish.
- No watermarks, no logos, no brand names, no product packshot.`;

  const imageUrl = await generateImage(prompt, [realPhotoRef, frontCoverRef], "2:3");
  return { imageUrl, prompt };
}

// Boyama version of the transformation: real photo → same child "living inside" a coloring-book page.
async function generateBoyamaTransformationVisual(concept, realPhotoRef, frontCoverRef) {
  const prompt = `Cinematic "transformation" key-art for the personalized children's COLORING BOOK "${concept.baslik}" — 2:3 portrait, premium product listing photo, single unified composition (NOT a hard split). The concept: "your child becomes the character inside their own coloring book — half line-art waiting for color, half vibrantly brought to life by their own crayons."

═══ COMPOSITION — magical seamless blend (NO HARD 50/50 SPLIT) ═══
- LEFT half: a small modern Instax-mini polaroid frame floating mid-air, holding the REAL child photo (from FIRST reference image — same child, same face, SAME CLOTHING). Polaroid slightly tilted ~6°, mild film grain, no handwritten text on the polaroid itself.
- CENTER: a stream of warm rainbow crayon strokes + paint splashes + glowing sparkle dust flowing from the polaroid TOWARD the right side. A few actual 3D-rendered crayons (tilted) fly along the stream like magic wands. This stream IS the visual transformation; no hard divider.
- RIGHT half: the SAME child, reborn as a character ON A BOYAMA KİTABI PAGE — the character illustration is HALF uncolored black-and-white line art (the child's head or one arm still B/W line-art, waiting for color), and the OTHER HALF is vibrantly colored with bold flat crayon-style colors (the rest of the body and face fully rendered in cheerful color — hair, eyes, clothes matching the real photo). This visualizes "your child IS this coloring page, being brought to life". Recognizable face: same hair, same eye color, same skin tone, same gender.
- The colored half should use a hand-colored crayon-texture feel (slightly imperfect, with tiny white spots where the crayon didn't fill completely) — NOT a smooth digital fill. Authentic "just colored by a kid" feeling.

═══ BACKGROUND — cinematic atmosphere ═══
- An OPEN COLORING BOOK PAGE lies horizontally at the bottom of the frame, showing thick black line-art patterns (forest / flowers / stars) on a cream page. A few colored crayons rest on the page. The polaroid + sparkle stream + half-colored character "rise" from the book.
- Above and behind: warm cream-to-peach gradient sky, soft paper texture, a few tiny floating paint splashes in pastel tones (blush, mint, butter yellow).
- Soft subtle bokeh, dreamy depth — premium key-art level.
- Color palette: warm cream + soft peach + golden orange + rainbow crayon accents.

═══ LIGHTING ═══
- Warm golden-hour rim-light from upper-right
- Soft butter-yellow ambient fill
- Polaroid catches a soft top-light
- The colored side of the character has slightly more saturated, glowing life

═══ TYPOGRAPHY (rendered into the image) ═══
- Two SMALL eyebrow labels above each subject:
  - Above polaroid (left): "GERÇEK" — small caps, wide tracking, warm gray, clean humanist sans-serif, 9-11pt.
  - Above colored character (right): "RENKLİ DÜNYAN" — same treatment, slightly highlighted in orange.
- ONE bottom headline, large, premium editorial display serif (Fraunces / Cormorant feel):
  "Her çocuk kendi sayfasına **rengini** katar."
  - "Her çocuk kendi sayfasına" in deep warm brown (#3F2A1A) regular serif weight
  - "rengini" in italic + warm golden-orange (#D17A2C), with a small subtle hand-drawn underline flourish
  - followed by "katar." in the same brown as before
  - Sentence anchored centered at the bottom
- Turkish diacritics PERFECT (ş ğ ü ö ç ı İ). Headline appears EXACTLY ONCE.

═══ STYLE ═══
- Premium coloring-book marketing key-art, "the page comes alive in your child's hands" feeling.
- Mood: joyful, magical, empowering — NOT the Pixar cinematic feel, more like a warm hand-crafted craft magazine spread.

═══ ABSOLUTE RULES ═══
- 2:3 portrait format (DO NOT change).
- Single unified scene; NO hard vertical 50/50 line.
- Same child face on both sides — the right character is a line-art-style illustration but clearly recognizable as the same child.
- The right character MUST be visibly half line-art + half colored — if fully colored OR fully B/W, the image is WRONG.
- Headline rendered EXACTLY ONCE, perfect Turkish.
- No watermarks, no logos, no brand names, no product packshot.`;

  const imageUrl = await generateImage(prompt, [realPhotoRef, frontCoverRef], "2:3");
  return { imageUrl, prompt };
}

// Meslek version — real child photo → same child reborn as the PROFESSIONAL, proudly holding the diploma.
async function generateMeslekTransformationVisual(concept, realPhotoRef, frontCoverRef) {
  const profile = detectMeslekProfile(concept);
  const meslekLabel = (profile && profile.labelTR) || "Meslek";
  const uniformEN = (profile && profile.uniformEN) || concept.kahraman.kiyafet;
  const toolsEN = (profile && profile.toolsEN) || "";
  const diplomaTitle = (profile && profile.diplomaTitle) || "KAHRAMAN SERTİFİKASI";

  const prompt = `Cinematic Pixar-style "dream-to-reality transformation" key-art for the personalized children's book "${concept.baslik}" — 2:3 portrait, premium product listing image, single unified composition (NOT a hard split).

═══ PROFESSION IDENTITY (READ FIRST, CRITICAL) ═══
This book is specifically about ${concept.kahraman.isim} as a ${meslekLabel}. ONLY ${meslekLabel} context on the right side. The right character must be a ${meslekLabel} — NOT a footballer, doctor, dancer, astronaut, chef, vet, or any other profession unless the profession IS ${meslekLabel}. Uniform, tools, diploma, and background must all be ${meslekLabel}.

CONCEPT: "the real child on the left grows into the ${meslekLabel} of their dreams on the right — the book is the bridge."

═══ COMPOSITION — seamless magical blend (NO HARD 50/50 SPLIT) ═══
- LEFT half: a small modern Instax-mini polaroid frame floating mid-air, holding the REAL child photo (from FIRST reference image — EXACT same child, same face, same clothing as in the photo). Polaroid slightly tilted ~6°, mild film grain, no text on the polaroid.
- CENTER: a magical horizontal stream of golden-orange sparkle dust + glowing micro-stars + ${(profile && profile.sparkleAccent) || "warm profession-matched particles"} flowing from the polaroid TOWARD the right side. This stream IS the visual transformation; no hard divider.
- RIGHT half: the SAME child, reborn as a 3D Pixar/Disney-style ${meslekLabel}. CRITICAL: wearing the profession uniform EXACTLY as specified: ${uniformEN}. Recognizable face: same hair color, same eye color, same skin tone, same gender as the real photo. The character stands in a proud, confident hero pose, gentle smile, eye contact with the viewer. Profession tools visible: ${toolsEN}. A soft warm GOLDEN HALO rim-lights the character.
- IN THE CHILD'S HANDS ON THE RIGHT: they proudly hold a small ornate parchment DIPLOMA showing the text "${diplomaTitle}" in calligraphic serif — as if freshly received.

═══ BACKGROUND — cinematic atmosphere ═══
- An OPEN STORYBOOK lies horizontally at the bottom of the frame, slightly out of focus, pages glowing soft warm light from inside. The polaroid + sparkle stream + Pixar character "rise from the book" — the book IS the source of the transformation.
- Above and behind: ${(profile && profile.backdropHint) || "soft warm dusk-sky atmosphere"} — never too distracting.
- Soft subtle bokeh, light leaks, dreamy depth — Pixar key-art / movie poster level cinematography.
- Color palette: warm cream + soft navy + golden orange + profession accent color. Brand-aligned (#3F4F8A navy, #F4A261 orange, #F5EFE6 cream).

═══ TYPOGRAPHY (rendered into the image) ═══
- Two SMALL eyebrow labels:
  - Above polaroid (left): "BUGÜN" — small caps, wide tracking, warm gray, clean humanist sans-serif, 9-11pt.
  - Above Pixar character (right): "HAYALİNDEKİ" — same treatment, slightly highlighted in orange.
- ONE bottom headline, large, premium EDITORIAL DISPLAY SERIF (Fraunces / Cormorant feel):
  "Hayalinin **kahramanı** ol."
  - "Hayalinin" in deep warm brown (#3F2A1A) regular serif weight
  - "kahramanı" in italic + warm golden-orange (#D17A2C), with a small subtle hand-drawn underline flourish beneath it
  - "ol." in the same brown, adding a confident period
  - Sentence anchored centered at the bottom
- Turkish diacritics PERFECT: ş ğ ü ö ç ı İ. Headline appears EXACTLY ONCE.

═══ STYLE ═══
- Pixar movie key-art quality, aspirational transformation cinematography.
- Mood: empowering, warm, dreamy — "your child will BECOME this."
- This is THE marketing hero image for a meslek-kahramanlari product; must look catalogue-ready.

═══ ABSOLUTE RULES ═══
- 2:3 portrait format (DO NOT change).
- Single unified scene; NO hard vertical 50/50 line.
- Same child face on both sides.
- Right character's UNIFORM must match the profession exactly — if uniform is wrong or generic, the image is WRONG.
- The diploma on the right must show "${diplomaTitle}" clearly.
- Headline rendered EXACTLY ONCE, perfect Turkish.
- No watermarks, no logos, no brand names.`;

  const imageUrl = await generateImage(prompt, [realPhotoRef, frontCoverRef], "2:3");
  return { imageUrl, prompt };
}

module.exports = {
  generateHookVisual,
  generateTransformationVisual,
};
