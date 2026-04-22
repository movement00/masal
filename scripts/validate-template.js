// Validate a Masal book.json template.
// Exits 0 if clean, 1 if issues found.
//
// Usage:
//   node scripts/validate-template.js <slug | full-path>
//   node scripts/validate-template.js --all   (scans all src/stories/*)

const fs = require("fs");
const path = require("path");

const STORIES_DIR = path.join(__dirname, "..", "src", "stories");

const BAD_PATTERNS = [
  { label: "hardcoded hair color/texture", re: /\b(wavy|curly|straight|messy|tousled)\s+(light\s+brown|dark\s+brown|blonde|black|red|auburn|chestnut|golden|brown|gray|silver)\s+hair/gi },
  { label: "hardcoded eye color", re: /\b(hazel|hazel-green|green|blue|brown|dark\s+brown|amber|gray)\s+(?:almond-shaped\s+)?eyes/gi },
  { label: "hardcoded dimples", re: /\b(prominent|cute|small|tiny)?\s*dimple(s)?\s+on/gi },
  { label: "hardcoded skin tone", re: /\b(light\s+warm\s+olive|warm\s+tan\s+olive|olive|tan|fair|pale|dark|golden)\s+skin\s+tone/gi },
  { label: "hardcoded freckles", re: /\bfreckles\s+(across|on)/gi },
  { label: "Ice Age brand bleed", re: /\bIce\s+Age\b/gi },
  { label: "Shrek brand bleed", re: /\bShrek\b/gi },
  { label: "DreamWorks brand bleed", re: /\bDreamWorks\b/gi },
  { label: "English Bedtime!", re: /\bBedtime!/g },
  { label: "English Wake up!", re: /\bWake\s+up!/g },
  { label: "PLACEHOLDER prompt (REPLACE/TODO/TBD)", re: /\b(REPLACE|TODO|TBD|FIXME)\b/g },
];

const REQUIRED_TOP_FIELDS = ["id", "title", "description", "ageGroup", "pageCount", "lessons", "scenes"];

function hasPersonalization(book) {
  if (book.templateHeroName) return true;
  if (book.heroName) return true;
  const s = JSON.stringify(book);
  return /\{CHILD_NAME\}/.test(s);
}

function scan(bookPath, book) {
  const issues = [];

  for (const field of REQUIRED_TOP_FIELDS) {
    if (book[field] === undefined || book[field] === null) {
      issues.push(`MISSING REQUIRED FIELD: ${field}`);
    }
  }

  if (!hasPersonalization(book)) {
    issues.push("NO PERSONALIZATION: template must have templateHeroName OR {CHILD_NAME} placeholder");
  }

  if (!Array.isArray(book.scenes) || book.scenes.length === 0) {
    issues.push("NO SCENES");
    return issues;
  }

  book.scenes.forEach((sc, i) => {
    const label = `scene ${sc.sceneNumber || i + 1}`;
    if (!sc.prompt) issues.push(`${label}: missing prompt`);
    if (!sc.outfitId) issues.push(`${label}: missing outfitId (orchestrator default "casual" will apply with warning)`);
    for (const { label: patLabel, re } of BAD_PATTERNS) {
      re.lastIndex = 0;
      if (re.test(sc.prompt || "")) issues.push(`${label}: leak — ${patLabel}`);
      re.lastIndex = 0;
      if (re.test(sc.text || "")) issues.push(`${label} text: leak — ${patLabel}`);
    }
  });

  // Special page prompts
  if (book.specialPagePrompts) {
    for (const key of Object.keys(book.specialPagePrompts)) {
      const val = book.specialPagePrompts[key];
      for (const { label: patLabel, re } of BAD_PATTERNS) {
        re.lastIndex = 0;
        if (re.test(val || "")) issues.push(`specialPagePrompts.${key}: leak — ${patLabel}`);
      }
    }
  }

  if (typeof book.coverPrompt === "string") {
    for (const { label: patLabel, re } of BAD_PATTERNS) {
      re.lastIndex = 0;
      if (re.test(book.coverPrompt)) issues.push(`coverPrompt: leak — ${patLabel}`);
    }
  }

  return issues;
}

function resolveBookPath(arg) {
  if (fs.existsSync(arg)) return arg;
  const candidate = path.join(STORIES_DIR, arg, "book.json");
  if (fs.existsSync(candidate)) return candidate;
  return null;
}

function scanOne(bookPath) {
  const book = JSON.parse(fs.readFileSync(bookPath, "utf-8"));
  const issues = scan(bookPath, book);
  if (issues.length === 0) {
    console.log("✓ OK:", bookPath);
    return true;
  }
  console.log("✗ ISSUES:", bookPath);
  for (const i of issues) console.log("  -", i);
  return false;
}

(function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: node scripts/validate-template.js <slug | full-path | --all>");
    process.exit(2);
  }
  if (arg === "--all") {
    const slugs = fs.readdirSync(STORIES_DIR).filter((n) => {
      const dir = path.join(STORIES_DIR, n);
      return fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, "book.json"));
    });
    let pass = 0, fail = 0;
    for (const slug of slugs) {
      const p = path.join(STORIES_DIR, slug, "book.json");
      if (scanOne(p)) pass++; else fail++;
    }
    console.log(`\nTotal: ${pass} OK, ${fail} with issues (${slugs.length} scanned)`);
    process.exit(fail > 0 ? 1 : 0);
  }
  const p = resolveBookPath(arg);
  if (!p) { console.error("not found:", arg); process.exit(2); }
  process.exit(scanOne(p) ? 0 : 1);
})();
