const { generateImage } = require("./geminiClient");
const { getMeslekProfileFromTitle } = require("../rules/meslek-profiles");
const fs = require("fs");
const path = require("path");
// CharacterReference import removed — now takes raw string URL

// Shared book format directive — drop into any prompt where the book is depicted.
// This is CRITICAL because image models default to hardcover novels if not forced.
const BOOK_FORMAT_DIRECTIVE = `═══ BOOK FORMAT — THIN MAGAZINE-STYLE PAPERBACK (CRITICAL) ═══
This product is a THIN FLEXIBLE MAGAZINE-STYLE PAPERBACK — think National Geographic Kids, a children's activity magazine, or a school workbook. It is NOT a hardcover book.
- THICKNESS: approximately 3-5mm total — very thin, like a magazine, NEVER like a novel or chapter book
- COVER: soft flexible paper, bendy, you could roll it up like a magazine. Cover paper is a single thin sheet of matte or soft-gloss cardstock — NOT a rigid cardboard board
- NO visible binding details: do NOT draw staples, do NOT draw stitches, do NOT draw glue lines. Just a clean, simple paper edge — the binding is not rendered.
- ABSOLUTELY NOT: hardcover, case-bound, leather, cloth, thick spine, embossed raised letters, gold-foil raised title, rigid board, chunky binding
- Physical reference the AI should imagine: a thin children's activity magazine or a National Geographic Kids issue — that flexibility and thinness
- If the rendered book looks thick, chunky, hardcover, or has a rigid spine with raised letters, the IMAGE IS WRONG and must be regenerated
- For flat-product shots: render as COMPLETELY FLAT single page (2:3 portrait), NO 3D mockup, NO page curl, NO bent corners, NO wavy paper, NO warp, NO perspective. The cover must sit STRAIGHT and RIGID as if scanned flat.`;

// Heuristic: find profession profile from concept.
// Uses kiyafet as the strongest signal (we embed "<Meslek> uniform:" there).
function detectMeslekProfile(concept) {
  // Check kahraman.kiyafet first — it always contains "<labelTR> uniform" when meslek
  const profileFromKiyafet = getMeslekProfileFromTitle(concept.kahraman.kiyafet);
  if (profileFromKiyafet) return profileFromKiyafet;
  return getMeslekProfileFromTitle(concept.baslik);
}

// MESLEK cover prompt — child in uniform at workplace, first-day iconic moment.
function buildMeslekCoverPrompt(category, concept, characterDesc) {
  const { baslik, kahraman, sahneler } = concept;
  const profile = detectMeslekProfile(concept);
  const workplaceEN = profile?.workplaceEN || "the professional workplace";
  const uniformEN = profile?.uniformEN || kahraman.kiyafet;
  const toolsEN = profile?.toolsEN || "";
  const iconicHint = profile?.iconicSceneHints || sahneler[0] || "";
  const meslekLabel = profile?.labelTR || "Meslek";
  const titleIcon = profile?.titleIcon || "a small decorative profession icon integrated with the title";

  return `A PREMIUM CINEMATIC PIXAR-STYLE PERSONALIZED CHILDREN'S BOOK COVER — 2:3 portrait format. Full 3D Pixar/Disney CGI quality like a frame from an animated feature film. NOT 2D, NOT flat cartoon, NOT anime.

═══ PROFESSION IDENTITY (READ FIRST, CRITICAL) ═══
This book is specifically about ${kahraman.isim} as a ${meslekLabel}. ONLY ${meslekLabel} context. Do NOT render a football player, doctor, dancer, astronaut, chef, vet, or any other profession unless the profession IS ${meslekLabel}. Every visual element — uniform, workplace, tools, colors — must match ${meslekLabel} and NOTHING else. Even if the child's name or the scene could suggest another context, ignore that — this is a ${meslekLabel} book, full stop.

═══ HERO MOMENT ═══
The cover captures ${kahraman.isim} in a DEFINING ICONIC MOMENT of being a ${meslekLabel}. Choose ONE visually powerful beat from: ${iconicHint}
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
${kahraman.isim} wears this uniform EXACTLY: ${uniformEN}
Every detail of the uniform must be clearly visible and accurate. This is the single biggest signal that "kitap ne hakkında" — get the costume perfect.
Profession tools visible in composition: ${toolsEN}

═══ WORKPLACE ENVIRONMENT ═══
The setting is: ${workplaceEN}
Render as a FULL 3D WORLD with depth, atmosphere, realistic lighting. 3-layer cinematic depth: FOREGROUND (tools/props of trade), MIDGROUND (child in action), BACKGROUND (workplace context softly focused). This environment tells the viewer "this book is about being a ${meslekLabel}" instantly.

═══ HERO CHARACTER + FACE CONSISTENCY (NON-NEGOTIABLE) ═══
${characterDesc}

⚠️ REFERENCE PHOTO USAGE — CRITICAL:
The iPhone reference photo is provided ONLY for FACE/HAIR/SKIN identity. You MUST COMPLETELY IGNORE the background, environment, outfit, props, and lighting from the reference photo. Do NOT reproduce ANY element from the reference photo's surroundings (no market stalls, no seaside, no garden, no playground, no balloons, no plants from the reference). The ONLY thing to carry forward from the reference is the child's facial features and Turkish ethnicity. The ENVIRONMENT, BACKGROUND, OUTFIT, and LIGHTING of THIS cover MUST be the ${meslekLabel} workplace as specified in the WORKPLACE ENVIRONMENT section above.

FACE IDENTITY — the child's face in this Pixar cover MUST be IMMEDIATELY recognizable as the SAME child from the iPhone reference photo. A parent glancing at the cover should say "that's my kid, Pixar-ified." Match with photographic precision:
• SAME eye shape, eye color, eyebrow arch and thickness
• SAME nose shape, nose bridge, nostril size
• SAME mouth and lip shape (upper lip curve, lower lip thickness)
• SAME face shape: oval / round / heart-shaped / narrow — whichever the reference shows
• SAME hair color, hair style, hair length, hair parting
• SAME skin tone and Turkish ethnicity
• SAME distinctive features if visible in the reference (freckles, dimples, glasses, hair clip, mole)
• SAME age impression for ${kahraman.yas} years

ONLY the render style is stylized: Pixar 3D CGI surface (subsurface scattering, softer edges, slightly larger eyes). The IDENTITY must NOT change. If the rendered character looks like a generic "cute kid" instead of THIS specific kid from the reference, the image is WRONG.

EMOTION + POSE:
- Emotion on face is FOCAL POINT: proud determination / joyful confidence / dreamy focus depending on scene beat
- Child caught MID-ACTION (not posed for camera) in the profession
- Age-appropriate for ${kahraman.yas} years — small child in a (slightly oversized but properly fitted) professional uniform, which amplifies the "playing grown-up" charm

═══ TITLE TYPOGRAPHY ═══
Main title: "${baslik}"
- ALL TITLE TEXT in WARM HAND-LETTERED DECORATIVE SERIF (think Fraunces / Recoleta / Playfair Display bold-italic feel) — warm cream/ivory color (#F5EFE6 or #F7E9CF) on the darker workplace background, with subtle soft drop-shadow for readability
- Rendered as ONE continuous integrated title — the whole title flows together as written, not split into separate name/subtitle blocks
- INTEGRATED PROFESSION ICON: ${titleIcon} — small, warm-toned, plays with the letters naturally (e.g., flying across between words, resting on a letter, trailing sparkles)
- Title positioned TOP of the cover, takes ~25-30% vertical space
- Title appears EXACTLY ONCE
- Reference for typography style: classic storybook title — warm, inviting, decorative-but-readable (like "Where the Wild Things Are" or "The BFG" cover lettering feel)

═══ TURKISH CHARACTERS (CRITICAL) ═══
"${baslik}" spelled EXACTLY letter by letter.
- ı (dotless i) ≠ i | İ (dotted cap I) ≠ I | ş ≠ s | ç ≠ c | ğ ≠ g | ö ≠ o | ü ≠ u
- Mixed case as provided. "Macerası" NOT "MACERASI"
- NO trailing punctuation. If the title ends in a letter, the rendered title must also end in a letter — no comma, period, exclamation, ellipsis at the end.

═══ BOTTOM-LEFT PERSONALIZATION SEAL ═══
A beautiful gold-foil circular seal (#D4A574) with subtle emboss, ~14-18% frame width.
Inside the seal Turkish text: "Bu kitap ${kahraman.isim} için özel üretilmiştir"
Small decorative laurel/ornament around the seal edge. Feels like a quality certification stamp — makes the book feel PREMIUM.

NO bottom info strip, NO page count, NO age range text — ONLY the personalized seal at the bottom-left corner.

═══ STYLE ═══
- Full Pixar/Ice Age 3D CGI — subsurface scattering, volumetric lighting, hyper-detailed textures, photorealistic fabric folds, cinematic depth
- Saturated cinematic color palette: ${profile?.colorPaletteHint || "warm cinematic tones matched to the profession"}
- Rich textures: fabric folds on uniform, individual hair strands, skin subsurface, material-accurate surfaces (metal tools, cloth, leather)
- Environmental storytelling: small profession-specific details in the scene

${BOOK_FORMAT_DIRECTIVE}

═══ CRITICAL ═══
- Turkish diacritics PERFECT
- Title appears EXACTLY ONCE
- No barcode, no price, no ISBN, no publisher strip
- The uniform is the LOUDEST signal — someone glancing at the thumbnail must INSTANTLY know "this book is about a ${meslekLabel}"

Category: ${category.name} — ${category.description}`;
}

// MESLEK back cover — HIKAYE-CONSISTENT layout with profession-specific kazanım grid + proud child hero.
// Diploma stays small (peek hint) — the full diploma is on the inside diploma page.
function buildMeslekBackCoverDiploma(concept) {
  const { kahraman, ozet, kazanimlar } = concept;
  const profile = detectMeslekProfile(concept);
  const meslekLabel = profile?.labelTR || "Meslek";
  const uniformEN = profile?.uniformEN || kahraman.kiyafet;
  const diplomaTitle = profile?.diplomaTitle || "KAHRAMANLIK SERTİFİKASI";
  const meslekSymbols = profile?.diplomaSymbols || "profession-matched icons";

  // Truncate summary — 2 sentences max (short, punchy)
  let summary = ozet;
  if (ozet.length > 200) {
    const cut = ozet.slice(0, 200);
    const lastPeriod = cut.lastIndexOf('.');
    summary = lastPeriod > 80 ? cut.slice(0, lastPeriod + 1) : cut.slice(0, 197) + '...';
  }

  // Build kazanım grid instruction — semantic icon per text (boyama pattern, adapted)
  const kazanimGrid = kazanimlar.slice(0, 4).map((k, i) => {
    return `Card ${i + 1} — text: "${k}" — icon: a small 3D-illustrated icon that VISUALLY REPRESENTS the meaning of this specific ${meslekLabel} value. Example icons per value type (pick the one that fits): cesaret → shield or lion; disiplin → target or star; liderlik → crown or compass; sorumluluk → clock or heart hands; empati → heart with hands; yaratıcılık → lightbulb with sparkles; merak → magnifying glass; bilimsel düşünme → atom or book; gözlem → eye or magnifier; sabır → hourglass; azim → mountain peak; takım çalışması → connected people; hayal kurma → cloud with stars; hızlı karar → lightning bolt; dayanışma → hands together; yardımseverlik → heart with helping hand. Pick the MOST fitting icon for "${k}".`;
  }).join("\n");

  return `CHILDREN'S STORYBOOK BACK COVER — 2:3 portrait. COMPLETELY FLAT print-ready back cover of a thin flexible paperback. NO 3D mockup, NO curl, NO perspective, NO warp. If any corner bends, the image is WRONG.

═══ PROFESSION IDENTITY (READ FIRST, CRITICAL) ═══
This book is specifically about ${kahraman.isim} as a ${meslekLabel}. ONLY ${meslekLabel} context. Every symbol, color, icon must fit a ${meslekLabel}. Do NOT mix in elements from other professions.

This is the REVERSE SIDE of the front cover shown in the reference image. Same book, same visual language, same art style. The back cover's JOB is to make a parent say "I want to buy this" by showing (a) what the book is about, (b) what the child will gain, (c) a glimpse of the emotional payoff.

LANGUAGE: ALL text MUST be in TURKISH.

═══ LAYOUT (top to bottom) ═══

HEADER — THIS IS A HARDCODED BRAND CONSTANT, NOT GENERATED TEXT.
The header MUST be exactly these 5 Turkish words, in this exact order, with the trailing ellipsis, and NOTHING ELSE:
→ Masal Bitti Ama İzleri Kaldı...

It is INVALID to render any of the following variations — every single one is wrong:
✗ "{child_name}'in Kahraman Masalı Bitti" — WRONG, do NOT use child's name
✗ "Kahraman Masalı Bitti" — WRONG, missing "Ama İzleri Kaldı"
✗ "Masal Bitti" alone — WRONG, missing "Ama İzleri Kaldı..."
✗ Any version with the child's name inserted — WRONG
✗ Any version with "Kahraman" word added — WRONG
✗ Any version with "{profession}" word added — WRONG

Correct and ONLY acceptable rendering: Masal Bitti Ama İzleri Kaldı...
The child's name appears ELSEWHERE on the back cover (in the summary paragraph and in the personalization tag) — NEVER in this header.
Style: large elegant decorative bold serif at top, warm brown color (#4E342E), optically centered.

STORY SUMMARY (display this EXACT Turkish text):
"${summary}"
Style: elegant readable serif, dark brown (#5D4037), centered, max 3 lines, breathing.

SECTION HEADING (display this EXACT Turkish text): "NE ÖĞRENDİ?"
Style: bold playful display font, centered, warm orange (#E65100).

ACHIEVEMENTS GRID (2×2 grid of 4 subtle rounded cards, ALL IN TURKISH). Each card has an illustrated 3D icon that SEMANTICALLY MATCHES its Turkish text. EACH CARD MUST HAVE A DIFFERENT ICON from the other 3 cards.

${kazanimGrid}

Style: each achievement in a subtle rounded card with warm cream background and thin warm-brown border. 3D illustrated icon on the LEFT (~22% of card width), Turkish text on the RIGHT. Clean readable sans-serif (Nunito). Icons visually distinct AND meaningfully tied to their text.

SMALL DIPLOMA PEEK (to the right of or below the kazanım grid):
A small illustrated folded parchment diploma-corner peeking into view from one side, showing just the top header text "${diplomaTitle}" and a hint of gold-foil ornamental border + small heraldic emblem (using ${meslekLabel} symbols: ${meslekSymbols}). This is a PEEK — not the full diploma — signaling "the full official diploma is waiting inside the book". Size ~15-18% of the page, subtle gold glow, slight tilt.

HERO CHARACTER ILLUSTRATION (bottom-left or bottom area, NOT dominating):
A 3D Pixar illustration of ${kahraman.isim} wearing the ${meslekLabel} uniform EXACTLY as: ${uniformEN.split(",").slice(0, 3).join(",")}, standing proudly, holding the actual diploma with one hand, smiling warmly at the viewer. Face matches the front cover reference EXACTLY. Size ~25-30% frame width. Confident pose — NOT static, NOT posed for camera — a "proud graduation moment".

FOOTER LINE (display this EXACT Turkish text): "Her çocuğun hayallerine giden bir yolu vardır..."
Style: elegant italic warm script font, warm orange (#BF360C).

BRAND SECTION at very bottom:
- Reproduce the MasalSensin brand mark from the SECOND reference image exactly as-is (open storybook with castle + quill icon + cursive "Masalsensin" wordmark), centered at bottom, ~14-18% width. Do NOT render the English word "LOGO" anywhere — only the actual brand artwork from the reference.
- Below the brand mark: small text "www.masalsensin.com" in elegant subtle serif
- Small personalization badge: "Bu kitap ${kahraman.isim} için özel olarak hazırlanmıştır ❤️"

═══ DESIGN ═══
- Soft warm cream to light peach gradient background
- Subtle profession-themed watercolor decorations at edges (tools/symbols of ${meslekLabel}, not full scenes)
- Clean, elegant, premium book quality
- Warm brown and orange color palette for text
- Kazanım cards with subtle rounded frames
- Gentle decorative vine/leaf borders at top and bottom edges

═══ TYPOGRAPHY ═══
- Header: large decorative bold serif, warm brown
- Summary: elegant readable serif, dark brown
- "NE ÖĞRENDİ?": bold playful display, warm orange
- Kazanım cards: clean sans-serif
- Footer quote: elegant italic script, warm orange
- Turkish diacritics (ş ç ğ ü ö ı İ) MUST be PERFECT
- Brand: small elegant serif

═══ CRITICAL ═══
- Header text EXACTLY as provided: "${kahraman.isim}'in Kahraman Masalı Bitti..."
- Summary rendered VERBATIM
- "NE ÖĞRENDİ?" heading appears EXACTLY ONCE
- 4 kazanım cards, each with a DIFFERENT semantically matching icon
- Diploma PEEK is small (15-18%) — NOT a full diploma, just a corner
- Hero child (uniform + diploma) bottom-left/bottom, ~25-30% — proud but not dominating
- NO barcode, NO price, NO ISBN, NO duplicate text`;
}


// Boyama (coloring book) cover — validated in masal project (Pixar v4).
// Front cover is FULL 3D Pixar rendered but strongly signals "coloring book" (crayons, banner, open sheet).
function buildBoyamaCoverPrompt(category, concept, characterDesc) {
  const { baslik, kahraman, sahneler } = concept;
  const firstScene = sahneler[0] || "a friendly themed setting";
  const isSimple = category.visualStyle === "coloring-simple";
  const pageCountHint = isSimple ? "16" : "24";
  const ageRange = category.ageRange;
  return `A PREMIUM PIXAR-STYLE PERSONALIZED CHILDREN'S COLORING BOOK COVER — 2:3 portrait format. The ENTIRE cover is rendered in FULL 3D PIXAR / ICE AGE CGI quality (cinematic, premium, ultra-detailed). NOT 2D illustration. NOT flat cartoon. This is a COLORING BOOK cover — but the FRONT COVER itself is a vibrant full-color Pixar render. The INSIDE pages will be black-and-white line art, but the cover is rich color.

═══ COLORING BOOK SIGNALS (must scream "boyama kitabı") ═══
1) BIG bold "BOYAMA KİTABI" badge prominently below the title — chunky playful 3D-rendered letters, colorful (rainbow gradient), drop-shadow, slightly tilted ribbon-style banner. THIS IS THE KEY VISUAL SIGNAL.
2) ${kahraman.isim} actively holds a HUGE OVERSIZED colorful crayon (or fan of crayons) in one hand, prominently visible — like a magic wand of color
3) An open coloring sheet or sketchbook visible in the scene (B/W lines on the page, partially visible) — hint of "what's inside"
4) Around the character: scattered fully-rendered 3D crayons, paint tubes, color pencils, paint splashes (rendered with Pixar shading)
5) Background: scene context — ${firstScene} — warm golden-hour lighting

═══ HERO CHARACTER ═══
${characterDesc}
- The child is JOYFUL and focused, slightly energetic but CALMLY focused on coloring. NOT in adventure pose — in coloring play pose
- Face EXACTLY matches reference photo, Pixar-stylized eyes/proportions

═══ TITLE TYPOGRAPHY ═══
Main title: "${baslik}" — large playful hand-lettered Turkish decorative 3D-rendered font, each word a slightly different warm color (gold, coral, rose, orange). Title appears EXACTLY ONCE, at the TOP of the cover.

Right below the title: "BOYAMA KİTABI" big bold rainbow banner badge, chunky rounded hand-lettered font.

═══ BOTTOM-LEFT PERSONALIZATION SEAL ═══
A beautiful gold-foil circular seal (#D4A574) with subtle emboss effect, ~14-18% frame width.
Inside the seal Turkish text: "Bu kitap ${kahraman.isim} için özel üretilmiştir"
Small decorative laurel/ornament around the seal edge. Feels like a quality certification stamp — makes the book feel PREMIUM.

NO bottom info strip, NO "${pageCountHint} Sayfa / ${ageRange} Yaş" text anywhere — ONLY the personalized seal at the bottom-left corner.

═══ TURKISH CHARACTERS (CRITICAL) ═══
"${baslik}" spelled EXACTLY letter by letter.
- ı (dotless i) ≠ i | İ (dotted cap I) ≠ I | ş ≠ s | ç ≠ c | ğ ≠ g | ö ≠ o | ü ≠ u
- Mixed case as provided. "Macerası" NOT "MACERASI"

═══ STYLE ═══
- Full Pixar/Ice Age 3D CGI render quality — subsurface scattering, volumetric lighting, hyper-detailed textures, photorealistic fabric folds, cinematic depth
- Saturated warm color palette (gold, orange, soft green/blue backdrop, warm cream accents)
- 3-layer depth: foreground crayons + midground character + background setting
- Premium feel — magazine cover quality
${isSimple ? "- Age 2-5 adaptation: chunkier shapes, simpler background, softer colors, gentler expression" : "- Age 6-10 adaptation: richer scene detail, more decorative elements, slightly more complex environment"}

${BOOK_FORMAT_DIRECTIVE}

═══ CRITICAL ═══
- Turkish diacritics (ş ç ğ ü ö ı İ) PERFECT
- Title appears EXACTLY ONCE
- "BOYAMA KİTABI" badge appears EXACTLY ONCE
- No barcode, no price, no ISBN, no publisher strip
- The visual screams "coloring book" but maintains Pixar-3D premium quality

Category: ${category.name} — ${category.description}`;
}

function getStylePromptForCategory(category, concept) {
  const { baslik, kahraman, sahneler } = concept;
  const firstScene = sahneler[0] || "";

  const isBoy = /erkek/i.test(kahraman.cinsiyet);
  const characterDesc = `The character is ${kahraman.isim}, a ${kahraman.yas}-year-old Turkish ${isBoy ? "BOY (must clearly look male)" : "GIRL (must clearly look female)"}. Use the reference iPhone photos to match the child's face, hair, skin tone, and proportions EXACTLY — but stylize them. Wearing: ${kahraman.kiyafet}.`;

  // Meslek branch — profession cover with uniform + workplace + iconic moment
  if (category.id === "meslek-hikayeleri") {
    return buildMeslekCoverPrompt(category, concept, characterDesc);
  }

  const baseInstructions = `
CINEMATIC CHILDREN'S STORYBOOK COVER — 2:3 portrait format, thin flexible magazine-style softcover book (NOT hardcover). This cover must look like a FRAME FROM A PIXAR FILM — cinematic quality, emotional depth, visually stunning.

═══ CINEMATIC COMPOSITION (3-layer depth) ═══
- FOREGROUND: Scene elements close to camera — leaves, rocks, grass, objects — slightly blurred, adding depth
- MIDGROUND: The CHARACTER in a DYNAMIC ACTION POSE — NOT standing still, NOT looking at camera. Caught mid-moment: reaching, running, discovering, climbing, gasping in wonder
- BACKGROUND: Rich environment — sky, trees, ocean, mountains, city — setting the world, slightly soft focus
- This 3-layer approach creates CINEMATIC DEPTH like a Pixar film frame

═══ CINEMATIC LIGHTING (emotion through light) ═══
- Golden hour rim light on the character (warm glow outlining hair and shoulders)
- Volumetric light beams (sunlight filtering through trees, dust particles visible)
- A MAGICAL LIGHT SOURCE in the scene matching the story theme (glowing map, enchanted object, bioluminescent creature)
- Light = emotion: warm golden = adventure/nostalgia, cool blue = mystery, purple/pink = magic
- NOT flat even lighting — dramatic, cinematic, directional

═══ TITLE TYPOGRAPHY (integrated into the scene) ═══
"${baslik}"
- Title should INTERACT with the scene — letters behind a tree branch, sitting on clouds, glowing softly, partially hidden by foreground element
- Character's name (the first word "${(baslik || "").split(" ")[0]}") in playful HAND-LETTERED script with warm color + decorative flourishes — placed FIRST in reading order
- Rest of the title in chunky friendly display font with contrasting weight — placed AFTER the name in normal reading flow
- NOT a separate text block floating above — PART of the world
- Must still be clearly READABLE despite integration

═══ TURKISH CHARACTERS (CRITICAL) ═══
"${baslik}" spelled EXACTLY letter by letter.
- ı (dotless i) ≠ i | İ (dotted cap I) ≠ I | ş ≠ s | ç ≠ c | ğ ≠ g | ö ≠ o | ü ≠ u
- Mixed case as provided. "Macerası" NOT "MACERASI"
- NO trailing punctuation. If the title above ends in a letter, the rendered title must also end in a letter — do NOT add a comma, period, exclamation, ellipsis, or any mark at the end. "Elif ve Minnoş" stays "Elif ve Minnoş" — never "Elif ve Minnoş,".

═══ CONTRAST RULE ═══
Title MUST be readable against scene. Use: text shadow, glow outline, or light/dark contrast. If scene is dark → light warm text. If light → dark navy text with subtle shadow.

═══ CHARACTER (emotion-first) ═══
${characterDesc}
- CHARACTER'S FACIAL EXPRESSION is the FOCAL POINT of the cover
- The emotion on their face should tell the story: wide-eyed wonder, brave determination, joyful discovery, curious fascination
- Character caught in ACTION — never static, never posed for camera
- Dynamic pose that hints at the story: reaching for something, mid-step, looking up in awe

═══ PERSONALIZATION BADGE ═══
Turkish text: "Bu kitap ${kahraman.isim} için özel olarak üretilmiştir"
Style: Premium gold foil seal (#D4A574) with subtle emboss effect — like a quality certification stamp. Small, bottom-left corner. Makes the book feel SPECIAL and PREMIUM.

${(() => {
  // Sidekick visibility — if the title mentions an animal companion or a named creature,
  // the cover MUST show that companion alongside the child. Otherwise the cover lies
  // about the book's content (e.g. "Umut ve Minik Tosbağa" with no tortoise visible).
  const titleLower = (baslik || "").toLowerCase();
  const SIDEKICK_PATTERNS = [
    { rx: /\b(tosba[gğ]a|tortoise)\b/i, en: "a small tan-brown patterned baby land tortoise (palm-sized) with domed shell", tr: "minik kara-tan kabuklu kaplumbağa" },
    { rx: /\b(kedi|cat|minno[sş]|m[ıi]rnav|fındık)\b/i, en: "the named cat companion mentioned in the title", tr: "adı geçen kedi" },
    { rx: /\b(k[öo]pek|dog|patı|paty|pati)\b/i, en: "the named dog companion mentioned in the title", tr: "adı geçen köpek" },
    { rx: /\b(tav[şs]an|rabbit|bunny|bulut)\b/i, en: "the named rabbit companion mentioned in the title", tr: "adı geçen tavşan" },
    { rx: /\b(ku[şs]|bird|cik|c[ıi]v[ıi]l)\b/i, en: "the named small songbird companion mentioned in the title", tr: "adı geçen küçük kuş" },
    { rx: /\b(kelebek|butterfly)\b/i, en: "the named butterfly companion mentioned in the title", tr: "adı geçen kelebek" },
    { rx: /\b(kirpi|hedgehog|dikenli)\b/i, en: "the named hedgehog companion mentioned in the title", tr: "adı geçen kirpi" },
    { rx: /\b(bal[ıi]k|fish)\b/i, en: "the named fish companion mentioned in the title", tr: "adı geçen balık" },
    { rx: /\b(at|horse|tay)\b/i, en: "the named horse companion mentioned in the title", tr: "adı geçen at" },
    { rx: /\b(hayvan|pet|dost)\b/i, en: "the named animal companion mentioned in the title", tr: "adı geçen hayvan dost" },
  ];
  const matched = SIDEKICK_PATTERNS.find(p => p.rx.test(titleLower));
  if (!matched) return "";
  return `\n═══ SIDEKICK VISIBILITY (CRITICAL) ═══\nThe title "${baslik}" names an animal/creature companion (${matched.tr}). The cover MUST CLEARLY show this companion alongside the child — NEVER omit them. Render the companion as ${matched.en}, visible beside the child or in the foreground/midground, gently interacting with the child (held in arms, sitting at feet, peeking from behind a flower, looking up at the child, etc.). The companion's species and key visual traits stay consistent throughout the book.\n`;
})()}
${BOOK_FORMAT_DIRECTIVE}`;

  switch (category.visualStyle) {
    case "pixar-3d":
      return `${baseInstructions}

ART STYLE: CINEMATIC 3D Pixar/Disney CGI — like a key frame from a Pixar feature film.
- Stylized 3D CGI (Encanto / Coco / Luca quality — NOT cheap mobile game graphics)
- Character face based on reference photos but Pixar-ified: bigger expressive eyes, softer rounder features, exaggerated emotion
- CINEMATIC SCENE (not flat backdrop): ${firstScene} — render as a FULL 3D WORLD with depth, atmosphere, particles
- Volumetric lighting: golden hour rim light on character + ambient fill + magical light source
- Rich textures: fabric folds on clothing, individual hair strands, skin subsurface scattering
- Environmental storytelling: small details in the scene that hint at the adventure
- Mood conveyed through LIGHT AND COLOR: ${concept.mood}
- NO anime, NO 2D flat, NO cheap 3D, NO static posed character

THIS COVER SHOULD MAKE SOMEONE STOP SCROLLING AND SAY "I WANT THIS FOR MY CHILD."

CRITICAL: The title "${baslik}" must appear ONLY ONCE on the cover — at the TOP. Do NOT write the title twice. Do NOT repeat any text. ONE title, ONE badge, ONE cover.

Category: ${category.name} — ${category.description}`;

    case "coloring-simple":
    case "coloring-detailed":
      return buildBoyamaCoverPrompt(category, concept, characterDesc);

    case "gift-emotional":
      return `${baseInstructions}

ART STYLE: Emotional gift book cover — 3D Pixar character + warm gift atmosphere.
- Character face from reference photos, Pixar-stylized
- Warm heartwarming atmosphere with gift elements (ribbons, hearts, soft glow)
- Pastel warm colors, gold highlights, magical soft lighting
- Character expressing love/celebration matching: ${category.moodKeywords.join(", ")}
- Simple children's book presentation (not complex poster)
- Scene: ${firstScene}

GIFT BOOK — appeals to both children AND parents/grandparents buying it.`;

    default:
      return baseInstructions;
  }
}

async function generateCoverImage(category, concept, realPhotoRef) {
  const prompt = getStylePromptForCategory(category, concept);
  const refs = [];
  if (realPhotoRef) refs.push(realPhotoRef);
  const imageUrl = await generateImage(prompt, refs, "2:3");
  return { imageUrl, prompt };
}

async function loadLogoAsDataUrl() {
  try {
    const logoPath = path.join("C:/Users/ASUS/Desktop/masal/assets/brand", "masalsensin-logo.jpg");
    if (!fs.existsSync(logoPath)) return null;
    const buf = fs.readFileSync(logoPath);
    const base64 = buf.toString("base64");
    return `data:image/jpeg;base64,${base64}`;
  } catch {
    return null;
  }
}


// Turkish possessive suffix ("X'nın/nin/nun/nün" with buffer-n for vowel-ending names).
function turkishPossessive(name) {
  if (!name) return "";
  const lower = name.toLowerCase();
  const vowelsOnly = lower.replace(/[^aeıioöuü]/g, "");
  const lastVowel = vowelsOnly[vowelsOnly.length - 1];
  const harmony = { a: "ın", ı: "ın", e: "in", i: "in", o: "un", u: "un", ö: "ün", ü: "ün" };
  const base = harmony[lastVowel] || "ın";
  const endsInVowel = /[aeıioöuü]$/.test(lower);
  const suffix = endsInVowel ? "n" + base : base;
  return `${name}'${suffix}`;
}

function buildBoyamaBackCoverSkillbox(heroName, summary) {
  const summaryText = summary || `Her çocuğun kendine ait bir rengi, bir hikayesi vardır. Bu kitap ${turkishPossessive(heroName)} elinden renklenmek için hazırlandı.`;
  return `A PREMIUM PIXAR-STYLE PERSONALIZED COLORING BOOK BACK COVER — 2:3 portrait, warm cream magazine feel.

LEFT COLUMN (~42% width, top to bottom):
- Hand-lettered title "Senin Rengin, Senin Hikayen" (warm brown #3F2A1A, gold accent, decorative flourish)
- Turkish summary (2-3 lines, rounded serif, chocolate #3E2723): "${summaryText}"
- 4 horizontal CONTENT ICONS row (small, rounded, warm tones) with Turkish labels underneath: 📖 16 Sayfa / 🌀 Mandala / 🗺️ Labirent / 🔍 Bul ve Boya
- BELOW THE 4 ICONS: a framed "KAZANIMLAR KUTUSU" — soft cream panel (#FBF6EC) with thin warm-brown border and rounded corners, small "BU KİTAP NE KAZANDIRIR?" eyebrow heading in warm-brown small caps. Inside, 4 bullet lines, each with a tiny icon (heart / brain / palette / stopwatch-hand) + Turkish skill text, bold serif chocolate:
      • El-göz koordinasyonu
      • Yaratıcılık ve renk algısı
      • Sabır ve odaklanma
      • Hayal gücü
  Clean, airy spacing, no clutter.
- Bottom-left: HORIZONTAL RECTANGULAR BOOKPLATE LABEL (cream #FBF6EC, thin warm-brown border, rounded corners, paintbrush+crayon icon cluster on the left). Single line text inside: "${turkishPossessive(heroName)} Renk Günlüğü" — bold serif chocolate. NO "bu defter", NO eyebrow, NO extra text.

RIGHT COLUMN (~58% width):
- Pixar 3D ${heroName} (face EXACTLY from FIRST reference photo / front cover), waving goodbye, other hand holding a colored crayon, joyful warm smile, ~70% frame height dominant portrait, golden-hour light
- Top-right corner: circular "DÜNYADA TEK BİR TANE" orange (#F4A261) rozet, ~10% frame width, ornament border, white text

CENTER-BOTTOM FOOTER:
- Logo from SECOND reference image — use AS-IS pixel-exact (do NOT redesign, do NOT stylize), ~8% frame width, centered
- Below logo: "www.masalsensin.com" small muted serif

STYLE:
- Cream→peach gradient bg (#FDF8F0 → #F5EFE6), paper texture, tasteful watercolor splashes at edges
- Pixar 3D character quality, Turkish diacritics (ş ç ğ ü ö ı İ) PERFECT
- Magazine-cover polish, not crowded

BOOK FORMAT: completely flat print-ready back cover — NO 3D mockup, NO page curl, NO bent corners, NO perspective. 2:3 portrait, full-bleed.

CRITICAL:
- Summary "${summaryText}" rendered LETTER-FOR-LETTER, "renklenmek için" appears EXACTLY ONCE
- Bookplate contains ONLY "${turkishPossessive(heroName)} Renk Günlüğü"
- Skill box contains EXACTLY the 4 bullets listed (no duplicates, no additions)
- Only ONE round badge: top-right DÜNYADA TEK
- No barcode, no ISBN, no price`;
}

function buildBoyamaBackCoverVerticalIcons(heroName, summary) {
  const summaryText = summary || `Her çocuğun kendine ait bir rengi, bir hikayesi vardır. Bu kitap ${turkishPossessive(heroName)} elinden renklenmek için hazırlandı.`;
  return `A PREMIUM PIXAR-STYLE PERSONALIZED COLORING BOOK BACK COVER — 2:3 portrait, elegant minimal layout with a vertical skill column on the right.

LEFT COLUMN (~42% width, top to bottom):
- Hand-lettered title "Senin Rengin, Senin Hikayen" (warm brown #3F2A1A, gold accent)
- Turkish summary (2-3 lines, rounded serif, chocolate): "${summaryText}"
- 4 horizontal CONTENT ICONS row + Turkish labels: 📖 16 Sayfa / 🌀 Mandala / 🗺️ Labirent / 🔍 Bul ve Boya
- Bottom-left: HORIZONTAL RECTANGULAR BOOKPLATE (cream #FBF6EC, warm-brown border, paintbrush+crayon cluster, single line "${turkishPossessive(heroName)} Renk Günlüğü" — no "bu defter", no eyebrow)

CENTER (~42% width):
- Pixar 3D ${heroName} (face EXACTLY from FIRST reference photo / front cover), waving goodbye, crayon in other hand, joyful, full-body ~75% frame height, golden-hour light

RIGHT COLUMN (~16% width, VERTICAL SKILL STACK, aligned with the character's mid-body):
- A slim vertical card (soft cream #FBF6EC, thin warm-brown frame, rounded) with 4 entries stacked top-to-bottom. Each entry: a tiny hand-drawn round icon + one Turkish word below in small bold serif chocolate.
    1. ❤️ Sevgi
    2. 🧠 Odaklanma
    3. 🎨 Yaratıcılık
    4. ✋ Koordinasyon
- Icons are flat warm-color illustrations, hand-drawn feel
- Tiny gold divider lines between entries
- Top of the card: small warm-brown eyebrow text "KAZANIM"

TOP-RIGHT CORNER (above skill stack):
- Circular "DÜNYADA TEK BİR TANE" orange (#F4A261) rozet, ~9% frame width, ornament border, white text

CENTER-BOTTOM FOOTER:
- Logo from SECOND reference image — use AS-IS pixel-exact (do NOT redesign, do NOT stylize), ~8% frame width, centered
- "www.masalsensin.com" small muted serif below

STYLE:
- Cream→peach gradient bg, paper texture, tasteful watercolor accents at edges
- Pixar 3D quality, Turkish diacritics (ş ç ğ ü ö ı İ) PERFECT
- 3-column rhythm (text / character / skill stack) — balanced

BOOK FORMAT: completely flat print-ready back cover — NO 3D mockup, NO page curl, NO perspective. 2:3 portrait, full-bleed.

CRITICAL:
- Summary "${summaryText}" rendered LETTER-FOR-LETTER, "renklenmek için" EXACTLY ONCE
- Bookplate ONLY says "${turkishPossessive(heroName)} Renk Günlüğü"
- Skill stack EXACTLY these 4 words: Sevgi, Odaklanma, Yaratıcılık, Koordinasyon
- Only ONE round badge: top-right DÜNYADA TEK
- No barcode, no ISBN, no price`;
}

async function generateBackCover(concept, frontCoverUrl, category) {
  const logoDataUrl = await loadLogoAsDataUrl();
  const { baslik, kahraman, ozet, kazanimlar } = concept;

  // Boyama branch — use A10/A11 randomized design (validated in masal)
  if (category?.group === "boyama") {
    const variants = [buildBoyamaBackCoverSkillbox, buildBoyamaBackCoverVerticalIcons];
    const pick = variants[Math.floor(Math.random() * variants.length)];
    const prompt = pick(kahraman.isim, ozet || "");
    const refs = logoDataUrl ? [frontCoverUrl, logoDataUrl] : [frontCoverUrl];
    const imageUrl = await generateImage(prompt, refs, "2:3");
    return { imageUrl, prompt };
  }

  // Meslek branch — diploma/certificate back cover (hero element = official diploma)
  if (category?.id === "meslek-hikayeleri") {
    const prompt = buildMeslekBackCoverDiploma(concept);
    const refs = logoDataUrl ? [frontCoverUrl, logoDataUrl] : [frontCoverUrl];
    const imageUrl = await generateImage(prompt, refs, "2:3");
    return { imageUrl, prompt };
  }

  // Hikaye / Özel Gün branch — original storybook back cover (unchanged below).

  // Each card's icon MUST be semantically chosen to match ITS kazanım text (not a fixed set)
  const kazanimGrid = kazanimlar.slice(0, 4).map((k, i) => {
    return `Card ${i + 1} — text: "${k}" — icon: [AI must choose an illustrated icon that VISUALLY REPRESENTS the meaning of this specific text. Examples: "arkadaşlık/paylaşım" → two small hearts or hands together; "cesaret" → a lion or shield; "hayal gücü/yaratıcılık" → a lightbulb with sparkles or a paintbrush; "öğrenme/merak" → an open book or magnifying glass; "sevgi/aile" → a glowing heart; "güç/dayanıklılık" → a flexed arm or mountain; "doğa sevgisi" → a leaf or tree; "özgüven" → a crown or star; "dostluk" → two clasped hands; "problem çözme" → a puzzle piece or key. Pick the MOST fitting one for THIS card's meaning.]`;
  }).join("\n");

  // Story summary — max 3 sentences
  // Truncate at last complete sentence within 250 chars (never end with "...")
  let summary = ozet;
  if (ozet.length > 250) {
    const cut = ozet.slice(0, 250);
    const lastPeriod = cut.lastIndexOf('.');
    summary = lastPeriod > 100 ? cut.slice(0, lastPeriod + 1) : cut.slice(0, 247) + '...';
  }

  const prompt = `CHILDREN'S STORYBOOK BACK COVER PAGE — 2:3 portrait format. COMPLETELY FLAT full-bleed print-ready back cover of a THIN FLEXIBLE A4 magazine-style paperback Turkish children's storybook (saddle-stitched soft cover, ~5mm thick max — NOT hardcover, NOT thick spine, NO embossed binding). The page sits STRAIGHT and RIGID — NO page curl, NO bent corners, NO curved edges, NO wavy paper, NO warp, NO perspective. If any corner bends or the page curves, the image is WRONG.

This is the REVERSE SIDE of the front cover shown in the reference image. Same book, same visual language, same art style.

LANGUAGE: ALL text on this page MUST be in TURKISH. Do NOT translate any Turkish text to English. Write EXACTLY as provided below.

HEADER (display this EXACT Turkish text): "Masal Bitti Ama İzleri Kaldı..."
Style: large elegant decorative bold font at top, warm brown color (#4E342E).

STORY SUMMARY (display this EXACT Turkish text):
"${summary}"
Style: elegant readable serif, dark brown (#5D4037), centered, max 3 lines.

SECTION HEADING (display this EXACT Turkish text): "NE ÖĞRENDİ?"
Style: bold playful display font, centered, warm orange (#E65100).

ACHIEVEMENTS (display as a 2×2 grid of 4 subtle rounded cards, ALL IN TURKISH). Each card has an illustrated icon that SEMANTICALLY MATCHES its Turkish text (NOT a fixed icon, NOT random — the icon must relate to what the text says). EACH CARD MUST HAVE A DIFFERENT ICON from the other 3 cards.

${kazanimGrid}

Style: each achievement in a subtle rounded card/frame with warm cream background and thin warm-brown border. Illustrated 3D-style icon on the LEFT of each card (~22% of card width), Turkish text on the RIGHT. Clean readable sans-serif (Nunito/DM Sans). Icons must be visually distinct AND meaningfully tied to their text. If any icon is unrelated to its card's text OR if two cards show the same icon, the image is WRONG.

FOOTER LINE (display this EXACT Turkish text): "Her çocuk kendi hikâyesinin kahramanıdır..."
Style: elegant italic warm script font, warm orange (#BF360C).

BRAND SECTION at very bottom (CRITICAL — use the SECOND reference image as the brand mark source):
- Reproduce the MasalSensin brand mark from the SECOND reference image centered at the bottom footer area, ~14-18% width of the page. Do NOT render the English word "LOGO" anywhere — only the actual brand artwork from the reference.
- The brand mark features an open storybook with a small castle and quill above, plus the cursive wordmark "Masalsensin" — reproduce this composition AS-CLOSE-AS-POSSIBLE to the reference (preserve castle + quill + open book + wordmark exactly as shown, pixel-faithful).
- Below the brand mark: small text "www.masalsensin.com" in elegant subtle serif
- Small personalization badge near the brand mark: "Bu kitap ${kahraman.isim} için özel olarak hazırlanmıştır ❤️"

CHARACTER: Same character from front cover as a small cute 3D illustration peeking from the bottom-left corner with a happy confident smile. The character must have the EXACT SAME face as in the front cover reference. Small and subtle, NOT dominating the page.

DESIGN:
- Soft warm cream to light peach gradient background
- Subtle themed watercolor decorations at edges (matching front cover theme)
- Clean, elegant, premium book quality
- Warm brown and orange color palette for text
- The achievements section has subtle card/frame around each item
- Gentle decorative vine/leaf borders at top and bottom edges

TYPOGRAPHY:
- Header "Masal Bitti...": large decorative bold serif, warm brown (#4E342E)
- Summary: elegant readable serif, dark brown (#5D4037)
- "NE ÖĞRENDİ?": bold playful display font, warm orange (#E65100)
- Achievement items: readable sans-serif with emoji icons
- Footer quote: elegant italic script, warm orange (#BF360C)
- Turkish characters (ş ç ğ ü ö ı İ) MUST be PERFECT — do NOT replace with ASCII
- Brand: small elegant serif

ART STYLE: Premium children's book back cover. Clean, warm, professional. Mix of elegant typography and minimal 3D character illustration. Text and achievements are the STARS — not the character.

Title reference: "${baslik}"`;

  const refs = logoDataUrl ? [frontCoverUrl, logoDataUrl] : [frontCoverUrl];
  const imageUrl = await generateImage(prompt, refs, "2:3");
  return { imageUrl, prompt };
}

module.exports = { BOOK_FORMAT_DIRECTIVE, generateCoverImage, generateBackCover };
