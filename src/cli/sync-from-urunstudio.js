#!/usr/bin/env node
/**
 * sync-from-urunstudio.js
 *
 * UrunStudio'nun urettigi BookConcept JSON'unu Masal app'in book.json
 * formatina cevirir. Cikti kullanim icin hazir bir scaffold; sahne prompt'lari
 * kullanici tarafindan doldurulmali (UrunStudio'nun gorsel uretim
 * pipeline'i farkli — Masal'da AI image gen icin detayli prompt gerekir).
 *
 * KULLANIM:
 *   node src/cli/sync-from-urunstudio.js \
 *     --concept ./concept-defne-abla.json \
 *     --handle defne-abla-oluyor \
 *     --category yeni-kardes-hikayeleri \
 *     [--meslek doktor]
 *
 * OUTPUT:
 *   src/stories/<handle>/book.json
 *
 * NOTLAR:
 * - UrunStudio BookConcept = { baslik, kahraman, ozet, sahneler, kazanimlar, yasGrubu, mood }
 * - Masal book.json daha zengin: scenes[].prompt, theme colors, meslekProfile, funFacts, vb.
 * - Bu script TEMEL alani doldurur, KALAN alanlar TEMPLATE'ten kopyalanir.
 *
 * RISK: Sifira yakin — sadece JSON->JSON donusumu, canli sistem etkilenmiyor.
 * Cikti dosyasi varsa --force ile uzerine yazar; yoksa hata verir.
 */

const fs = require("fs");
const path = require("path");

const TEMPLATES_DIR = path.join(__dirname, "..", "templates");
const STORIES_DIR = path.join(__dirname, "..", "stories");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      args[key] = val;
    }
  }
  return args;
}

function fail(msg) {
  console.error("\u274C " + msg);
  process.exit(1);
}

function info(msg) { console.log("\u2139\uFE0F  " + msg); }
function ok(msg) { console.log("\u2705 " + msg); }

const KATEGORI_TEMPLATE_MAP = {
  "meslek-hikayeleri": "meslek-hikayeleri.template.json",
  "yeni-kardes-hikayeleri": "yeni-kardes-hikayeleri.template.json",
  "hayvan-dostum": "hayvan-dostum.template.json",
  "gunluk-degerler-egitimi": "gunluk-degerler-egitimi.template.json",
  // hikaye / boyama / ozel-gun: mevcut altin-basketbol vb. hikayelerden manuel adapte et
};

// Meslek profilleri (UrunStudio MESLEK_POOL'dan basit alt kume — geneliyle book.json
// icine elle eklemek gerekir, bu sozluk yalnizca yaygin meslekleri scaffolda otomatik koyar)
const MESLEK_PROFILES = {
  doktor: {
    labelTR: "Doktor",
    diplomaTitle: "ÇOCUK DOKTORU DİPLOMASI",
    diplomaSymbols: "caduceus staff + heart + stethoscope + first-aid cross",
    uniformEN: "small white doctor coat, stethoscope around neck, name badge on chest, white medical shoes",
    toolsEN: "stethoscope, pocket notebook, digital thermometer, sticker sheet, otoscope",
    iconicSceneHints: "first day, putting on white coat, examining a small patient, listening to heartbeat, placing reward sticker, end of day satisfied",
  },
  astronot: {
    labelTR: "Astronot",
    diplomaTitle: "ASTRONOT LİSANSI",
    diplomaSymbols: "star + rocket ship + moon crescent + orbital ring",
    uniformEN: "white NASA-style space suit with visor helmet, Turkish flag patch on shoulder, white boots",
    toolsEN: "helmet with reflective visor, oxygen tank, tablet with star map, gravity boots",
    iconicSceneHints: "rocket launch, weightless inside cockpit, spacewalking, planting flag on Mars, meeting friendly alien, robot arm, parachute descent",
  },
  pilot: {
    labelTR: "Pilot",
    diplomaTitle: "KAPTAN PİLOT BREVE\u0027SI",
    diplomaSymbols: "wings + propeller + altimeter + globe",
    uniformEN: "navy blue pilot uniform with golden epaulettes, white shirt, black tie, captain hat with golden insignia",
    toolsEN: "headset, flight notebook, navigation chart, captain hat",
    iconicSceneHints: "preflight check, climbing into cockpit, taking off through clouds, navigating storm, landing safely, greeting passengers",
  },
  futbolcu: {
    labelTR: "Futbolcu",
    diplomaTitle: "ŞAMPİYON FUTBOLCU SERTİFİKASI",
    diplomaSymbols: "soccer ball + trophy + boot + winner ribbon",
    uniformEN: "professional soccer jersey with name and number, soccer shorts, professional cleats",
    toolsEN: "soccer ball, captain armband, gold trophy",
    iconicSceneHints: "training drills, first match nerves, scoring goal, team celebration, winning trophy, lifting cup",
  },
  polis: {
    labelTR: "Polis",
    diplomaTitle: "KAHRAMAN POLİS DİPLOMASI",
    diplomaSymbols: "shield + badge + star + olive branch",
    uniformEN: "Turkish police navy blue uniform with patches, badge, cap with insignia, dark belt",
    toolsEN: "police badge, walkie-talkie, notepad, whistle",
    iconicSceneHints: "morning briefing, helping lost child, directing traffic, comforting citizen, end-of-day report",
  },
  asci: {
    labelTR: "Aşçı",
    diplomaTitle: "USTA AŞÇI DİPLOMASI",
    diplomaSymbols: "chef hat + whisk + saucepan + golden ladle",
    uniformEN: "white chef coat, tall white chef hat, blue checkered apron, white shoes",
    toolsEN: "wooden spoon, whisk, chef knife, recipe notebook",
    iconicSceneHints: "preparing ingredients, kneading dough, stirring pot, plating dessert, serving with smile, applause from diners",
  },
  ressam: {
    labelTR: "Ressam",
    diplomaTitle: "GENÇ RESSAM SERTİFİKASI",
    diplomaSymbols: "palette + paintbrush + easel + golden frame",
    uniformEN: "artist apron with paint splatters, comfortable clothes underneath, beret optional",
    toolsEN: "paintbrush, palette, easel, canvas, color tubes",
    iconicSceneHints: "blank canvas, first brushstroke, mixing colors, painting flowers, gallery exhibition, proud reveal",
  },
};

async function main() {
  const args = parseArgs(process.argv);

  // Validation
  if (!args.concept) fail("--concept gerekli (UrunStudio concept JSON dosyasi)");
  if (!args.handle) fail("--handle gerekli (Shopify urun handle, klasor adi olarak kullanilir)");
  if (!args.category) fail("--category gerekli (orn. meslek-hikayeleri, yeni-kardes-hikayeleri, hayvan-dostum, gunluk-degerler-egitimi)");

  if (!fs.existsSync(args.concept)) fail("Concept dosyasi bulunamadi: " + args.concept);

  const conceptRaw = fs.readFileSync(args.concept, "utf8");
  let concept;
  try { concept = JSON.parse(conceptRaw); }
  catch (e) { fail("Concept JSON parse edilemedi: " + e.message); }

  // Concept icinde ya direkt BookConcept var, ya da { concept: BookConcept } formatinda
  if (concept.concept) concept = concept.concept;

  if (!concept.baslik || !concept.kahraman || !concept.sahneler) {
    fail("Concept BookConcept formatinda degil. Beklenen alanlar: baslik, kahraman, ozet, sahneler, kazanimlar");
  }

  // Template sec
  const templateName = KATEGORI_TEMPLATE_MAP[args.category];
  let template = {};
  if (templateName) {
    const templatePath = path.join(TEMPLATES_DIR, templateName);
    if (fs.existsSync(templatePath)) {
      template = JSON.parse(fs.readFileSync(templatePath, "utf8"));
      info("Template yuklendi: " + templateName);
    } else {
      info("Template bulunamadi (" + templateName + "), bos baslanir");
    }
  } else {
    info("Bu kategori (" + args.category + ") icin ozel template yok. Mevcut hikayelerden adapte et.");
  }

  // BookConcept -> book.json mapping
  const heroName = concept.kahraman.isim;
  const ageGroup = concept.yasGrubu || (concept.kahraman.yas <= 3 ? "1-3" : concept.kahraman.yas <= 6 ? "3-6" : "6-12");

  const bookJson = {
    id: args.handle,
    category: args.category,
    title: concept.baslik,
    coverTitle: concept.baslik.replace(heroName, "{CHILD_NAME}"),
    description: concept.ozet,
    lessons: concept.kazanimlar || (template.lessons || []),
    ageGroup,
    ageRange: ageGroup,
    pageCount: 14,
    sceneCount: concept.sahneler.length || 14,
    style: template.style || "Pixar/Disney 3D CGI animation, warm cinematic lighting, hyper-detailed textures, photorealistic fabric and skin, ultra-detailed render",
    characterDescription: {
      base: "a child with the EXACT same facial features as the reference photo, rendered in 3D Pixar style, " + (concept.kahraman.fizikselOzellikler || ""),
      notes: "Concept'ten geldi. Outfit gruplari ve sahne kiyafetleri elle gozden gecir.",
    },
    theme: template.theme || {
      primaryColor: "#3E2723",
      secondaryColor: "#D17A2C",
      accentColor: "#FBF6EC",
      icon: "\u2728",
    },
    outfit: null,
    scenes: (concept.sahneler || []).map((sahneText, i) => ({
      sceneNumber: i + 1,
      outfitId: "REPLACE-OUTFIT",
      title: "Sahne " + (i + 1),
      text: sahneText.replace(new RegExp(heroName, "g"), "{CHILD_NAME}"),
      prompt: "REPLACE — Pixar 3D CGI sahne prompt'u. CHARACTER_DESC wearing [outfit], CAMERA [aci], [aksiyon], [setting], [mood], Pixar/Disney CGI quality, ultra detail",
      mood: concept.mood || "warm",
      setting: "REPLACE",
    })),
    funFacts: template.funFacts || [],
    funFactPlacements: template.funFactPlacements || [],
  };

  // Meslek-hikayeleri: meslekProfile alani ekle
  if (args.category === "meslek-hikayeleri") {
    const meslekKey = (args.meslek || "").toLowerCase();
    if (meslekKey && MESLEK_PROFILES[meslekKey]) {
      bookJson.meslekProfile = MESLEK_PROFILES[meslekKey];
      info("Meslek profili yuklendi: " + meslekKey);
    } else {
      bookJson.meslekProfile = template.meslekProfile || {
        labelTR: "REPLACE",
        diplomaTitle: "REPLACE DİPLOMASI",
        diplomaSymbols: "REPLACE — heraldic symbols",
        uniformEN: "REPLACE — uniform description",
        toolsEN: "REPLACE — tools list",
        iconicSceneHints: "REPLACE — scene hints",
      };
      if (meslekKey) info("Bilinmeyen meslek (" + meslekKey + "), placeholder ile dolduruldu. Manuel doldurman gerekir.");
      else info("--meslek belirtilmedi, meslekProfile placeholder ile dolduruldu.");
    }
  }

  // Output yaz
  const outDir = path.join(STORIES_DIR, args.handle);
  const outPath = path.join(outDir, "book.json");

  if (fs.existsSync(outPath) && !args.force) {
    fail("Cikti zaten var: " + outPath + " (--force ile uzerine yaz)");
  }

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(bookJson, null, 2), "utf8");

  ok("Olusturuldu: " + outPath);
  console.log("");
  console.log("SONRAKI ADIMLAR:");
  console.log("  1. " + outPath + " dosyasini ac, scene.prompt'lari elle yaz (her sahne icin Pixar 3D CGI detayi)");
  console.log("  2. outfitId gruplari karar ver (pajamas, casual, uniform vb.)");
  console.log("  3. specialPagePrompts.heroPage ekle (sadece tematik arka plan, NO TEXT NO CHARACTER)");
  console.log("  4. funFacts + funFactPlacements doldur");
  console.log("  5. http://localhost:3000 uzerinden test et");
}

main().catch((e) => fail("Sync hatasi: " + e.message));
