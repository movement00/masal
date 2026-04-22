// Migrate all book.json templates to GENERIC form.
// Strips hardcoded physical traits, brand-name bleed, and English action text
// so ANY child name + ANY child photo can use the same template without drift.
//
// Usage: node scripts/migrate-templates-generic.js
// Backs up everything to _backup-20260421-template-generic-migration/ before writing.

const fs = require("fs");
const path = require("path");

const STORIES_DIR = path.join(__dirname, "..", "src", "stories");

// Patterns that leak child-specific physical traits into scene prompts.
// These cause identity drift when a different child orders the book.
const PHYSICAL_DESC_PATTERNS = [
  // CRITICAL: Whole "(physical features that MUST be preserved ...)" parenthetical block.
  // UrunStudio conceptAgent wraps the hero's fizikselOzellikleri inside CHARACTER_DESC (...) and
  // this is the #1 cause of character drift when a different child orders the book.
  // Match non-greedy across multiple lines until the closing paren.
  /\s*\(\s*physical\s+features\s+that\s+MUST\s+be\s+preserved[^)]*\)/gi,
  /\s*\(physical\s+features[^)]*\)/gi,
  // Standalone hair descriptors (color + texture)
  /\b(Messy,?\s+(?:thick,?\s+)?(?:slightly\s+)?(?:wavy|curly|straight|tousled|messy)(?:\s+and\s+curly)?)\s+(light\s+brown|dark\s+brown|blonde|black|red|auburn|chestnut|golden|brown)\s+hair[^.]*\./gi,
  /\b(straight|short|long|curly|wavy|messy|thick)\s+(black|brown|light\s+brown|dark\s+brown|blonde|red|gray|silver|golden|auburn|chestnut)\s+hair[^.]*\./gi,
  // Eye color
  /\b(huge,?\s+)?(round,?\s+)?(curious\s+)?(bright,?\s+)?(hazel|hazel-green|green|blue|brown|dark\s+brown|gray|amber)\s+(almond-shaped\s+)?eyes[^.]*\./gi,
  // Dimples
  /\b(very\s+prominent|deep,?\s+prominent|cute|small|tiny|deep)\s+dimple(s)?[^.]*\./gi,
  /\b(prominent|cute|deep)?\s*dimple(s)?\s+on\s+(?:the\s+)?(?:left|right|both)\s+cheek(s)?[^.]*\./gi,
  // Skin tones
  /\b(light\s+warm\s+olive|warm\s+tan\s+olive|light\s+olive|olive|tan|fair|pale|dark|golden)\s+skin(\s+tone)?[^.]*\./gi,
  // Cheeks
  /\b(chubby,?\s+soft,?\s+slightly\s+pink|chubby|soft,?\s+slightly\s+pink|rosy|pinkish|pink)\s+(and\s+)?(healthy\s+)?cheeks[^.]*\./gi,
  // Freckles
  /\b(very\s+distinct,?\s+)?(cute\s+)?freckles\s+(across|on|scattered\s+(?:across|on))\s+(the\s+)?(bridge\s+of\s+)?(?:the\s+)?(nose|cheeks)[^.]*\./gi,
];

// Brand-name style directives that AI renders as literal posters/logos in scenes.
const BRAND_BLEED_REPLACEMENTS = [
  [/\bIce\s+Age\s+and\s+Shrek\s+style\s+3D\s+CGI\s+animation\b/gi, "Pixar 3D CGI animation style"],
  [/\bIce\s+Age\s+and\s+Shrek\s+style\b/gi, "Pixar 3D CGI animation style"],
  [/\bIce\s+Age\s*(?:and|\/|,)\s*Shrek\b/gi, "Pixar 3D CGI"],
  [/\bIce\s+Age\s*\/\s*Pixar\b/gi, "Pixar"],
  [/\bPixar\s*\/\s*Ice\s+Age\b/gi, "Pixar"],
  [/\bin\s+the\s+style\s+of\s+(?:Ice\s+Age|Shrek|Disney|DreamWorks)\b/gi, "in premium 3D CGI style"],
  [/\b(Shrek|Ice\s+Age|DreamWorks)\s+(?:style|film|movie|like)\b/gi, "premium 3D CGI style"],
];

// English commands/exclamations that AI renders as literal wall text.
const ENGLISH_LEAK_REPLACEMENTS = [
  [/\bBedtime!\s*/g, ""],
  [/\bWake\s+up!\s*/g, ""],
  [/\bHurry!\s*/g, ""],
  [/\bGood\s+night!\s*/g, ""],
  [/\bMorning!\s*/g, ""],
];

function sanitizeText(txt) {
  if (typeof txt !== "string") return txt;
  let out = txt;
  for (const pat of PHYSICAL_DESC_PATTERNS) out = out.replace(pat, "");
  for (const [pat, repl] of BRAND_BLEED_REPLACEMENTS) out = out.replace(pat, repl);
  for (const [pat, repl] of ENGLISH_LEAK_REPLACEMENTS) out = out.replace(pat, repl);
  // Normalize whitespace + punctuation spacing
  out = out.replace(/\s+/g, " ").replace(/\s([.,!?;:])/g, "$1").trim();
  return out;
}

function migrateBook(bookPath) {
  const raw = fs.readFileSync(bookPath, "utf-8");
  const book = JSON.parse(raw);
  let changes = [];

  // characterDescription.base — if it has hair/eye/dimple details, genericize
  if (book.characterDescription && typeof book.characterDescription.base === "string") {
    if (/hair|eyes|skin|dimple|cheek|freckle/i.test(book.characterDescription.base)) {
      const orig = book.characterDescription.base;
      book.characterDescription.base = "Turkish child. Exact face, hair, skin tone, and accessories come from the character-profile reference photo. No hardcoded physical traits — the reference photo is the sole source of truth for identity.";
      if (orig !== book.characterDescription.base) changes.push("characterDescription.base → generic");
    }
  }

  // Scene prompts
  if (Array.isArray(book.scenes)) {
    book.scenes.forEach((sc, i) => {
      if (typeof sc.prompt === "string") {
        const before = sc.prompt;
        sc.prompt = sanitizeText(sc.prompt);
        if (before !== sc.prompt) changes.push(`scenes[${i}].prompt cleaned`);
      }
    });
  }

  // Special page prompts
  if (book.specialPagePrompts) {
    for (const key of Object.keys(book.specialPagePrompts)) {
      if (typeof book.specialPagePrompts[key] === "string") {
        const before = book.specialPagePrompts[key];
        book.specialPagePrompts[key] = sanitizeText(book.specialPagePrompts[key]);
        if (before !== book.specialPagePrompts[key]) changes.push(`specialPagePrompts.${key} cleaned`);
      }
    }
  }

  // Cover prompt (coloring books)
  if (typeof book.coverPrompt === "string") {
    const before = book.coverPrompt;
    book.coverPrompt = sanitizeText(book.coverPrompt);
    if (before !== book.coverPrompt) changes.push("coverPrompt cleaned");
  }

  return { book, changes };
}

function backupFile(srcPath, backupDir) {
  fs.mkdirSync(backupDir, { recursive: true });
  const slug = path.basename(path.dirname(srcPath));
  const dst = path.join(backupDir, `${slug}.book.json.bak`);
  fs.copyFileSync(srcPath, dst);
}

(function main() {
  const slugs = fs.readdirSync(STORIES_DIR).filter((n) => {
    const dir = path.join(STORIES_DIR, n);
    return fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, "book.json"));
  });

  const backupDir = path.join(__dirname, "..", "_backup-20260421-template-generic-migration");
  console.log(`Migrating ${slugs.length} books. Backup dir: ${backupDir}\n`);

  let changedCount = 0;
  let totalChanges = 0;
  for (const slug of slugs) {
    const p = path.join(STORIES_DIR, slug, "book.json");
    backupFile(p, backupDir);
    const { book, changes } = migrateBook(p);
    if (changes.length > 0) {
      fs.writeFileSync(p, JSON.stringify(book, null, 2) + "\n", "utf-8");
      console.log(`  ✓ ${slug}  (${changes.length} edit${changes.length > 1 ? "s" : ""})`);
      changedCount++;
      totalChanges += changes.length;
    } else {
      console.log(`  - ${slug}  (no change)`);
    }
  }

  console.log(`\nDone. ${changedCount}/${slugs.length} books updated, ${totalChanges} total edits.`);
})();
