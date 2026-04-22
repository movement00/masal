/**
 * characterReferenceAgent.js — Node port of
 *   MasalSensinUrunStudio/src/services/characterReferenceAgent.ts
 *
 * 1:1 functional parity. No added features.
 *
 * Exports:
 *   - generateCharacterReferences(concept) -> { realPhoto }
 */

const { generateImage } = require("./geminiClient");

// JS-side random pick — prevents AI from always choosing the same "safe" option
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const SCENES = [
  "in a bright sunny park on vivid green grass, warm golden afternoon sunlight flooding the scene, blue sky, trees softly blurred behind — OUTDOOR, BRIGHT",
  "at a sunny outdoor cafe terrace, colorful juice on table, bright cheerful day, warm sunlight on face — OUTDOOR, BRIGHT",
  "on a garden swing, bright colorful flowers blooming everywhere, clear blue sky, sunlight in hair — OUTDOOR, BRIGHT",
  "at a sunny seaside promenade, sparkling turquoise ocean behind, wind in hair, brilliant sunny day — OUTDOOR, BRIGHT",
  "in a bright flower garden with vivid tulips and daisies, sunlight dappling through green leaves, cheerful colors everywhere — OUTDOOR, BRIGHT",
  "running on a bright sunny playground, colorful equipment behind, blue sky, warm golden light — OUTDOOR, BRIGHT",
  "sitting on a bright green lawn having a picnic, colorful blanket, fruits and snacks, warm sunshine — OUTDOOR, BRIGHT",
  "at a cheerful outdoor birthday party, colorful balloons and bunting, bright natural daylight, festive — OUTDOOR, BRIGHT",
  "in a bright sunlit balcony with potted flowers, city view behind, warm morning light on face — OUTDOOR, BRIGHT",
  "in a sunny backyard with swing set and chalk drawings on the ground, cheerful daylight — OUTDOOR, BRIGHT",
  "at a bright city square with fountain behind, warm afternoon sun casting gentle shadows, cheerful urban scene — OUTDOOR, BRIGHT",
  "on a sunlit wooden dock by a calm lake, small boats in distance, warm morning light — OUTDOOR, BRIGHT",
  "in a bright autumn park with red and golden leaves on ground, crisp sunny day — OUTDOOR, BRIGHT",
  "at a cheerful outdoor wedding garden with string lights catching sunset, warm glow — OUTDOOR, BRIGHT",
  "on a sunny hilltop with rolling green hills behind, arms open feeling the wind, golden hour — OUTDOOR, BRIGHT",
  "at a bright strawberry field with rows of red berries, warm summer sunlight — OUTDOOR, BRIGHT",
  "in a cozy sunlit living room with big window streaming warm natural light, clean modern — INDOOR, BRIGHT",
  "in a bright child's bedroom with colorful posters and soft natural light from window, cheerful morning — INDOOR, BRIGHT",
  "at a bright sunlit library corner with shelves of books behind, warm reading-light glow — INDOOR, BRIGHT",
  "in a bright modern kitchen with sunlight streaming in, warm breakfast scene, cozy morning — INDOOR, BRIGHT",
];

const ACTIONS = [
  "looking directly at camera with a big genuine warm smile, eyes sparkling — NO book in hands",
  "laughing joyfully with head slightly tilted back, pure happiness — NO book, NO objects in hands",
  "smiling shyly at camera, one hand touching their cheek, sweet innocent expression — hands empty",
  "looking up at the sky with wonder and amazement, mouth slightly open in awe — hands free",
  "hugging a stuffed animal tightly with closed eyes and a content smile — NO book",
  "waving hello at the camera with an enthusiastic big smile — hands visible and empty",
  "blowing dandelion seeds with puffed cheeks, playful joyful moment — NO book",
  "giving a thumbs up with a confident happy grin — clear hand visible",
  "sitting with hands in lap, looking at camera with a sweet curious tilt of the head — NO props",
  "running toward the camera with arms open and a big laugh — action shot, joyful",
  "peeking out from behind something (tree, column) with playful mischievous smile — hands empty",
  "holding hand up near face making a cute 'peace' sign with two fingers — hands visible",
  "mid-spin with dress or clothes flowing outward, laughing with pure joy — action blur",
  "tilted back laughing at something off-camera, genuine belly laugh moment — hands free",
  "crouched playing with small object (stone, leaf) concentrating with soft smile — innocent moment",
  "standing on tiptoes reaching up toward something unseen, curious expression — hands reaching",
  "hands on hips in a confident 'superhero' pose with a cheeky grin — empowered stance",
  "sitting cross-legged on the ground looking up at camera with bright curious eyes — calm pose",
  "clapping hands excitedly with a wide open-mouth smile — expression of pure delight",
  "pointing at something with one finger with excited surprised face — 'look!' moment",
];

const DEFECTS = [
  "natural iPhone portrait mode — face sharp, background has smooth natural bokeh",
  "slight golden lens flare from sun at edge — adds warmth not distraction",
  "natural depth of field — child sharp, background gently soft",
];

/**
 * Generates ONE hyper-realistic "iPhone parent photo" of the child.
 * This image serves as: (a) visual reference for all other generations,
 * and (b) a deliverable itself — the "real child photo" in the catalog.
 *
 * GOAL: This must pass as a REAL photograph. No AI tells whatsoever.
 *
 * @param {object} concept — BookConcept { baslik, kahraman: { isim, yas, cinsiyet, kiyafet }, ... }
 * @returns {Promise<{ realPhoto: string }>}
 */
async function generateCharacterReferences(concept) {
  const { kahraman } = concept;
  // Robust gender check — handles "Erkek", "erkek cocuk", "erkek", etc.
  const isBoy = /erkek/i.test(kahraman.cinsiyet);
  const gender = isBoy ? "boy" : "girl";

  const scene = pick(SCENES);
  const action = pick(ACTIONS);
  const defect = pick(DEFECTS);

  // === PHYSICAL VARIETY POOLS (JS-side randomization — guarantees diversity) ===
  const HAIR_COLOR_STYLE_BOY = [
    "short dark chestnut brown hair, slightly tousled on top",
    "medium black hair with a side parting, a few locks falling on forehead",
    "short wavy dark brown hair, slightly curly texture",
    "light honey-blonde short hair, straight and soft",
    "dark curly hair, bouncy ringlets framing face",
    "very short buzz-cut dark hair, crisp edges",
    "medium brown hair with natural highlights from sun, casual tousled style",
    "jet black straight hair with a clean fringe across forehead",
    "auburn/reddish-brown short hair with slight wave",
  ];
  const HAIR_COLOR_STYLE_GIRL = [
    "long dark brown wavy hair in two low pigtails with colorful scrunchies",
    "shoulder-length black straight hair with a small butterfly hair clip",
    "long honey-blonde hair in a single French braid",
    "medium-length chestnut brown curly hair, loose natural ringlets",
    "long jet-black hair in a high ponytail with a ribbon",
    "chin-length bob cut in dark brown, straight with bangs",
    "long auburn-red hair loose with gentle waves",
    "short pixie cut in warm brown, feminine and playful",
    "long dark wavy hair with two small braids on the sides (half-up style)",
    "medium chocolate-brown hair in space buns with small flowers tucked in",
  ];
  const EYE_COLOR = [
    "warm deep brown eyes",
    "hazel-green eyes with golden flecks",
    "dark almond-shaped brown eyes",
    "gray-blue eyes (rare but Turkish)",
    "honey-amber colored eyes",
    "rich dark-chocolate eyes",
  ];
  const SKIN_TONE = [
    "warm olive Mediterranean skin",
    "light wheat-toned skin",
    "fair rosy skin with light freckles across the nose",
    "tan golden skin with a healthy glow",
    "soft peachy-pale skin",
    "deep honey-toned skin",
  ];
  const FACE_SHAPE = [
    "round full cheeks",
    "slender oval face with softer cheeks",
    "heart-shaped face with pointed chin",
    "square-ish strong jawline (still child-soft)",
    "long narrow face with delicate features",
  ];
  const DISTINCTIVE = [
    "a sprinkle of freckles across the nose and cheeks",
    "a tiny beauty mark near the left eye",
    "dimples that show when smiling",
    "a slight gap between front teeth (charming)",
    "long curled eyelashes",
    "thick expressive eyebrows",
    "a small mole on the cheek",
    "a tiny birthmark on the temple",
    "cute round-framed children's glasses",
    "slightly crooked-but-endearing smile",
  ];
  const BUILD = [
    "petite and slender build",
    "average healthy child build",
    "slightly chubby huggable build",
    "tall-for-age slim build",
    "sturdy compact build",
  ];

  const hairStyle = gender === "boy" ? pick(HAIR_COLOR_STYLE_BOY) : pick(HAIR_COLOR_STYLE_GIRL);
  const eyeColor = pick(EYE_COLOR);
  const skinTone = pick(SKIN_TONE);
  const faceShape = pick(FACE_SHAPE);
  const distinctive = pick(DISTINCTIVE);
  const build = pick(BUILD);

  const variedPhysical = `${hairStyle}, ${eyeColor}, ${skinTone}, ${faceShape}, ${build}, with ${distinctive}`;

  // Everyday clothing (NOT story outfit — this is a "real" photo, not costume)
  const EVERYDAY_CLOTHES_BOY = [
    "wearing a soft cotton striped t-shirt (navy and white) with comfortable jogger pants and colorful sneakers",
    "wearing a warm knit sweater (mustard yellow) with jeans and white trainers",
    "wearing a simple polo shirt (light blue) with chino shorts and sandals",
    "wearing a cozy hoodie (heather gray) with sweatpants and slip-on shoes",
    "wearing a fun graphic tee with a small dinosaur print, denim shorts, and velcro sneakers",
  ];
  const EVERYDAY_CLOTHES_GIRL = [
    "wearing a soft floral print dress (pastel pink/lavender) with white leggings and ballet flats",
    "wearing a cozy cardigan (cream) over a simple t-shirt, with a denim skirt and sneakers",
    "wearing a cheerful striped long-sleeve top (coral and white) with comfortable leggings and boots",
    "wearing a knit sweater dress (dusty rose) with tights and mary jane shoes",
    "wearing a simple cotton blouse with a cute collar, paired with soft joggers and colorful sneakers",
  ];
  const everydayClothing = gender === "boy" ? pick(EVERYDAY_CLOTHES_BOY) : pick(EVERYDAY_CLOTHES_GIRL);

  const prompt = `A single professional portrait photograph of an ADORABLE Turkish child. This photo must make everyone say "Maşallah ne tatlı çocuk!" — irresistibly cute, sweet, loveable.

GENDER (CRITICAL — MUST be clearly a ${gender}):
This child is a ${gender}. ${gender === "boy" ? "He must clearly look like a BOY — short or medium boyish haircut, boyish face shape, masculine child proportions. NOT feminine, NOT androgynous." : "She must clearly look like a GIRL — longer or styled feminine hair (braids, ponytail, clips, or flowing), girlish face, feminine child proportions. NOT masculine, NOT androgynous."}

THE CHILD — MUST BE ADORABLE AND UNIQUELY INDIVIDUAL:
- ${kahraman.yas}-year-old Turkish ${gender}
- AGE-ACCURATE PROPORTIONS (CRITICAL — do NOT render older than stated age):
  * ${kahraman.yas <= 3 ? `This is a TODDLER (age ${kahraman.yas}). Head-to-body ratio about 1:4 (larger head relative to body). Round chubby cheeks, soft baby fat on face, small button nose, tiny rosebud mouth, short stubby fingers, shorter legs. Clearly visibly a toddler — NOT a 5-year-old, NOT a kindergartener. Think "baby-toddler" features: hair still fine and thin, eyes large on a round face, no adult-like bone structure yet.` : kahraman.yas <= 5 ? `This is a PRESCHOOLER (age ${kahraman.yas}). Head-to-body ratio about 1:5. Still round cheeks but slimming a bit. Clearly a small child — NOT a 7-year-old.` : kahraman.yas <= 7 ? `This is an EARLY-SCHOOL child (age ${kahraman.yas}). Head-to-body ratio about 1:5.5-1:6. Lean face, more defined features, still childlike. NOT a tween.` : `This is an OLDER CHILD (age ${kahraman.yas}). Head-to-body ratio about 1:6-1:6.5. More defined bone structure, leaner proportions, taller.`}
- SPECIFIC PHYSICAL FEATURES (MUST render EXACTLY as described — this is what makes THIS child different from other children):
  * ${variedPhysical}
- EVERYDAY CLOTHING: ${everydayClothing}
- Genuine warm SMILE showing happiness (not neutral, not serious — SMILING)
- Clean healthy glowing skin — NO wounds, NO band-aids, NO scratches, NO bruises
- Well-groomed hair matching the specific style above
- Overall impression: a well-loved, happy, healthy Turkish child — but CLEARLY distinct from other children (different hair, different eyes, different face). NOT a generic cute kid template.
- CRITICAL: Do NOT default to "big eyes + chubby cheeks + button nose" generic cute template. Honor the SPECIFIC features listed above — if freckles are specified, show freckles; if pixie cut, show pixie cut; if hazel eyes, show hazel eyes.

WHERE: ${scene}
WHAT THEY'RE DOING: ${action}
CAMERA STYLE: ${defect}

PHOTOGRAPHY STYLE — warm, natural, aspirational:

LIGHTING: BRIGHT warm natural OUTDOOR sunlight. Face fully lit, no dark shadows on face. Catch lights sparkling in eyes. The scene should feel SUNNY, CHEERFUL, ALIVE. NOT dark, NOT moody, NOT indoor dim light, NOT harsh flash, NOT fluorescent. Think: bright sunny Turkish spring day.

SKIN: Natural healthy child's skin. Rosy cheeks from playing. Smooth and clean but real (not plastic/CGI). Natural skin texture visible but not exaggerated imperfections.

HAIR: Natural, clean, well-kept but with character (a few flyaways are fine). Shiny and healthy-looking.

EXPRESSION: Genuine, warm, engaging. The kind of smile or look that makes you say "ne tatlı çocuk!" — sweet, endearing, loveable.

ENVIRONMENT: BRIGHT, colorful, cheerful outdoor scene. Vivid greens, blue sky, warm sunshine. NOT indoor, NOT dark, NOT gloomy. Happy, lively, full of color and light. A scene that makes you smile.

TECHNICAL:
- iPhone 15 Pro portrait mode (natural bokeh, face sharp)
- f/1.8, natural depth of field
- Warm color science, slightly golden
- High quality, clean image
- Professional-grade iPhone photo quality

MOOD: BRIGHT, HAPPY, JOYFUL. This photo should make a parent think "I want MY child to have a book like this." Sunny, cheerful, full of life. The child looks HAPPY, HEALTHY, LOVED. A photo you'd frame on your wall.

CRITICAL RULES:
✗ No waxy/plastic skin
✗ No merged/melted fingers — correct 5-finger anatomy
✗ No uncanny valley eyes
✗ No floating objects
✗ No text anywhere in the image
✗ No over-saturated HDR look
✗ ABSOLUTELY NO BOOKS in the child's hands or nearby — this is a PORTRAIT ONLY, no products
✗ The child MUST be clearly a ${gender} — if ${gender === "boy" ? "the child looks female or ambiguous, the image FAILS" : "the child looks male or ambiguous, the image FAILS"}
✗ No band-aids, no wounds, no scratches, no bruises anywhere on the child`;

  const realPhoto = await generateImage(prompt, [], "3:4");
  return { realPhoto };
}

module.exports = { generateCharacterReferences };
