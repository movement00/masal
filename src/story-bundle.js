const fs = require("fs");
const path = require("path");
const os = require("os");

// Paylasilan hikaye havuzu — masal + UrunStudio ikisi de buradan okur/yazar
const SHARED_STORE = process.env.STORY_STORE_DIR
  || path.join(os.homedir(), "Desktop", "StorieStore");

function ensureStore() {
  if (!fs.existsSync(SHARED_STORE)) fs.mkdirSync(SHARED_STORE, { recursive: true });
  return SHARED_STORE;
}

function bundlePath(id) {
  ensureStore();
  const dir = path.join(SHARED_STORE, id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return { dir, file: path.join(dir, "bundle.json") };
}

function saveBundle(bundle) {
  if (!bundle.id) throw new Error("bundle.id required");
  const { file } = bundlePath(bundle.id);
  fs.writeFileSync(file, JSON.stringify(bundle, null, 2));
  return file;
}

function loadBundle(id) {
  const { file } = bundlePath(id);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function listBundles() {
  ensureStore();
  const dirs = fs.readdirSync(SHARED_STORE).filter((d) => {
    const p = path.join(SHARED_STORE, d, "bundle.json");
    return fs.existsSync(p);
  });
  return dirs.map((id) => loadBundle(id)).filter(Boolean);
}

// Bundle → masal book.json converter
function bundleToMasalBook(bundle) {
  const scenes = (bundle.scenes || []).map((s, i) => ({
    sceneNumber: i + 1,
    outfitId: s.outfitId || "default",
    title: s.title || `Sahne ${i + 1}`,
    text: s.text || "",
    prompt: s.prompt || `CHARACTER_DESC ${s.action || "in the scene"}, ${bundle.style || ""}, ultra high detail render quality`,
    mood: s.mood || "warm",
    setting: s.setting || "",
  }));

  return {
    id: bundle.id,
    category: bundle.category || "hikaye",
    title: bundle.title,
    description: bundle.description || "",
    lessons: bundle.lessons || [],
    ageGroup: bundle.ageGroup,
    ageRange: bundle.ageGroup,
    pageCount: scenes.length,
    // templateHeroName enables Bora→Kaan morphology substitution at order time
    templateHeroName: bundle.templateHeroName || bundle.heroName || null,
    heroName: bundle.heroName || bundle.templateHeroName || null,
    style: bundle.style || "Ice Age and Shrek style 3D CGI animation with exaggerated cute proportions, hyper-detailed textures, subsurface skin scattering, volumetric lighting, vibrant warm color palette, photorealistic fabric wrinkles, cinematic composition, Disney Pixar render quality",
    characterDescription: bundle.characterDescription || {
      base: "a child with the EXACT same facial features as the reference photo, rendered in 3D CGI style with slightly exaggerated cute proportions, big expressive eyes, detailed skin textures, and natural hair matching the photo exactly",
      notes: "",
    },
    theme: bundle.theme || { primaryColor: "#F57C00", secondaryColor: "#FFB74D", accentColor: "#FFF3E0", icon: "📖" },
    outfit: null,
    scenes,
    funFacts: bundle.funFacts || [],
    funFactPlacements: bundle.funFactPlacements || [],
    coverPrompt: bundle.coverPrompt || "",
    specialPagePrompts: bundle.specialPagePrompts || {
      heroPage: "A beautiful premium children's storybook HERO PAGE BACKGROUND in 2:3 portrait — themed decorative background. NO CHILD CHARACTER, NO PEOPLE, NO HUMAN FIGURES. NO TEXT NO LETTERS in image. Soft themed ornaments around the edges, calm center area reserved for photo frame composite.",
      funFactBg: "A warm decorative themed background with sparkles and soft glow, NO TEXT NO LETTERS, 3D CGI illustration.",
      senderNoteBg: "A cozy warm background with soft golden light, NO TEXT NO LETTERS, 3D CGI render.",
      backCover: "A warm artistic closing scene matching the book theme, NO TEXT NO LETTERS, 3D CGI render.",
    },
  };
}

// Masal book.json + generation output → bundle (UrunStudio icin)
function masalToBundle(bookData, outputDir, meta = {}) {
  return {
    id: meta.id || bookData.id,
    source: "masal",
    createdAt: new Date().toISOString(),
    title: bookData.title,
    ageGroup: bookData.ageGroup,
    category: bookData.category,
    description: bookData.description,
    lessons: bookData.lessons,
    style: bookData.style,
    characterDescription: bookData.characterDescription,
    theme: bookData.theme,
    heroName: meta.heroName,
    heroAge: meta.heroAge,
    heroGender: meta.heroGender,
    scenes: bookData.scenes,
    funFacts: bookData.funFacts,
    funFactPlacements: bookData.funFactPlacements,
    coverPrompt: bookData.coverPrompt,
    specialPagePrompts: bookData.specialPagePrompts,
    assets: outputDir ? {
      outputDir,
      coverFinal: path.join(outputDir, "cover-final.png"),
      heroPage: path.join(outputDir, "hero-page.png"),
      backCover: path.join(outputDir, "back-cover.png"),
      pdf: path.join(outputDir, "kitap.pdf"),
    } : null,
  };
}

module.exports = { SHARED_STORE, ensureStore, bundlePath, saveBundle, loadBundle, listBundles, bundleToMasalBook, masalToBundle };
