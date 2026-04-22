/**
 * conceptAgent.js — Node port of
 *   MasalSensinUrunStudio/src/services/conceptAgent.ts
 *
 * 1:1 functional parity with the browser/TS source. No prompt text modified.
 *
 * Exports:
 *   - generateBookConcept(category, previousTitles, bannedWords, options) -> BookConcept
 *   - generateBookConceptFromPrompt(userPrompt) -> BookConcept
 *
 * Notes:
 *   - MESLEK_POOL, wordMatches, getMeslekProfileFromTitle, getMeslekProfileByKey
 *     live in ../rules/meslek-profiles.js and are required from there (no local
 *     duplication).
 *   - Browser-only `window.__forceMeslekKey` / `window.__forceGender` overrides
 *     are replaced with optional `options.forceMeslekKey` / `options.forceGender`
 *     plus env fallbacks (`FORCE_MESLEK_KEY`, `FORCE_GENDER`).
 */

const { generateText, generateTextDeep, Type } = require("./geminiClient");
const {
  MESLEK_POOL,
  getMeslekProfileFromTitle,
  getMeslekProfileByKey,
  wordMatches,
} = require("../rules/meslek-profiles");

// Boyama theme pool — user-approved list. Each theme has title template + scene pool seeds.
const BOYAMA_THEMES = [
  {
    key: "hayvanlar",
    titleNouns: ["Hayvan Dostları", "Vahşi Doğa Kitabı", "Sevimli Hayvanlar Kitabı", "Hayvanlar Dünyası"],
    shortDescription: "çeşitli hayvanların kendi habitatlarındaki tatlı ve eğlenceli anlarını",
    sceneHint: "diverse animals in their natural habitats — forest animals (fox, deer, owl, hedgehog), safari (lion, giraffe, elephant, zebra), farm (cow, sheep, duck, rabbit), polar (penguin, polar bear, seal), jungle (monkey, tiger, parrot). Each scene one or two animals in a friendly calm pose suitable for a coloring page",
  },
  {
    key: "mevsimler",
    titleNouns: ["Mevsim Kitabı", "Dört Mevsim", "Mevsimler Defteri", "Yıl Boyunca"],
    shortDescription: "yılın dört mevsiminin büyülü anlarını — ilkbahar çiçekleri, yaz güneşi, sonbahar yaprakları, kış karı",
    sceneHint: "seasonal scenes — spring (flowers blooming, butterflies, garden rain), summer (beach, ice cream, picnic, fireflies), autumn (falling leaves, pumpkins, acorns, scarecrow), winter (snowflakes, snowman, hot cocoa, pine tree). Each a calm coloring-friendly composition",
  },
  {
    key: "uzay",
    titleNouns: ["Uzay Yolculuğu", "Gezegenler Kitabı", "Yıldızlar Arası", "Uzay Macerası"],
    shortDescription: "yıldızları, gezegenleri, astronotları ve gizemli uzay gemilerini",
    sceneHint: "space scenes — rockets, astronauts, planets with rings, alien friends, space station, satellite, moon landing, constellations, comets, galaxy spirals, space helmet, mars rover. Each scene a distinct subject suitable for coloring",
  },
  {
    key: "deniz-alti",
    titleNouns: ["Deniz Altı Dünyası", "Okyanus Kitabı", "Deniz Dostları", "Su Altı Macerası"],
    shortDescription: "denizin derinliklerindeki renkli balıkları, mercanları ve gizemli yaratıkları",
    sceneHint: "underwater scenes — clownfish, octopus, sea turtle, jellyfish, coral reef, seahorse, whale, dolphin, starfish, treasure chest, submarine, mermaid palace, shark silhouette, bubbles, seaweed forest. Each a distinct creature or setting",
  },
  {
    key: "spor-dallari",
    titleNouns: ["Spor Kitabı", "Spor Dünyası", "Sporlar Defteri", "Aktif Çocuk"],
    shortDescription: "futboldan yüzmeye, jimnastikten basketbola pek çok spor dalını",
    sceneHint: "sports scenes — soccer player with ball, basketball shot at the hoop, swimmer in pool, gymnast on balance beam, tennis player mid-swing, runner at finish line, cyclist, skateboard trick, skiing down slope, baseball pitch, volleyball spike, martial arts pose, yoga, ballet. Each a dynamic but calm coloring-friendly subject",
  },
];

/**
 * BOYAMA CONCEPT — simplified, theme-based.
 * No 3-step narrative research — just pick a theme, generate 16-20 scene subjects, hard-coded ozet + kazanımlar.
 */
async function generateBoyamaConcept(category, previousTitles) {
  const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // Name + age + gender
  const NAMES_BOY = [
    "Kaan", "Mert", "Yiğit", "Can", "Ege", "Atlas", "Toprak", "Çınar", "Emir", "Poyraz",
    "Aras", "Ozan", "Batu", "Doruk", "Kuzey", "Efe", "Ali", "Arda", "Eren", "Kayra",
    "Tuna", "Umut", "Demir", "Bora", "Berk", "Kerem", "Ömer", "Yusuf", "Hakan", "Burak",
    "Alp", "Mete", "Onur", "Baran", "Murat", "Cem", "Tolga", "Kağan", "Eymen", "Kerim",
    "Barış", "Serhat", "Okan", "Kubilay", "Erk",
  ];
  const NAMES_GIRL = [
    "Elif", "Defne", "Zeynep", "Ada", "Asya", "Beren", "Lina", "Ayla", "Nehir", "Mira",
    "Ipek", "Lara", "Eylül", "Melis", "Naz", "Selin", "Öykü", "Zehra", "Duru", "Sude",
    "Ece", "Rüya", "Çağla", "Bade", "Maya", "İrem", "Pınar", "Derin", "Alara", "Elis",
    "Nisan", "Mavi", "Miray", "Ebru", "Aysu", "Buse", "Hazal", "Yağmur", "Arya", "Cansu",
    "Nil", "Esma", "Gökçe", "Ezgi", "İdil",
  ];
  const prevNames = new Set(previousTitles.map(t => (t.match(/^([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)/)?.[1] || '').toLowerCase()).filter(Boolean));
  const gender = Math.random() < 0.5 ? 'erkek' : 'kız';
  const pool = gender === 'erkek' ? NAMES_BOY : NAMES_GIRL;
  const fresh = pool.filter(n => {
    const low = n.toLowerCase();
    if (prevNames.has(low)) return false;
    const re = new RegExp("\\b" + low + "\\b", "i");
    return !previousTitles.some(t => re.test(t));
  });
  const name = pickRandom(fresh.length > 0 ? fresh : pool);

  // Age from category range (boyama: ilk-renkler 2-5, renk-ustalari 6-10)
  const ageMatch = /(\d+)\s*-\s*(\d+)/.exec(category.ageRange || "");
  const ageMin = ageMatch ? parseInt(ageMatch[1]) : 3;
  const ageMax = ageMatch ? parseInt(ageMatch[2]) : 9;
  const age = ageMin + Math.floor(Math.random() * (ageMax - ageMin + 1));

  // Turkish possessive for title
  function turkishPossessive(n) {
    const lower = n.toLowerCase();
    const vowels = lower.replace(/[^aeıioöuü]/g, "");
    const lastVowel = vowels[vowels.length - 1];
    const harmony = { a: "ın", ı: "ın", e: "in", i: "in", o: "un", u: "un", ö: "ün", ü: "ün" };
    const base = harmony[lastVowel] || "ın";
    const endsInVowel = /[aeıioöuü]$/.test(lower);
    return `${n}'${endsInVowel ? "n" + base : base}`;
  }

  // Theme pick (avoid repeating a theme already used recently by comparing against previousTitles loosely)
  const theme = pickRandom(BOYAMA_THEMES);
  const titleNoun = pickRandom(theme.titleNouns);
  const baslik = `${turkishPossessive(name)} ${titleNoun}`;

  // Short ozet — Ela template
  const ozet = `Her çocuğun kendine ait bir rengi, bir hikayesi vardır. Bu kitap ${turkishPossessive(name)} elinden renklenmek için hazırlandı.`;

  // Fixed kazanımlar for boyama (used on back cover)
  const kazanimlar = [
    "El-göz koordinasyonu",
    "Yaratıcılık ve renk algısı",
    "Sabır ve odaklanma",
    "Hayal gücü",
  ];

  // Scenes: single Gemini call to produce 16-20 short coloring-page subject descriptions (Turkish)
  const sceneCount = category.visualStyle === "coloring-simple" ? 16 : 20;
  const scenePrompt = `You are composing a personalized Turkish children's COLORING BOOK for a ${age}-year-old ${gender === 'erkek' ? 'boy' : 'girl'} named ${name}. Theme: "${theme.key}" — ${theme.sceneHint}.

Generate EXACTLY ${sceneCount} distinct coloring page subjects. Each item is ONE short Turkish description (5-12 words) of a single calm, child-friendly coloring scene in that theme. Each scene must be DIFFERENT — no repeats, no near-duplicates. NO scary elements, NO violence, NO complex narrative — just charming subjects.

Examples of format: "Yüzünde kocaman gülümseme olan bir kirpi", "Havuzda yüzen kırmızı bir kayık", "Kardan adam ve yanında duran bir kardelen çiçeği".

Return ONLY a JSON array of ${sceneCount} Turkish strings. No explanation, no preamble.`;

  let sahneler = [];
  try {
    const sceneJson = await generateText(scenePrompt, {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    });
    const parsed = JSON.parse(sceneJson);
    if (Array.isArray(parsed)) sahneler = parsed.slice(0, sceneCount);
  } catch (e) {
    // Fallback: empty scenes — downstream uses first scene only for cover context
    sahneler = [];
  }
  if (sahneler.length === 0) {
    sahneler = [`${name} ${theme.shortDescription} keşfediyor`];
  }

  // Character physical features + clothes (minimal — real photo reference carries the rest)
  const fizikselOzellikler = `Turkish ${gender === 'erkek' ? 'boy' : 'girl'} with features matching the reference photo exactly`;
  const kiyafet = "casual everyday clothes matching the reference photo";

  const yasGrubu = age <= 3 ? "0-3" : age <= 6 ? "3-6" : "6-9";
  const mood = "neşeli";

  return {
    baslik,
    kahraman: { isim: name, yas: age, cinsiyet: gender, fizikselOzellikler, kiyafet },
    ozet,
    sahneler,
    kazanimlar,
    yasGrubu,
    mood,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MESLEK KAHRAMANLARI — 12 meslek × "ilk gün" template (hikaye pipeline)
// Pattern: boyama gibi tema-tabanlı; ama 5-7 sahne narrative arc + uniform lock.
// MESLEK_POOL ve helper'lar ../rules/meslek-profiles.js modülünden import ediliyor.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * MESLEK CONCEPT — pool-based like boyama, but with narrative arc for hikaye pipeline.
 * If forceMeslekKey provided, uses that profession; else picks random.
 */
async function generateMeslekConcept(category, previousTitles, forceMeslekKey, forceGender) {
  const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // Pick profession
  const meslek = forceMeslekKey
    ? (MESLEK_POOL.find(m => m.key === forceMeslekKey) || pickRandom(MESLEK_POOL))
    : pickRandom(MESLEK_POOL);

  // Name + age + gender (balanced, or forced via puppeteer test runs)
  const NAMES_BOY = [
    "Kaan", "Mert", "Yiğit", "Can", "Ege", "Atlas", "Toprak", "Çınar", "Emir", "Poyraz",
    "Aras", "Ozan", "Batu", "Doruk", "Kuzey", "Efe", "Ali", "Arda", "Eren", "Kayra",
    "Tuna", "Umut", "Demir", "Bora", "Berk", "Kerem", "Ömer", "Yusuf", "Hakan", "Burak",
    "Alp", "Mete", "Onur", "Baran", "Murat", "Cem", "Tolga", "Kağan", "Eymen", "Kerim",
    "Barış", "Serhat", "Okan", "Kubilay", "Erk",
  ];
  const NAMES_GIRL = [
    "Elif", "Defne", "Zeynep", "Ada", "Asya", "Beren", "Lina", "Ayla", "Nehir", "Mira",
    "Ipek", "Lara", "Eylül", "Melis", "Naz", "Selin", "Öykü", "Zehra", "Duru", "Sude",
    "Ece", "Rüya", "Çağla", "Bade", "Maya", "İrem", "Pınar", "Derin", "Alara", "Elis",
    "Nisan", "Mavi", "Miray", "Ebru", "Aysu", "Buse", "Hazal", "Yağmur", "Arya", "Cansu",
    "Nil", "Esma", "Gökçe", "Ezgi", "İdil",
  ];
  const prevNames = new Set(previousTitles.map(t => (t.match(/^([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)/)?.[1] || '').toLowerCase()).filter(Boolean));
  const gender = forceGender || (Math.random() < 0.5 ? "erkek" : "kız");
  const pool = gender === "erkek" ? NAMES_BOY : NAMES_GIRL;
  const fresh = pool.filter(n => {
    const low = n.toLowerCase();
    if (prevNames.has(low)) return false;
    const re = new RegExp("\\b" + low + "\\b", "i");
    return !previousTitles.some(t => re.test(t));
  });
  const name = pickRandom(fresh.length > 0 ? fresh : pool);

  // Age from category (4-10 for meslek)
  const ageMatch = /(\d+)\s*-\s*(\d+)/.exec(category.ageRange || "");
  const ageMin = ageMatch ? parseInt(ageMatch[1]) : 5;
  const ageMax = ageMatch ? parseInt(ageMatch[2]) : 10;
  const age = ageMin + Math.floor(Math.random() * (ageMax - ageMin + 1));

  // Turkish possessive
  function turkishPossessive(n) {
    const lower = n.toLowerCase();
    const vowels = lower.replace(/[^aeıioöuü]/g, "");
    const lastVowel = vowels[vowels.length - 1];
    const harmony = { a: "ın", ı: "ın", e: "in", i: "in", o: "un", u: "un", ö: "ün", ü: "ün" };
    const base = harmony[lastVowel] || "ın";
    const endsInVowel = /[aeıioöuü]$/.test(lower);
    return `${n}'${endsInVowel ? "n" + base : base}`;
  }
  const possessive = turkishPossessive(name);

  // Title
  const titleTemplate = pickRandom(meslek.titleTemplates);
  let baslik = titleTemplate.replace("{poss}", possessive).replace("{name}", name);
  // Safety net: guarantee the profession label appears in every meslek title.
  // If a template slips through without it, prepend the primary profession label.
  {
    const labels = meslek.labelTR.split(/[\s/]+/).filter(Boolean);
    const titleLower = baslik.toLowerCase();
    const hasLabel = labels.some((l) => titleLower.includes(l.toLowerCase()));
    if (!hasLabel) {
      baslik = `${labels[0]} ${baslik}`;
    }
  }

  // Ozet (fill name template)
  const ozet = meslek.ozetTemplate.replace(/\{name\}/g, name).replace(/\{poss\}/g, possessive);

  // Pick a story arc to drive narrative variety. Each meslek book can be one of 4 arcs.
  const STORY_ARCS = [
    {
      key: "first-day",
      label: "first-day-on-the-job",
      beats: [
        "MORNING: excited wake-up, putting on the uniform with care",
        "ARRIVAL: entering the workplace, greeted by team or mentor",
        "FIRST TASK: a small starting assignment learning the ropes",
        "CHALLENGE: a profession-specific difficulty (age-appropriate, non-scary)",
        "TRIUMPH: the big iconic moment of this profession",
        "CELEBRATION: being recognized, receiving the diploma/award",
      ],
    },
    {
      key: "big-event",
      label: "big-event-day (championship / opening / premiere / mission)",
      beats: [
        "ANTICIPATION: the night before — practicing / preparing, quiet nerves",
        "MORNING OF: last-minute prep, putting on uniform with determination",
        "PRE-EVENT: warm-up / rehearsal / briefing with team at the venue",
        "DURING THE EVENT: performing / playing / working under the spotlight with focus",
        "CLIMAX: the defining moment — the key play / performance / decision",
        "AFTERMATH: victory savored — medal / applause / gratitude, proud with loved ones",
      ],
    },
    {
      key: "helping-someone",
      label: "helping-someone-in-need-day",
      beats: [
        "QUIET START: normal day at the workplace in uniform",
        "CALL FOR HELP: someone (patient / animal / teammate / client) needs help",
        "DIAGNOSIS: carefully assessing the situation using profession skills",
        "PLANNING: deciding how to help, using tools of the trade",
        "THE HELP: performing the key act of kindness / skill",
        "GRATITUDE: warm moment of being thanked, feeling purposeful",
      ],
    },
    {
      key: "discovery",
      label: "day-of-unexpected-discovery",
      beats: [
        "ROUTINE START: beginning the workday in uniform at the workplace",
        "CURIOUS FIND: noticing something unusual / interesting",
        "INVESTIGATION: using profession tools to look closer, asking questions",
        "AHA MOMENT: the discovery clicks — understanding what it means",
        "SHARING: excitedly telling team / mentor / friend about the find",
        "REFLECTION: end of day proud of new knowledge gained, looking forward",
      ],
    },
  ];
  const storyArc = pickRandom(STORY_ARCS);
  const beatList = storyArc.beats.map((b, i) => `${i + 1}. ${b}`).join("\n");

  // Generate 6 narrative scenes via Gemini — uses iconic hints as source material
  const scenePrompt = `You are composing a personalized Turkish children's storybook for a ${age}-year-old ${gender === "erkek" ? "boy" : "girl"} named ${name}. They are experiencing a meaningful day as a ${meslek.labelTR} (${meslek.key}).

STORY ARC (${storyArc.label}):
${beatList}

WORKPLACE: ${meslek.workplaceEN}
UNIFORM: ${meslek.uniformEN}
TOOLS/PROPS: ${meslek.toolsEN}
ICONIC SCENE MATERIAL: ${meslek.iconicSceneHints}

Generate EXACTLY 6 scene descriptions in Turkish. Each is ONE flowing sentence (12-20 words) describing a specific visual moment from that beat of the story. Each scene MUST:
- Show ${name} in the ${meslek.labelTR} uniform (consistent outfit across all 6 scenes)
- Include signature profession tools/setting naturally
- Be NON-SCARY (no violence, no real danger, no sad situations — this is a children's aspirational book)
- Be visually rich and paintable in 3D Pixar style
- Advance the first-day story arc naturally

Return ONLY a JSON array of 6 Turkish scene descriptions. No explanation, no preamble.`;

  let sahneler = [];
  try {
    const sceneJson = await generateText(scenePrompt, {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    });
    const parsed = JSON.parse(sceneJson);
    if (Array.isArray(parsed)) sahneler = parsed.slice(0, 6);
  } catch {
    sahneler = [];
  }
  if (sahneler.length < 6) {
    // Fallback: minimal 6 scenes from static beats
    sahneler = [
      `${name} uyanıyor, heyecanla ${meslek.labelTR.toLowerCase()} üniformasını giyiyor`,
      `${name} iş yerine varıyor, etrafı keşfediyor`,
      `${name} ilk görevini üstleniyor, hazırlanıyor`,
      `${name} bir zorlukla karşılaşıyor ama vazgeçmiyor`,
      `${name} büyük başarı anını yaşıyor`,
      `${name} diplomayı alıyor, gururla gülümsüyor`,
    ];
  }

  // Physical features + outfit (outfit = uniform — KRİTİK: tüm sahneler boyunca AYNI kalmalı)
  const fizikselOzellikler = `Turkish ${gender === "erkek" ? "boy" : "girl"}, ${age} years old, warm Turkish features, cute expressive eyes matching reference photo, kind smile. Personality: dreamy, aspiring, proud to wear the ${meslek.labelTR} uniform.`;
  const kiyafet = `${meslek.labelTR} uniform (MUST stay identical in every scene): ${meslek.uniformEN}. Profession tools visible: ${meslek.toolsEN}.`;

  const yasGrubu = age <= 3 ? "0-3" : age <= 6 ? "3-6" : "6-9";

  return {
    baslik,
    kahraman: {
      isim: name,
      yas: age,
      cinsiyet: gender === "kız" ? "kız" : "erkek",
      fizikselOzellikler,
      kiyafet,
    },
    ozet,
    sahneler,
    kazanimlar: meslek.kazanimlar,
    yasGrubu,
    mood: meslek.mood,
  };
}

// ═══════════════════════════════════════════════════════════════════════════

/**
 * 3-STEP CONCEPT AGENT
 * Step 1: Research + brainstorm (thinking + search) → 5 concept candidates
 * Step 2: Select best + deepen (thinking) → full story arc
 * Step 3: Generate final structured JSON
 *
 * @param {object} category
 * @param {string[]} previousTitles
 * @param {string[]} [bannedWords]
 * @param {{ forceMeslekKey?: string, forceGender?: "erkek"|"kız" }} [options]
 */
async function generateBookConcept(category, previousTitles, bannedWords = [], options) {
  // Boyama branch: simple theme-based concept, no narrative arc
  if (category.group === "boyama") {
    return generateBoyamaConcept(category, previousTitles);
  }
  // Meslek branch: profession-based "first day" narrative, 6 scenes
  if (category.id === "meslek-hikayeleri") {
    // Allow test runs / orchestrator to force profession + gender via options or env
    const envForceKey = process.env.FORCE_MESLEK_KEY || undefined;
    const envForceGenderRaw = process.env.FORCE_GENDER;
    const envForceGender = (envForceGenderRaw === "erkek" || envForceGenderRaw === "kız") ? envForceGenderRaw : undefined;
    return generateMeslekConcept(
      category,
      previousTitles,
      (options && options.forceMeslekKey) || envForceKey,
      (options && options.forceGender) || envForceGender,
    );
  }
  const previousList = previousTitles.length > 0
    ? `\nPreviously generated (MUST be different): ${previousTitles.join(", ")}`
    : "";
  const bannedDirective = bannedWords.length > 0
    ? `\n\n═══ AŞIRI KULLANILMIŞ KELİMELER (YASAK) ═══\nBu kategoride şu kelimeler son ${previousTitles.length} kitapta 2+ kez geçti, başlığında ASLA kullanma: ${bannedWords.join(", ")}. Eş anlamlısı dahi yasak (örnek: "Sihirli" yasaksa "Büyülü" de kullanılmaz).`
    : "";

  // ═══ AGE BUCKET RANDOMIZATION — forces variety across 0-3, 3-6, 6-9 ═══
  // Parse category.ageRange (e.g., "3-10", "6-10") to know min/max
  const ageMatch = /(\d+)\s*-\s*(\d+)/.exec(category.ageRange || "");
  const catMin = ageMatch ? parseInt(ageMatch[1]) : 3;
  const catMax = ageMatch ? parseInt(ageMatch[2]) : 9;

  // Define buckets and pick one that OVERLAPS with the category range
  const BUCKETS = [
    { label: "0-3 yaş (toddler)", min: 1, max: 3 },
    { label: "3-6 yaş (preschool)", min: 3, max: 6 },
    { label: "6-9 yaş (early reader)", min: 6, max: 9 },
  ];
  const validBuckets = BUCKETS.filter(b => b.max >= catMin && b.min <= catMax);
  const bucket = validBuckets[Math.floor(Math.random() * validBuckets.length)];
  // Pick a specific age within the bucket AND category range
  const ageMin = Math.max(bucket.min, catMin);
  const ageMax = Math.min(bucket.max, catMax);
  const targetAge = ageMin + Math.floor(Math.random() * (ageMax - ageMin + 1));

  // ═══ NAME RANDOMIZATION — forces different Turkish name every generation ═══
  const NAMES_BOY = [
    "Kaan", "Mert", "Yiğit", "Can", "Ege", "Atlas", "Toprak", "Çınar", "Emir", "Poyraz",
    "Aras", "Ozan", "Batu", "Doruk", "Kuzey", "Efe", "Ali", "Arda", "Eren", "Kayra",
    "Tuna", "Umut", "Demir", "Bora", "Berk",
  ];
  const NAMES_GIRL = [
    "Elif", "Defne", "Zeynep", "Ada", "Asya", "Beren", "Lina", "Ayla", "Nehir", "Mira",
    "Ipek", "Lara", "Eylül", "Melis", "Naz", "Selin", "Öykü", "Zehra", "Duru", "Sude",
    "Ece", "Rüya", "Çağla", "Bade", "Maya",
  ];
  // Bias toward variety: pick random gender + name, avoid previous titles' names
  const prevNames = new Set(previousTitles.map(t => (t.match(/^([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)/)?.[1] || '').toLowerCase()).filter(Boolean));
  const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const chosenGender = Math.random() < 0.5 ? 'erkek' : 'kız';
  const pool = chosenGender === 'erkek' ? NAMES_BOY : NAMES_GIRL;
  const fresh = pool.filter(n => {
    const low = n.toLowerCase();
    if (prevNames.has(low)) return false;
    const re = new RegExp("\\b" + low + "\\b", "i");
    return !previousTitles.some(t => re.test(t));
  });
  const chosenName = pickRandom(fresh.length > 0 ? fresh : pool);

  const nameDirective = `\n\n═══ CHARACTER NAME (MUST USE) ═══\nThe hero of this story MUST be named EXACTLY "${chosenName}" (a ${chosenGender === 'erkek' ? 'BOY' : 'GIRL'}). Do NOT pick a different name. Do NOT default to Elif/Defne/Kaan repeatedly. Use EXACTLY "${chosenName}". kahraman.cinsiyet MUST be "${chosenGender}".${prevNames.size > 0 ? `\nPrevious books used: ${[...prevNames].join(', ')} — do not repeat any of these.` : ''}`;

  const ageDirective = `\n\n═══ TARGET AGE (MUST USE) ═══\nThe hero of this story MUST be exactly ${targetAge} years old (bucket: ${bucket.label}). Do NOT default to age 5, 6, or 7. Use EXACTLY ${targetAge}. Story complexity, vocabulary, themes, and visual style must match a ${targetAge}-year-old Turkish child. ${targetAge <= 3 ? "This is a TODDLER — simple words, big concepts, sensory details, simple plot. Toddlers love animals, colors, food, family. NO complex story arcs." : targetAge <= 6 ? "This is a PRESCHOOLER — imaginative play, magic, friends, simple emotional arcs. Curious and wonder-driven." : "This is an EARLY READER — more complex plots, real challenges, friendships, achievement, courage themes."}`;

  // ═══ STEP 1: Research + Brainstorm ═══
  const step1Prompt = `You are a world-class children's book concept strategist. Your task is to brainstorm 5 RADICALLY DIFFERENT story concepts for a personalized Turkish children's book.

BRAND: MasalSensin — premium personalized children's storybooks where each child becomes the hero.
CATEGORY: ${category.name} (${category.groupLabel})
DESCRIPTION: ${category.description}
AGE GROUP: ${category.ageRange}
MOOD: ${category.moodKeywords.join(", ")}
${previousList}
${ageDirective}${nameDirective}

RESEARCH TASK (think deeply + search if needed):
1. What are the TOP themes in award-winning children's books worldwide right now? (Caldecott, Kate Greenaway, Bologna Children's Book Fair 2024-2026)
2. What emotional themes resonate with Turkish families? (cultural values, modern parenting anxieties, child development milestones)
3. What makes a personalized book SPECIAL vs generic? (the child's name should be essential to the plot, not just inserted)
4. What visual scenarios create stunning 3D Pixar illustrations? (diverse environments, dynamic poses, rich colors)

OUTPUT: 5 concept candidates, each with:
- TITLE (Turkish, max 6 words, starts with child's name + possessive suffix)
- THEME (1 sentence — the emotional core)
- WHY IT WORKS (1 sentence — why this concept is special for personalization)
- VISUAL HOOK (1 sentence — what makes this visually stunning)
- UNIQUENESS SCORE (1-10 — how different from typical AI-generated children's stories)

═══ YASAK TEMALAR (ABSOLUTE NO-GO) ═══
Hiçbir koşulda hikaye şu temaları İÇERMEMELİ:
- Canavar, yaratık, hortlak, hayalet (ürkütücü her türlü varlık)
- Karanlık oda, karanlık korkusu, yatak altı gölgeleri, dolap içi gölgeler
- Ölüm, kayıp, ayrılık, terk edilme
- Kötü karakterler/düşmanlar (zombi, cadı, büyücü, cin)
- Korku, dehşet, gerilim, tehlike teması
- Gece korkusu, uyuyamama, kâbus
- Kan, yara, savaş, kavga
- Hapsedilme, kaybolma (uzun süreli endişe)

SADECE POZİTİF TEMALAR:
- Merak, keşif (güvenli ortamda), hayal gücü
- Arkadaşlık, aile, sevgi, paylaşım
- Doğa (orman, deniz, bahçe, gökyüzü, hayvanlar)
- Yaratıcılık, sanat, müzik, dans
- Öğrenme, büyüme, ilk deneyimler (okul, bisiklet, resim yapma)
- Sihirli ama NAZIK dünyalar (peri bahçesi, bulut üstü, renk diyarı — tehlikesiz)
- Pozitif hayvan karakterler (tavşan, yavru kedi, küçük ejderha — SEVİMLİ, tehlikeli değil)
- Kutlamalar, doğum günü, mevsimler, festivaller

TON: HER SCENE, HER SAHNE neşeli, aydınlık, güven verici olmalı. Hikaye çocuk uyumadan önce okunacak — hiçbir yerde gerilim/endişe yok. "Problem-çözüm" arcı varsa bile "problem" hafif ve eğlenceli olmalı (ör: kayıp oyuncak bulma, sürpriz hazırlama, yeni arkadaş edinme).

TURKISH TITLE QUALITY RULES (CRITICAL):
- Title MUST be NATURAL, FLUENT Turkish — a Turkish mother hearing it should IMMEDIATELY understand and feel something
- Title should sound like a REAL published Turkish children's book title (e.g., "Zeynep'in Sihirli Bahçesi", "Can ile Kayıp Kedi", "Elif'in Cesur Kalbi")
- Length: 3-5 words MAX (ideally 3-4). Short, memorable, punchy.
- FORBIDDEN: awkward translations from English, forced metaphors, unnatural word order, meaningless poetic combinations
- TEST: Read the title aloud in Turkish — does it flow naturally? Would a child understand it? Would a parent say "ah ne güzel isim"? If NO → reject and try again
- BAD EXAMPLES: "Gökyüzüne Dönen Yıldızları" (ne demek?), "Rüzgarın Fısıldadığı Sır" (zorlama), "Zamanın Ötesindeki Kapı" (çocuk anlamaz)
- GOOD EXAMPLES: "Zeynep'in Okul Macerası", "Can'ın Cesur Kalbi", "Elif ve Kayıp Kedicik", "Mert'in Büyük Günü", "Defne'nin Sihirli Fırçası"

TITLE PATTERN VARIETY (ZORUNLU ÇEŞİTLİLİK):
- Generic kelimeler "Keşfi / Macerası / Yolculuğu / Serüveni / Hikayesi" HER başlıkta olmak ZORUNDA DEĞİL. AI olarak bunları kalıp gibi her başlığa yapıştırma.
- 5 candidate title'ı FARKLI kalıplarda üret — hepsi "X'in Y Macerası" kalıbında olmasın:
  1. "Ad'ın + Sıfat + İsim" → "Elif'in Sihirli Bahçesi"
  2. "Ad + ve + İsim" → "Can ve Kayıp Kedi"
  3. "Ad + Fiil/Eylem" → "Mert Uçuyor", "Defne Rüyalarda"
  4. "Ad'ın + İsim" (generic kelime YOK) → "Zeynep'in Kalbi", "Ada'nın Dünyası"
  5. "Ad ile + İsim" → "Yiğit ile Ejderha"
- "Keşfi / Macerası" gibi generic kelimelerden 5 candidate'ta EN FAZLA 1 tane kullan — o da gerçekten hikayeye doğal uyuyorsa.
${previousTitles.length > 0 ? `
═══ ÖNCEKİ BAŞLIKLAR — TEMA TEKRARI MUTLAK YASAK ═══
Bu kategoride şu başlıklar zaten üretildi (HEPSİNİ İNCELE):
"${previousTitles.join('", "')}"

5 candidate başlık üretirken:
1) Önceki başlıklarda geçen ANAHTAR TEMA / NESNE / KAVRAM kelimelerini KULLANMA — örnek: önceki başlıklarda "Battaniye" varsa, hiçbir candidate'ta "Battaniye" geçmemeli. "Yıldız" varsa "Yıldız" yok. "Rüya" varsa "Rüya" yok. Genişlet — eş anlamlı kelimeleri de kullanma (Battaniye → Yorgan, Örtü dahi yasak).
2) Önceki başlıkların FİİL/EYLEM kelimelerini de tekrar etme.
3) Önceki başlıkların KALIBINI tekrar etme — örn. hepsi "X'in Sihirli Y'si" pattern'ında ise yeni başlık FARKLI bir pattern olsun.
4) Concept'in HİKAYE TEMASI da farklı olsun — önceki kitaplar uyku/battaniye temasında ise yeni kitap macera, dostluk, doğa, sanat, hayvanlar, müzik gibi BAŞKA bir tema seçsin.
5) Eğer 5 candidate üretip bunlardan herhangi biri yukarıdaki kuralları ihlal ediyorsa o candidate'ı eleyip yenisini üret.
` : '- İlk kitap, kısıt yok.'}

Think beyond "Kayıp Harita Macerası" clichés — but stay NATURAL Turkish. A Pixar story department would pitch in the child's language, not in abstract poetry.${bannedDirective}`;

  const brainstormResult = await generateTextDeep(step1Prompt, { thinking: 10000, search: true });
  console.log("═══ CONCEPT STEP 1 — 5 Brainstorm Candidates ═══\n", brainstormResult.slice(0, 2000));

  // ═══ STEP 2: Select + Deepen ═══
  const step2Prompt = `You are a senior children's book editor at a top Turkish publishing house. You just received 5 concept pitches for a personalized children's storybook.

PITCHES:
"""
${brainstormResult}
"""

TASK:
1. RANK all 5 concepts by: emotional impact × visual richness × personalization depth × uniqueness
2. SELECT #1 with a clear reason WHY it beats the others
3. DEEPEN the selected concept into a full story arc:
   - CHARACTER ARC: Who is the child at the START vs the END? What internal change happens?
   - 3-ACT STRUCTURE: Setup (world + problem) → Confrontation (obstacles + growth) → Resolution (transformation + lesson)
   - 6-7 SCENES: Each scene in a DIFFERENT visual environment (forest, underwater, sky, cave, village, castle, space, etc.) — visual diversity is critical for illustration quality
   - 4 KAZANIMLAR (child gains): specific developmental values (not generic "courage" — be specific about HOW the child demonstrates it)
   - EMOTIONAL HOOK for parents: what makes a mother say "I need to buy this for my child"
4. Generate a REAL TURKISH CHILD NAME (common, recognizable — Elif, Yiğit, Defne, Kaan, Zeynep, Mert, Ada, Ege, Beren, Toprak, Asya, Deniz, Atlas, Lina, Çınar)
   - If the name is male, cinsiyet MUST be "erkek"
   - If the name is female, cinsiyet MUST be "kız"
5. Create a DETAILED physical description for AI image generation:
   - Specific hair (color + style + unique detail)
   - Eye color + shape
   - Skin tone
   - 2+ CUTE distinctive features (freckles, dimples, chubby cheeks, big eyes, cute glasses, hair clip — NO wounds, NO band-aids)
   - Personality expression (shy? mischievous? dreamy? brave?)

OUTPUT the full deepened concept as a structured analysis. This will feed the final JSON generation.`;

  const deepResult = await generateTextDeep(step2Prompt, { thinking: 8000 });
  console.log("═══ CONCEPT STEP 2 — Selected + Deepened ═══\n", deepResult.slice(0, 2000));

  // ═══ STEP 3: Final Structured JSON ═══
  const step3Prompt = `Convert this children's book concept into the exact JSON structure needed.

DEEPENED CONCEPT:
"""
${deepResult}
"""

RULES:
- baslik: NATURAL fluent Turkish, 3-5 kelime MAX, starts with child name + possessive suffix. Must sound like a real published children's book. "Keşfi / Macerası / Yolculuğu / Serüveni" gibi generic kelimeleri kalıp gibi kullanma — gerçekten hikayeye uyuyorsa kullan, uymuyorsa farklı kalıp seç (Ad + ve + İsim / Ad + Fiil / Ad'ın + İsim). BAD: "Gökyüzüne Dönen Yıldızları" (zorlama), "Defne'nin Rüya Fabrikası Keşfi" (Keşfi gereksiz). GOOD: "Elif'in Sihirli Bahçesi", "Can ile Kayıp Kedi", "Mert'in Büyük Günü", "Defne'nin Rüya Fabrikası"
- kahraman.yas: MUST be EXACTLY ${targetAge} (do not change this number)
- kahraman.isim: MUST be EXACTLY "${chosenName}" (do not change)
- kahraman.cinsiyet: MUST be "${chosenGender}"
- kahraman.cinsiyet: MUST be "erkek" for male names (Kaan, Mert, Yiğit, Can, Ege, Çınar, Atlas, Toprak, Deniz-male) or "kız" for female names (Elif, Defne, Zeynep, Ada, Asya, Beren, Lina, Deniz-female)
- kahraman.fizikselOzellikler: DETAILED English description for AI image generation (hair color+style, eye color+shape, skin tone, 2+ cute distinctive features, personality expression). NO wounds, NO band-aids.
- kahraman.kiyafet: story-appropriate outfit in English (for Pixar 3D rendering)
- ozet: 5-7 Turkish sentences, natural child-friendly language, complete sentences (NOT ending with "...")
- sahneler: 5-7 scene descriptions in Turkish, each in a DIFFERENT visual environment. HİÇBİR sahnede canavar, karanlık oda, yatak altı gölge, ürkütücü yaratık, kötü karakter, korku unsuru OLMAMALI. Hepsi aydınlık, güvenli, neşeli sahneler (güneşli orman, deniz kıyısı, gökkuşağı bulutları, peri bahçesi, hayvan dostlar vs.)
- kazanimlar: 3-5 specific Turkish values/skills the child gains
- yasGrubu: age range string
- mood: single mood word in Turkish

SADECE JSON döndür.`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      baslik: { type: Type.STRING },
      kahraman: {
        type: Type.OBJECT,
        properties: {
          isim: { type: Type.STRING },
          yas: { type: Type.NUMBER },
          cinsiyet: { type: Type.STRING, enum: ["erkek", "kız"] },
          fizikselOzellikler: { type: Type.STRING },
          kiyafet: { type: Type.STRING },
        },
        required: ["isim", "yas", "cinsiyet", "fizikselOzellikler", "kiyafet"],
      },
      ozet: { type: Type.STRING },
      sahneler: { type: Type.ARRAY, items: { type: Type.STRING } },
      kazanimlar: { type: Type.ARRAY, items: { type: Type.STRING } },
      yasGrubu: { type: Type.STRING },
      mood: { type: Type.STRING },
    },
    required: ["baslik", "kahraman", "ozet", "sahneler", "kazanimlar", "yasGrubu", "mood"],
  };

  const responseText = await generateText(step3Prompt, schema);
  return JSON.parse(responseText);
}

/**
 * Generate a book concept from a free-text user prompt.
 * Uses the same 3-step approach but seeded with user's idea.
 *
 * @param {string} userPrompt
 */
async function generateBookConceptFromPrompt(userPrompt) {
  // Step 1: Understand + expand the user's idea
  const expandPrompt = `You are a children's book concept strategist. A parent/customer gave this brief for a personalized children's book:

"${userPrompt}"

TASK:
1. Extract: child's name (if given), theme, any specific details
2. Expand this into a FULL story concept with:
   - Clear character arc (start → growth → transformation)
   - 6-7 visually diverse scenes (each in different environment)
   - Emotional hook for parents
   - 4 specific developmental gains for the child
3. If the name is Turkish male (Kaan, Mert, Yiğit, Can, Ege), cinsiyet = "erkek"
   If female (Elif, Defne, Zeynep, Ada, Asya), cinsiyet = "kız"
4. Create detailed physical description (NO wounds, NO band-aids, ONLY cute features)
5. Title MUST start with the child's name + Turkish possessive suffix

Think deeply about what makes this concept SPECIAL and PERSONAL.`;

  const expanded = await generateTextDeep(expandPrompt, { thinking: 8000 });

  const finalPrompt = `Convert this concept into exact JSON:

"""
${expanded}
"""

RULES: baslik starts with name, cinsiyet enum ["erkek","kız"], fizikselOzellikler in English for AI, ozet complete Turkish sentences, sahneler diverse environments.

SADECE JSON döndür.`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      baslik: { type: Type.STRING },
      kahraman: {
        type: Type.OBJECT,
        properties: {
          isim: { type: Type.STRING },
          yas: { type: Type.NUMBER },
          cinsiyet: { type: Type.STRING, enum: ["erkek", "kız"] },
          fizikselOzellikler: { type: Type.STRING },
          kiyafet: { type: Type.STRING },
        },
        required: ["isim", "yas", "cinsiyet", "fizikselOzellikler", "kiyafet"],
      },
      ozet: { type: Type.STRING },
      sahneler: { type: Type.ARRAY, items: { type: Type.STRING } },
      kazanimlar: { type: Type.ARRAY, items: { type: Type.STRING } },
      yasGrubu: { type: Type.STRING },
      mood: { type: Type.STRING },
    },
    required: ["baslik", "kahraman", "ozet", "sahneler", "kazanimlar", "yasGrubu", "mood"],
  };

  const responseText = await generateText(finalPrompt, schema);
  return JSON.parse(responseText);
}

module.exports = { generateBookConcept, generateBookConceptFromPrompt };
