// "Bu Kitap Ne Öğretiyor?" marketing visual — hybrid Pixar cutaway × journey map.
// See memory/projects/ogretiyor_visual.md for full spec.
//
// Anne-babanın "bu kitap çocuğuma ne katacak?" sorusuna görsel cevap.
// Shopify PDP'nin 4-5. slotu ve sosyal medya için marketing görseli.
//
// Layout: 2:3 portrait full-bleed, vertical cross-section of cozy Turkish home
// rendered in warm Pixar 3D. 4-5 scenes top-to-bottom, whimsical dotted golden
// journey-path connecting them. Each scene shows the child embodying one lesson.
//
// Mini character bottom-right corner holding a tiny gold star.
// Title: "Bu Kitap Ne Öğretiyor?" in LARGE warm-brown editorial display serif
// (Fraunces/Recoleta, #3F2A1A). Subtitle: book title. Footer: italic tagline.

const { generateImage } = require("./geminiClient");

function buildOgretiyorPrompt(concept) {
  const { kahraman, kazanimlar, baslik, mood } = concept;
  const name = kahraman?.isim || "the child";
  const age = kahraman?.yas || 5;
  const genderEn = kahraman?.cinsiyet === "kız" ? "girl" : "boy";
  const lessons = (kazanimlar || []).slice(0, 5);
  const tone = mood || "warm";

  // Build the vertical-stack scene list — one per lesson
  const sceneInstructions = lessons.map((lesson, i) => {
    return `SCENE ${i + 1} (${i === 0 ? "TOP" : i === lessons.length - 1 ? "BOTTOM" : "MIDDLE"}) — lesson: "${lesson}"\n  • Render ${name} (same face/hair/outfit as front-cover reference) acting out this specific value in a cozy warm home/garden/outdoor scene. The setting should naturally fit the lesson (e.g. orderliness → tidy room, kindness → hugging a sibling, courage → climbing a small step, sharing → offering a toy to a friend).\n  • Add a small floating label badge (cream pill shape with thin warm-brown border and rounded corners) displaying the Turkish value name in bold warm-brown serif (~14pt equivalent). Label goes near the scene, not overlapping the character.\n  • Scene occupies ~${Math.floor(65 / lessons.length)}% of vertical space.`;
  }).join("\n\n");

  return `CHILDREN'S STORYBOOK MARKETING VISUAL — "Bu Kitap Ne Öğretiyor?" — 2:3 portrait full-bleed, FLAT print-ready page. This is a premium Pixar-quality marketing image that answers a parent's question "what will this book teach my child?" visually. NOT a cover, NOT a scene illustration — a UNIQUE marketing composition.

═══ LAYOUT ═══
Full-frame VERTICAL CROSS-SECTION illustration showing a cozy Turkish home / warm outdoor environment in Pixar 3D style. The frame is a single unified warm scene, NOT a grid of cards.

Top ~18% of the frame: title block (see TYPOGRAPHY below) — sits on a soft paper/cream band with gentle decorative elements on the sides.

Middle ~65% of the frame: a vertical tower / cross-section of ${lessons.length} small Pixar cinematic scenes, STACKED top to bottom, connected by a whimsical dotted golden journey-path. Each scene is a slice of a cozy home/garden/park where ${name} is caught mid-action, embodying one of the book's lessons.

Bottom ~17% of the frame: mini character (see CHARACTER below) on the bottom-right + footer tagline centered below.

═══ CONNECTING JOURNEY PATH ═══
A whimsical dotted golden journey path (small round golden dots, #D4A574, gentle shimmer) weaves from the first scene at the top down to the last scene at the bottom, passing by each scene. Tiny decorative sprinkles along the path: miniature footprints, a small star, a tiny heart, a crescent moon — scattered like Polaroid stickers.

═══ SCENES (vertical stack, top to bottom) ═══
${sceneInstructions}

═══ CHARACTER (CRITICAL) ═══
${name} (${age}-year-old Turkish ${genderEn}) MUST look IDENTICAL in every scene — same face, same hair (color + length + style), same skin tone, same clothing, same proportions — as the FIRST reference image (front cover). If the reference has glasses/accessories, include them in every scene here. Pixar 3D stylization: subsurface scattering, expressive large eyes, rounded soft features.

Bottom-right mini character: ${name} shown from the upper torso up, holding a tiny gold star (subtle shimmer), warm happy smile, looking toward the camera. Positioned in the bottom-right corner, ~18-22% of the page width. Do NOT duplicate the mini character — only ONE mini character, at bottom-right.

═══ TYPOGRAPHY ═══
MAIN TITLE: "Bu Kitap Ne Öğretiyor?"
- Style: LARGE warm-brown editorial display SERIF (Fraunces or Recoleta bold feel), deep warm brown #3F2A1A, optically centered, dominates the top band.
- Readable premium feel — NOT coral, NOT neon, NOT bold-flashy. Elegant, warm, like a quality children's book title.
- Subtle gentle drop shadow or soft ivory glow for readability against the cream top band.

SUBTITLE (just below the main title, small):
Render the EXACT Turkish text: "${baslik}"
- Style: warm brown italic serif, ~40% smaller than the main title, centered.

FOOTER TAGLINE (centered bottom, below the mini character area):
Render the EXACT Turkish text: "Her sayfası sevgiyle, her kelimesi umutla..."
- Style: elegant italic warm gold/orange serif (#BF8A3C), small, optically centered.

Turkish special characters (ğ ş ı İ ü ö ç) MUST be perfect — every dot and cedilla exact. NEVER replace with ASCII.

═══ PALETTE ═══
Warm premium storybook palette matching the book's mood (${tone}): cream base (#FBF6EC) + warm brown (#3F2A1A) + soft honey-yellow (#F5C96E) + subtle sage or dusty-blue accents for scenes. Golden journey path + golden star. Overall feeling: cozy, warm, premium, inviting — like a high-end Pixar keyframe with editorial typography overlay.

═══ BRAND VOCABULARY (MANDATORY) ═══
- Forbidden words: "sihir", "sihirli", "büyü", "büyülü", "mucize", "tılsım". These must NOT appear in any label, title, or subtitle even implicitly.
- Replacement vocabulary if needed: "ışık", "yıldız", "kıvılcım", "hayal", "kalp", "rüya".

═══ DESIGN CONSTRAINTS (CRITICAL) ═══
- FLAT full-bleed 2:3 portrait — page IS the artwork, NO 3D mockup, NO book perspective, NO curl, NO bent corners.
- NO grid of cards, NO template-y layout, NO Pinterest-kitsch kart dizilimi.
- NO watermarks, NO stock photo elements.
- ALL scenes rendered in the SAME unified Pixar 3D art style — avoid mixing painterly/flat-vector with 3D.
- ONE main title, ONE subtitle, ONE tagline, ONE mini character — never duplicated.
- Journey path is a SINGLE flowing dotted line — not multiple disconnected fragments.

ART STYLE: Premium Pixar/DreamWorks 3D cutaway illustration × editorial marketing poster. Warm, inviting, emotionally resonant. Parents should want to buy the book AND put this image on their fridge.

Book title: "${baslik}"
Child: ${name} (${age} years, Turkish ${genderEn})
Lessons taught: ${lessons.join(" / ")}`;
}

async function generateOgretiyorVisual(concept, frontCoverRef) {
  const prompt = buildOgretiyorPrompt(concept);
  const refs = [];
  if (frontCoverRef) refs.push(frontCoverRef);
  const imageUrl = await generateImage(prompt, refs, "2:3");
  return { imageUrl, prompt };
}

module.exports = { generateOgretiyorVisual, buildOgretiyorPrompt };
