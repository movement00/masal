// MasalSensin — personalized coloring book writer.
// Generates a world-class B/W line-art coloring book bundle, scoped to category "boyama".
// Independent of story-writer.js to avoid touching the hikaye flow.

const { GoogleGenAI } = require("@google/genai");
const config = require("../config");

// Page counts per age — a real coloring book is ~16-24 pages
const SCENE_COUNTS = { "0-3": 12, "3-6": 16, "6-9": 20 };

// Turkish possessive (-nın/-in etc.) with vowel-harmony and buffer-n for vowel-ending names.
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

// Line-art complexity rules per age (directly affects image prompt complexity)
const LINE_RULES = {
  "0-3": {
    stroke: "VERY thick bold outlines (4-6px equivalent), simple large shapes",
    complexity: "simple, chunky, large coloring areas, minimal inner detail, 1-2 focal objects per page",
    activity: "basic — point/name, no finding, no mazes yet",
    vocabularyNote: "tek kelime ya da 1 kısa cümle per sayfa (örn. 'Köpek!', 'Minik Ayı Uyuyor.')",
  },
  "3-6": {
    stroke: "thick bold outlines (2.5-3.5px equivalent), clean clear shapes",
    complexity: "medium detail, some decorative patterns (polka dots, stars, flowers) but large coloring areas dominant",
    activity: "light — count-to-5 prompts, find-and-color instructions, connect 2-3 dots",
    vocabularyNote: "1-2 kısa cümle per sayfa, çocuğu oyuna davet eden ton ('Bak! Kaç kelebek var?')",
  },
  "6-9": {
    stroke: "medium outlines (1.5-2.5px equivalent), crisp defined lines",
    complexity: "detailed patterns, intricate decorations, mandala-like elements possible, finer inner detail",
    activity: "rich — mazes, counting to 10, find-5-differences, connect-the-dots, mandala coloring",
    vocabularyNote: "2-3 cümle per sayfa, meraka davet eden 'Hadi …' ifadeleriyle",
  },
};

const COMMON_STYLE_TOKENS = "Clean professional black and white line art coloring book page — pure black ink lines on pure white background, NO shading, NO gradients, NO gray tones, NO color fills, NO cross-hatching. Print-ready 300dpi A4 portrait, flat 2D line work, children's coloring book style.";

function makeClient() {
  const key = config.google.apiKey;
  if (!key) throw new Error("GOOGLE_API_KEY yok — .env dosyasını kontrol edin");
  return new GoogleGenAI({ apiKey: key });
}

async function generateText(ai, prompt, opts = {}) {
  const model = opts.model || "gemini-2.5-flash";
  const res = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      temperature: opts.temperature ?? 0.85,
      maxOutputTokens: opts.maxTokens || 4096,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  return res.text || "";
}

function extractJson(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const first = candidate.indexOf("{");
  const firstArr = candidate.indexOf("[");
  const start = first < 0 ? firstArr : (firstArr < 0 ? first : Math.min(first, firstArr));
  if (start < 0) throw new Error("JSON bulunamadı: " + text.slice(0, 400));
  const open = candidate[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0, end = -1, inStr = false, esc = false;
  for (let i = start; i < candidate.length; i++) {
    const c = candidate[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') inStr = !inStr;
    if (inStr) continue;
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) throw new Error("JSON kapanışı bulunamadı");
  return JSON.parse(candidate.slice(start, end + 1));
}

// Build the final image-gen prompt for one scene (age-aware B/W line art, single-page layout with title+text+mini colored thumbnail)
function buildScenePrompt({ ageGroup, heroName, physicalFeatures, sceneDesc, heroInvolved, isAnimalStory, sceneTitle, sceneText, activityHint }) {
  const rules = LINE_RULES[ageGroup];
  const charLine = heroInvolved
    ? `A child with the EXACT same facial features as the FIRST reference photo — ${heroName}, Turkish child${physicalFeatures ? ` (physical features that MUST be preserved: ${physicalFeatures})` : ""}. The child's face, hair, skin tone, eye color, and any distinguishing feature MUST match the FIRST reference photo exactly across all pages of this book — NO face drift between pages, NO made-up features. The child is performing: ${sceneDesc}.`
    : isAnimalStory
      ? `${sceneDesc}. Cute animal character, child-friendly expressive proportions.`
      : sceneDesc;

  const escText = (sceneText || "").trim().slice(0, 260);

  return `⚠️ RENDERING MODE OVERRIDE: This is a children's COLORING BOOK PAGE — MOSTLY 2D black-and-white line art with ONE small full-color corner element. Any reference to "3D Pixar" in other context blocks applies ONLY to FACIAL IDENTITY matching (face must look like the reference child). The main scene rendered output MUST be FLAT 2D black ink on white paper, NO color fills in the main scene, NO shading on the main scene, NO 3D volume on the main scene.

⚠️ FULL-BLEED PAGE — NO MOCKUP: The entire frame IS the coloring page. Do NOT render the page sitting on a desk, table, or inside a bedroom / room. Do NOT show hands holding the page. Do NOT show a 3D book or magazine with this page inside. Do NOT show a crayon on top of the page. Pure flat A4 coloring-book page, full-bleed, edge-to-edge, as if scanned flat.

⚠️ OUTFIT CONSISTENCY: If an outfit reference image is attached (SECOND reference), the child MUST wear EXACTLY that outfit — same colors, same patterns, same accessories. Do NOT improvise clothes, do NOT draw a superhero cape, costume, or other variation.

PAGE LAYOUT (single A4 portrait page, 2:3):

TOP 15% — TITLE BAR:
- Large playful hand-lettered Turkish title in THICK BOLD BLACK LINE ART (no color fill, empty inside letters so child can color). Word: "${sceneTitle}"
- Small decorative line-art flourishes around the title (stars, swirls, flowers)

MIDDLE 60% — MAIN SCENE (this is what the child colors):
${charLine}
- Rendered as flat 2D black-and-white line art
- ${rules.stroke}
- ${rules.complexity}
- Large open white areas intentionally left for coloring in — ALL shapes are HOLLOW OUTLINES, no solid black silhouettes, no pre-filled animals, no pre-shaded areas
- NO color, NO shading, NO gray — pure black ink on white

BOTTOM 20% — NARRATION TEXT:
Exact Turkish text below the scene, in friendly HAND-LETTERED STYLE LINE ART (letters have thick outlines with hollow interiors so the child can color the letters too):
"${escText}"
${activityHint ? `\nAnd below that a small playful activity hint in smaller line-art lettering: "${activityHint}"` : ""}
Turkish characters (ç ş ğ ü ö ı İ) MUST be rendered with PERFECT letter shapes — every dot, every cedilla, every tilde exactly right. No substitutions, no accent confusions (Ç ≠ A with hat).

CORNER MINI COLORED GUIDE (bottom-right ~15% × 15%, small square):
- A tiny FULL-COLOR mini preview of the SAME scene as a coloring-guide thumbnail
- Soft watercolor-style colors (not Pixar 3D), thin white border frame
- Small label below it in line-art lettering: "Örnek renk"
- This is the ONLY colored element on the page — everything else is pure B/W line art

ABSOLUTE RULES:
- ${COMMON_STYLE_TOKENS}
- Single A4 portrait page — full-bleed, no spread, NO mockup wrapper
- 95% of the page is pure B/W line art. Only the tiny corner guide has color.
- All shapes HOLLOW — no solid black fills or silhouettes in the scene
- Face + outfit EXACT match to references across all pages (no drift, no improvised outfits)
- No signature, no watermark, no page number visible`;
}

function buildCoverPrompt({ heroName, physicalFeatures, theme, coverSceneDesc, ageGroup, pageCount }) {
  const isSimple = ageGroup === "0-3" || ageGroup === "3-6";
  const title = theme || `${turkishPossessive(heroName)} Boyama Kitabı`;
  const sceneContext = coverSceneDesc || "a friendly themed setting";
  return `A PREMIUM PIXAR-STYLE PERSONALIZED CHILDREN'S COLORING BOOK COVER — 2:3 portrait format. The ENTIRE cover is rendered in FULL 3D PIXAR / ICE AGE CGI quality (cinematic, premium, ultra-detailed). NOT 2D illustration. NOT flat cartoon. This is a COLORING BOOK cover — but the FRONT COVER itself is a vibrant full-color Pixar render. The INSIDE pages will be black-and-white line art, but the cover is rich color.

═══ COLORING BOOK SIGNALS (must scream "boyama kitabı") ═══
1) BIG bold "BOYAMA KİTABI" badge prominently below the title — chunky playful 3D-rendered letters, colorful (rainbow gradient), drop-shadow, slightly tilted ribbon-style banner. THIS IS THE KEY VISUAL SIGNAL.
2) ${heroName} actively holds a HUGE OVERSIZED colorful crayon (or fan of crayons) in one hand, prominently visible — like a magic wand of color
3) An open coloring sheet or sketchbook visible in the scene (B/W lines on the page, partially visible) — hint of "what's inside"
4) Around the character: scattered fully-rendered 3D crayons, paint tubes, color pencils, paint splashes (rendered with Pixar shading)
5) Background: scene context — ${sceneContext} — warm golden-hour lighting

═══ HERO CHARACTER ═══
${heroName}, a Turkish child${physicalFeatures ? ` (physical features MUST be preserved: ${physicalFeatures})` : ""}, face EXACTLY matches reference photo, Pixar-stylized eyes/proportions.
- The child is JOYFUL and focused, slightly energetic but CALMLY focused on coloring. NOT in adventure pose — in coloring play pose.

═══ TITLE TYPOGRAPHY ═══
Main title: "${title}" — large playful hand-lettered Turkish decorative 3D-rendered font, each word a slightly different warm color (gold, coral, rose, orange). Title appears EXACTLY ONCE, at the TOP of the cover.

Right below the title: "BOYAMA KİTABI" big bold rainbow banner badge, chunky rounded hand-lettered font.

═══ BOTTOM-LEFT PERSONALIZATION SEAL ═══
A beautiful gold-foil circular seal (#D4A574) with subtle emboss effect, ~14-18% frame width.
Inside the seal Turkish text: "Bu kitap ${heroName} için özel üretilmiştir"
Small decorative laurel/ornament around the seal edge. Feels like a quality certification stamp — makes the book feel PREMIUM.

NO bottom info strip, NO "${pageCount || 16} Sayfa / ${ageGroup || "3-6"} Yaş" text anywhere — ONLY the personalized seal at the bottom-left corner.

═══ TURKISH CHARACTERS (CRITICAL) ═══
"${title}" spelled EXACTLY letter by letter.
- ı (dotless i) ≠ i | İ (dotted cap I) ≠ I | ş ≠ s | ç ≠ c | ğ ≠ g | ö ≠ o | ü ≠ u
- Mixed case as provided. "Macerası" NOT "MACERASI"

═══ STYLE ═══
- Full Pixar/Ice Age 3D CGI render quality — subsurface scattering, volumetric lighting, hyper-detailed textures, photorealistic fabric folds, cinematic depth
- Saturated warm color palette (gold, orange, soft green/blue backdrop, warm cream accents)
- 3-layer depth: foreground crayons + midground character + background setting
- Premium feel — magazine cover quality
${isSimple ? "- Age 0-6 adaptation: chunkier shapes, simpler background, softer colors, gentler expression" : "- Age 6-9+ adaptation: richer scene detail, more decorative elements, slightly more complex environment"}

═══ BOOK FORMAT (CRITICAL — read carefully) ═══
- This is a THIN FLEXIBLE PAPERBACK — magazine-style, saddle-stitched. NOT a hardcover. NOT a thick spine. NO embossed raised letters.
- Show as COMPLETELY FLAT print-ready cover page (2:3 portrait). NO 3D mockup, NO page curl, NO bent corners, NO curved edges, NO wavy paper, NO warp, NO perspective. The cover must sit STRAIGHT and RIGID as if scanned flat.

═══ CRITICAL ═══
- Turkish diacritics (ş ç ğ ü ö ı İ) PERFECT
- Title appears EXACTLY ONCE
- "BOYAMA KİTABI" badge appears EXACTLY ONCE
- No barcode, no price, no ISBN, no publisher strip
- Do NOT include any adventure-pose character (running, jumping, flying) — character must be CALMLY coloring
- The visual screams "coloring book" but maintains Pixar-3D premium quality`;
}

function buildBackCoverPromptSkillbox({ heroName, summary }) {
  const safeSummary = summary || `Her çocuğun kendine ait bir rengi, bir hikayesi vardır. Bu kitap ${turkishPossessive(heroName)} elinden renklenmek için hazırlandı.`;
  return `A PREMIUM PIXAR-STYLE PERSONALIZED COLORING BOOK BACK COVER — 2:3 portrait, warm cream magazine feel.

LEFT COLUMN (~42% width, top to bottom):
- Hand-lettered title "Senin Rengin, Senin Hikayen" (warm brown #3F2A1A, gold accent, decorative flourish)
- Turkish summary (2-3 lines, rounded serif, chocolate #3E2723): "${safeSummary}"
- 4 horizontal CONTENT ICONS row (small, rounded, warm tones) with Turkish labels underneath: 📖 16 Sayfa / 🌀 Mandala / 🗺️ Labirent / 🔍 Bul ve Boya
- BELOW THE 4 ICONS: a framed "KAZANIMLAR KUTUSU" — soft cream panel (#FBF6EC) with thin warm-brown border and rounded corners, small "BU KİTAP NE KAZANDIRIR?" eyebrow heading in warm-brown small caps. Inside, 4 bullet lines, each with a tiny icon (heart / brain / palette / stopwatch-hand) + Turkish skill text, bold serif chocolate:
      • El-göz koordinasyonu
      • Yaratıcılık ve renk algısı
      • Sabır ve odaklanma
      • Hayal gücü
  Clean, airy spacing, no clutter.
- Bottom-left: HORIZONTAL RECTANGULAR BOOKPLATE LABEL (cream #FBF6EC, thin warm-brown border, rounded corners, paintbrush+crayon icon cluster on the left). Single line text inside: "${turkishPossessive(heroName)} Renk Günlüğü" — bold serif chocolate. NO "bu defter", NO eyebrow, NO extra text.

RIGHT COLUMN (~58% width):
- Pixar 3D ${heroName} (Turkish child, face EXACTLY from FIRST reference photo), waving goodbye, other hand holding a colored crayon, joyful warm smile, ~70% frame height dominant portrait, golden-hour light
- Top-right corner: circular "DÜNYADA TEK BİR TANE" orange (#F4A261) rozet, ~10% frame width, ornament border, white text

CENTER-BOTTOM FOOTER:
- MASALSENSIN LOGO (REPRODUCE IMAGE AS-IS): The SECOND reference image attached is the MasalSensin logo (castle + open storybook + quill + "Masalsensin" wordmark). You MUST place this logo AS-IS — do NOT redesign, do NOT stylize, do NOT replace it with only the word "Masalsensin" as text. The actual graphic (castle + storybook + quill + wordmark) must be visible, centered, ~10% frame width. If you render only the wordmark without the graphic, the image is WRONG.
- Below logo: "www.masalsensin.com" small muted serif

STYLE:
- Cream→peach gradient bg (#FDF8F0 → #F5EFE6), paper texture, tasteful watercolor splashes at edges
- Pixar 3D character quality, Turkish diacritics (ş ç ğ ü ö ı İ) PERFECT
- Magazine-cover polish, not crowded

CRITICAL:
- Summary "${safeSummary}" rendered LETTER-FOR-LETTER, "renklenmek için" appears EXACTLY ONCE
- Bookplate contains ONLY "${turkishPossessive(heroName)} Renk Günlüğü"
- Skill box contains EXACTLY the 4 bullets listed (no duplicates, no additions)
- Only ONE round badge: top-right DÜNYADA TEK
- 2:3 portrait, no barcode/ISBN/price`;
}

function buildBackCoverPromptVerticalIcons({ heroName, summary }) {
  const safeSummary = summary || `Her çocuğun kendine ait bir rengi, bir hikayesi vardır. Bu kitap ${turkishPossessive(heroName)} elinden renklenmek için hazırlandı.`;
  return `A PREMIUM PIXAR-STYLE PERSONALIZED COLORING BOOK BACK COVER — 2:3 portrait, elegant minimal layout with a vertical skill column on the right.

LEFT COLUMN (~42% width, top to bottom):
- Hand-lettered title "Senin Rengin, Senin Hikayen" (warm brown #3F2A1A, gold accent)
- Turkish summary (2-3 lines, rounded serif, chocolate): "${safeSummary}"
- 4 horizontal CONTENT ICONS row + Turkish labels: 📖 16 Sayfa / 🌀 Mandala / 🗺️ Labirent / 🔍 Bul ve Boya
- Bottom-left: HORIZONTAL RECTANGULAR BOOKPLATE (cream #FBF6EC, warm-brown border, paintbrush+crayon cluster, single line "${turkishPossessive(heroName)} Renk Günlüğü" — no "bu defter", no eyebrow)

CENTER (~42% width):
- Pixar 3D ${heroName} (face EXACTLY from FIRST reference photo), waving goodbye, crayon in other hand, joyful, full-body ~75% frame height, golden-hour light

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
- MASALSENSIN LOGO (REPRODUCE IMAGE AS-IS): The SECOND reference image attached is the MasalSensin logo (castle + open storybook + quill + "Masalsensin" wordmark). You MUST place this logo AS-IS — do NOT redesign, do NOT stylize, do NOT replace it with only the word "Masalsensin" as text. The actual graphic (castle + storybook + quill + wordmark) must be visible, centered, ~10% frame width. If you render only the wordmark without the graphic, the image is WRONG.
- "www.masalsensin.com" small muted serif below

STYLE:
- Cream→peach gradient bg, paper texture, tasteful watercolor accents at edges
- Pixar 3D quality, Turkish diacritics (ş ç ğ ü ö ı İ) PERFECT
- 3-column rhythm (text / character / skill stack) — balanced

CRITICAL:
- Summary "${safeSummary}" rendered LETTER-FOR-LETTER, "renklenmek için" EXACTLY ONCE
- Bookplate ONLY says "${turkishPossessive(heroName)} Renk Günlüğü"
- Skill stack EXACTLY these 4 words: Sevgi, Odaklanma, Yaratıcılık, Koordinasyon
- Only ONE round badge: top-right DÜNYADA TEK
- 2:3 portrait, no barcode/ISBN/price`;
}

function buildBackCoverPrompt({ heroName, summary, ageGroup, pageCount }) {
  const variants = [buildBackCoverPromptSkillbox, buildBackCoverPromptVerticalIcons];
  const pick = variants[Math.floor(Math.random() * variants.length)];
  return pick({ heroName, summary, ageGroup, pageCount });
}

function buildMandalaPrompt({ ageGroup, theme }) {
  const rules = LINE_RULES[ageGroup];
  const ringSpec = ageGroup === "0-3"
    ? "ONE single big flower-like simple central shape (no rings) — VERY LARGE, chunky, easy for toddlers"
    : ageGroup === "3-6"
      ? "3 concentric rings ONLY, each ring with simple friendly shapes (flowers, stars, hearts, suns) — LARGE, kid-friendly, wide open areas"
      : "5 concentric rings with varying paisley / leaf-vein / petal / star patterns — richly detailed, for older kids";
  const cornerSpec = ageGroup === "0-3"
    ? "no corner elements"
    : ageGroup === "3-6"
      ? "one big simple shape (star / heart) in each corner"
      : "detailed paisley flourishes in each corner";
  return `A ${ageGroup === "6-9" ? "BEAUTIFUL" : "SIMPLE FRIENDLY"} MANDALA COLORING PAGE for ${ageGroup} age group. 2:3 portrait (A4).

⚠️ FULL-BLEED PAGE — NO MOCKUP: The entire frame IS the mandala page. Do NOT show the page on a desk, table, or in a bedroom. Do NOT render a 3D mockup. Do NOT put a character / child next to the page. Pure flat A4 coloring page, edge-to-edge, as if scanned flat.

⚠️ ALL ELEMENTS MUST BE HOLLOW LINE-ART: Every shape (including any animal silhouette, flower, leaf) is a HOLLOW OUTLINE. No solid black fills anywhere on the page. No pre-shaded areas. No silhouettes. Every element is an outline ready to be colored.

COMPOSITION:
- ${ageGroup === "0-3" ? "A SINGLE large central shape" : "Perfectly symmetric radial mandala"} centered on the page, ~80% page height
- Theme-inspired motifs: ${theme ? `elements from "${theme}" (stylized — flowers, leaves, stars, suns, hearts; IF animal motifs are used, they must be OUTLINE-ONLY, never solid silhouettes)` : "flowers, leaves, stars, hearts, sun, moon — all outline"}
- ${ringSpec}
- Corners: ${cornerSpec}
- Below the mandala, subtitle in line-art hand-lettering: "Kendi Renklerinle Tamamla"

STYLE:
- ${rules.stroke}
- ${COMMON_STYLE_TOKENS}
- Balance: ${ageGroup === "0-3" ? "VERY LARGE simple areas only (for chunky markers)" : ageGroup === "3-6" ? "large areas dominant, a few smaller accents" : "mix of large and fine areas"}
- No text inside the mandala itself
- No watermark, no 3D mockup, no real-life background`;
}

function buildFindAndCountPrompt({ ageGroup, theme, heroName }) {
  const rules = LINE_RULES[ageGroup];
  const activitySpec = ageGroup === "0-3"
    ? "COUNTING activity: 3 identical LARGE simple shapes (e.g. 3 big suns, or 3 big apples) placed clearly around a single central character. Instruction: 'Kaç tane var? Hadi sayalım!' Big open shapes for coloring."
    : ageGroup === "3-6"
      ? "FIND activity: hide 3 DIFFERENT items in the scene (3 butterflies, 2 stars, 1 flower), each LARGE and easy to spot. Side-bar at top lists them with icons: 'Bul ve Boya: 🦋 3 kelebek / ⭐ 2 yıldız / 🌸 1 çiçek'. Scene should be simple, not overwhelming."
      : "FIND activity: hide 5 different items (5 butterflies, 3 stars, 2 flowers, 4 birds, 1 key). Side-bar with icon+count. Rich scene, many coloring areas.";
  return `A "${ageGroup === "0-3" ? "COUNT AND COLOR" : "FIND AND COLOR"}" activity page — 2:3 portrait (A4).

⚠️ FULL-BLEED PAGE — NO MOCKUP: The entire frame IS the activity page. Do NOT show the page on a desk, table, or with a 3D character posed next to it. Flat scan only.

⚠️ ALL SHAPES HOLLOW LINE-ART: Every hidden object and background element is a pure OUTLINE. No solid black fills, no pre-shaded silhouettes, no gray tones.

⚠️ HERO FACE MATCH: If ${heroName} appears in the scene, their face, hair, eye color and features must EXACTLY match the FIRST reference photo — no drift between pages.

SCENE: a ${ageGroup === "0-3" ? "simple clean" : ageGroup === "3-6" ? "clear friendly" : "richly detailed"} line-art illustration featuring ${heroName} in a ${theme ? `"${theme}" themed` : "garden / park"} environment.

${activitySpec}

STYLE:
- ${rules.stroke}
- ${COMMON_STYLE_TOKENS}
- Letters in the side-bar list are hand-lettered in LINE ART FONT (hollow letters child can color)
- Each hidden object is LARGE enough for the child to color easily
- No mockup, no 3D room, no desk — pure flat A4 coloring page`;
}

function buildMazePrompt({ ageGroup, heroName }) {
  const rules = LINE_RULES[ageGroup];
  return `A MAZE PUZZLE page for a coloring book — 2:3 portrait (A4).

⚠️ FULL-BLEED PAGE — NO MOCKUP: The entire frame IS the maze page. Do NOT show the page on a desk, table, or a character standing beside it. Full-bleed, edge-to-edge, flat scan.

⚠️ SOLVABLE MAZE — CRITICAL: The maze MUST have a CONTINUOUS, CLEARLY-SOLVABLE path from the START to the END. NO dead-end-only maze, NO disconnected regions. The path from entrance to exit must be walkable without jumping walls.

STRUCTURE:
- A clear maze taking ~70% of the page area, printed in thick line art
- START point at the TOP-LEFT CORNER of the maze, clearly marked with the Turkish label "BAŞLANGIÇ" + a small inbound arrow. Next to the START label, place a small hollow line-art portrait of ${heroName} (head-and-shoulders, same face as reference photo — hair, eyes, features matching the child). The character should be at the START, not floating outside the maze.
- END point at the BOTTOM-RIGHT CORNER, clearly marked with the Turkish label "FİNİŞ" + a themed goal (star / treasure / heart, hollow line-art)
- Maze walls are thick line-art; corridors are visibly wide enough to trace with a finger
- Complexity: ${ageGroup === "0-3" ? "very simple ~6 turns, solvable at a glance" : ageGroup === "3-6" ? "simple but fun, ~10-12 turns, clearly one correct path" : "richer ~20 turns with a few dead-ends, but ONE continuous solvable main path"}
- A small decorative border around the maze (stars, arrows) — hollow line art
- Above the maze: instruction "${heroName}, Hedefe Giden Yolu Bul ve Boya!" in playful line-art font (child colors the letters too)
- Below the maze: reward stamp "Sen Başardın!" (hollow line art)

CRITICAL:
- The maze itself MUST render with pure line-art walls (no black fills)
- BAŞLANGIÇ and FİNİŞ labels are rendered as crisp Turkish text (correct diacritics)
- ${heroName}'s portrait at START is a small line-art sticker — matches reference photo's face
- No real 3D mockup / room background / desk — pure flat coloring page

STYLE:
- ${rules.stroke}
- ${COMMON_STYLE_TOKENS}`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN WORKFLOW
// ─────────────────────────────────────────────────────────────────────────────

async function brainstormColoring({ ai, ageGroup, theme, heroName, lessons }) {
  const rules = LINE_RULES[ageGroup];
  const prompt = `Sen dünya standartlarında bir çocuk boyama kitabı yazarısın — 5 FARKLI BOYAMA KİTABI FİKRİ üret.

Yaş grubu: ${ageGroup}
Kahraman adı: ${heroName}
Tema isteği: ${theme || "serbest — sen seç"}
Hedef kazanımlar: ${(lessons || []).join(", ") || "yaratıcılık, renk bilgisi, hayal gücü"}

Yaş bandı kuralları:
- Çizgi: ${rules.stroke}
- Kompleksite: ${rules.complexity}
- Aktivite: ${rules.activity}
- Metin: ${rules.vocabularyNote}

HER FİKİR için:
- baslik (Türkçe, 2-5 kelime, oyuncu bir ton — örn. "Minik Dinozor Miko", "Pati ve Sihirli Bahçe")
- ozet (2-3 cümle — kitabın genel atmosferi, ana karakterle kahraman ilişkisi)
- tema_evreni (orman / uzay / deniz / şehir / peri diyarı / hayvanat bahçesi / spor / müzik / yemek gibi)
- kahraman_rolu ("başkahraman" / "yardımcı arkadaş" / "gözlemci" — boyama kitabında çocuk ne rol oynuyor)

5 fikri JSON dizisi olarak ver:
[{"baslik":"...","ozet":"...","tema_evreni":"...","kahraman_rolu":"..."}, ...]`;

  const text = await generateText(ai, prompt, { temperature: 0.95, maxTokens: 2048 });
  const ideas = extractJson(text);
  if (!Array.isArray(ideas) || ideas.length < 3) throw new Error("Brainstorm: 5 fikir üretmedi");
  return ideas;
}

async function selectBestColoring({ ai, ideas, ageGroup, theme, heroName }) {
  const prompt = `Aşağıdaki 5 boyama kitabı fikrinden ${ageGroup} yaş grubu ve "${theme || "serbest"}" için EN UYGUNUNU seç.
Kriter: yaş uygunluğu, ${heroName} kahramanıyla eğlenceli bağ, orijinallik, boyamaya uygun sahne çeşitliliği.

Fikirler:
${JSON.stringify(ideas, null, 2)}

JSON cevap: {"secilen_index": 0-4, "gerekce": "bir iki cümle"}`;
  const text = await generateText(ai, prompt, { temperature: 0.3 });
  const result = extractJson(text);
  const idx = Math.max(0, Math.min(4, result.secilen_index ?? 0));
  return { selected: ideas[idx], reason: result.gerekce };
}

async function expandColoring({ ai, idea, ageGroup, heroName, heroAge, heroGender, lessons }) {
  const rules = LINE_RULES[ageGroup];
  const sceneCount = SCENE_COUNTS[ageGroup];
  const genderTr = heroGender === "kiz" ? "kız" : "erkek";
  // Reserve last 3 slots for special pages: activity-find, activity-maze, mandala-closing
  const regularScenes = sceneCount - 3;

  const prompt = `Sen dünya standartlarında bir çocuk boyama kitabı yazarısın. Bir Türk çocuk için kişiye özel boyama kitabı üreteceksin.

KİTAP:
Başlık: ${idea.baslik}
Özet: ${idea.ozet}
Tema evreni: ${idea.tema_evreni}
Kahraman rolü: ${idea.kahraman_rolu}

KAHRAMAN: ${heroName}, ${heroAge} yaşında Türk ${genderTr} çocuk
YAŞ BANDI: ${ageGroup}
SAHNE SAYISI: ${regularScenes} normal sahne + 3 özel sayfa (aktivite-bul, labirent, mandala) = ${sceneCount} toplam
METİN KURALLARI: ${rules.vocabularyNote}
AKTİVİTE ENTEGRASYONU: ${rules.activity}
KAZANIMLAR: ${(lessons || []).join(", ")}

${regularScenes} NORMAL SAHNE YAZ — her sahne:
- title: 2-4 kelime Türkçe (örn. "Miko Uyandı", "Güneş Doğdu")
- text: ${rules.vocabularyNote} — {CHILD_NAME} yerine ${heroName} adı max 1 kez, akıcı basit Türkçe
- mood: dreamy / playful / joyful / curious / peaceful / adventurous
- setting: mekan (Türkçe 1 kısa cümle)
- action: İngilizce tek satır — sahnede ne oluyor (AI image prompt için detay)
- hero_involved: true/false — bu sahnede çocuk karakter görsel olarak var mı
- activity_hint (opsiyonel): sayfada çocuğa küçük bir etkileşim daveti — "Kaç yaprak say", "Kelebeği bul ve mor renge boya", "Güneşi sarıya boya" gibi — Türkçe, çocuğa hitap

AKTİVİTE DAĞILIMI: ${rules.activity}. Her sahneye etkinlik zorunlu değil — ${ageGroup === "0-3" ? "çoğunda yok, 1-2 sahnede basit" : ageGroup === "3-6" ? "sahnelerin yarısında küçük aktivite" : "neredeyse her sahnede bir etkileşim"}.

AYRICA:
- cover_action: kahramanın kapak aksiyonu (İngilizce 1 satır — örn. "holding a giant crayon happily, surrounded by scattered colorful pencils")
- cover_scene_desc: kapak sahnesi ortamı (İngilizce, renkli kapak için)
- back_cover_summary: 2-3 cümle Türkçe sıcak kapanış
- theme_primary_color, theme_secondary_color, theme_accent_color (hex)
- theme_icon (tek emoji)
- interactive_find_subject: "bul" sayfasının teması (örn. "parktaki gizli kelebekler ve çiçekler")
- maze_goal: labirent hedefi (örn. "en büyük çilek, hazineli sandık, minik kedi")
- mandala_motif: mandala temasına uygun motifler (örn. "orman hayvanları stilize", "yıldızlar ve aylar")

ÇIKTI TAM olarak şu JSON:
{
  "title": "${idea.baslik}",
  "description": "...",
  "scenes": [{"title":"","text":"","mood":"","setting":"","action":"","hero_involved":true,"activity_hint":""}],
  "cover_action": "",
  "cover_scene_desc": "",
  "back_cover_summary": "",
  "theme": { "primaryColor": "#RRGGBB", "secondaryColor": "#RRGGBB", "accentColor": "#RRGGBB", "icon": "🎨" },
  "interactive_find_subject": "",
  "maze_goal": "",
  "mandala_motif": ""
}
Sadece JSON, başka metin yok.`;

  const text = await generateText(ai, prompt, { temperature: 0.85, maxTokens: 12288 });
  const data = extractJson(text);
  if (!Array.isArray(data.scenes) || data.scenes.length < 4) {
    throw new Error(`Sahne sayısı yetersiz: en az 4 bekleniyor, gelen: ${data.scenes?.length}`);
  }
  // Accept variance — AI sometimes returns more/less than requested; clip to regularScenes
  if (data.scenes.length > regularScenes) data.scenes = data.scenes.slice(0, regularScenes);
  return data;
}

async function writeColoringBook({ ageGroup, theme, heroName, heroAge, heroGender, lessons, physicalFeatures, onProgress }) {
  if (!SCENE_COUNTS[ageGroup]) throw new Error(`Desteklenmeyen yaş grubu: ${ageGroup} (0-3 | 3-6 | 6-9)`);
  const ai = makeClient();
  const progress = onProgress || (() => {});

  progress({ step: 1, message: "Boyama kitabı fikirleri düşünülüyor..." });
  const ideas = await brainstormColoring({ ai, ageGroup, theme, heroName, lessons });

  progress({ step: 2, message: "En iyi fikir seçiliyor..." });
  const { selected, reason } = await selectBestColoring({ ai, ideas, ageGroup, theme, heroName });

  progress({ step: 3, message: `Seçilen: "${selected.baslik}" — sahneler yazılıyor...` });
  const expanded = await expandColoring({ ai, idea: selected, ageGroup, heroName, heroAge, heroGender, lessons });

  progress({ step: 4, message: "Özel sayfalar ekleniyor (bul, labirent, mandala)..." });

  // Build scene list: regular scenes + 3 special pages (find, maze, mandala)
  const regularSceneObjs = expanded.scenes.map((s, i) => ({
    sceneNumber: i + 1,
    title: s.title,
    text: s.text,
    mood: s.mood,
    setting: s.setting,
    action: s.action,
    activity_hint: s.activity_hint || "",
    hero_involved: s.hero_involved !== false,
    prompt: buildScenePrompt({
      ageGroup,
      heroName,
      physicalFeatures,
      sceneDesc: s.action,
      heroInvolved: s.hero_involved !== false,
      isAnimalStory: selected.tema_evreni && /hayvan/i.test(selected.tema_evreni),
      sceneTitle: s.title,
      sceneText: (s.text || "").replace(/\{CHILD_NAME\}/g, heroName),
      activityHint: s.activity_hint || "",
    }),
  }));

  const specialSceneObjs = [
    {
      sceneNumber: regularSceneObjs.length + 1,
      title: "Gizli Şeyleri Bul!",
      text: `${heroName}, bu sayfada ${expanded.interactive_find_subject || "5 gizli şeyi"} bulup istediğin renklerle boyayabilirsin.`,
      mood: "playful",
      setting: "etkinlik sayfası",
      action: "find-and-count activity page",
      activity_hint: `5 farklı öğe bul ve boya`,
      hero_involved: true,
      isSpecial: true,
      specialType: "find",
      prompt: buildFindAndCountPrompt({ ageGroup, theme: expanded.interactive_find_subject, heroName }),
    },
    {
      sceneNumber: regularSceneObjs.length + 2,
      title: "Labirent Macerası",
      text: `Yolu bul ve ilerlerken çizdiğin çizgiyi renklendir.`,
      mood: "adventurous",
      setting: "labirent",
      action: "maze puzzle page",
      activity_hint: `Başlangıçtan ${expanded.maze_goal || "hedefe"} git`,
      hero_involved: false,
      isSpecial: true,
      specialType: "maze",
      prompt: buildMazePrompt({ ageGroup, heroName }),
    },
    {
      sceneNumber: regularSceneObjs.length + 3,
      title: "Kendi Mandalan",
      text: `Bu mandalayı istediğin renklerle doldur. Senin stilin, senin kitabın.`,
      mood: "peaceful",
      setting: "kapanış",
      action: "closing mandala page",
      activity_hint: "Tüm bölgeleri renklendir",
      hero_involved: false,
      isSpecial: true,
      specialType: "mandala",
      prompt: buildMandalaPrompt({ ageGroup, theme: expanded.mandala_motif || selected.tema_evreni }),
    },
  ];

  const allScenes = [...regularSceneObjs, ...specialSceneObjs];
  const id = "boyama-" + Date.now() + "-" + heroName.toLowerCase().replace(/[^a-z0-9]/g, "-");

  const bundle = {
    id,
    source: "masal-coloring-book-writer",
    createdAt: new Date().toISOString(),
    ageGroup,
    heroName, heroAge, heroGender,
    lessons: lessons || [],
    title: expanded.title,
    description: expanded.description,
    category: "boyama",
    theme: expanded.theme,
    scenes: allScenes,
    coverPrompt: buildCoverPrompt({
      heroName, physicalFeatures,
      theme: expanded.title,
      coverSceneDesc: expanded.cover_scene_desc,
      ageGroup,
      pageCount: allScenes.length,
    }),
    specialPagePrompts: {
      backCover: buildBackCoverPrompt({
        heroName,
        summary: expanded.back_cover_summary,
        ageGroup,
        pageCount: allScenes.length,
      }),
    },
    meta: {
      brainstormIdeas: ideas,
      selectionReason: reason,
      interactive_find_subject: expanded.interactive_find_subject,
      maze_goal: expanded.maze_goal,
      mandala_motif: expanded.mandala_motif,
    },
  };

  progress({ step: 5, message: `Boyama kitabı hazır: "${bundle.title}" (${allScenes.length} sayfa)` });
  return bundle;
}

module.exports = { writeColoringBook, SCENE_COUNTS, LINE_RULES };
