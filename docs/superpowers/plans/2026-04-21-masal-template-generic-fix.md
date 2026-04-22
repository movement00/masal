# Masal Template Generic-For-Any-Child Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task.

**Goal:** Every Masal book template must produce correct output for ANY child name + ANY child photo, with zero quality issues. Currently templates bake-in the original hero's physical traits + style brand names + English text, which all leak into the customer's personalized book.

**Architecture:** Split concerns sharply. Template scene.prompt stays GENERIC (no physical description, no brand names, no English action text). Character identity comes EXCLUSIVELY from `character-profile.png` reference. Orchestrator-level sanitizer strips any legacy literal bleed. Outfit grid fixed for single-outfit case. Morphology bug already fixed. Scene gen identity lock strengthened to match text-page quality.

**Tech Stack:** Node.js, book-orchestrator.js, prompt-architect.js, coverAgent.js (urunstudio-port), text-generator.js (Gemini enhance), book.json templates in src/stories/

**Out of scope (DO NOT TOUCH):** `C:/Users/ASUS/Desktop/MasalSensinUrunStudio/` — UrunStudio itself is perfect per user. All fixes happen in `C:/Users/ASUS/Desktop/masal/`.

---

## Evidence (Phase 1 findings from Yiğit test run)

From `C:/Users/ASUS/Desktop/masal/output/ai-1776802406187-toprak-n-uyku-ekspresi_Yi__it_2026-04-21/`:

1. **Character drift**: scene-01-final shows wavy-brown-haired boy (Toprak look), but character-profile.png and scene-01-text mini correctly show Yiğit (straight black hair).
2. **Outfit grid corruption**: outfit-grid.png has 3 cells saying "AWAITING ADDITIONAL OUTFIT SPECIFICATIONS" with random Toprak-like head sketches — this bad grid becomes scene reference.
3. **Brand bleed**: scene-01-final wall shows "SHREK" and "ICE AGE" posters (scene.prompt literally contains "Ice Age and Shrek style 3D CGI").
4. **English text**: scene-01-final wall shows "Yigit! Bedtime!" in English text (scene.prompt has "Bedtime!" action word).
5. **Morphology**: texts.json scene 5 has "Yiğit'ınin" (double-suffix) — **FIXED in code already** (book-orchestrator.js regex).
6. **Heavy text**: 3-6 age book uses adult vocabulary ("gölgede bırakıyordu", "görkemli yapıydı") — Gemini enhance exists in code but server hasn't been restarted to pick it up.

## Files Touched (scope map)

- `src/agents/book-orchestrator.js` — scene prompt sanitizer pipeline + stronger identity lock flag + outfit-grid single-outfit branch
- `src/agents/prompt-architect.js` — buildScenePrompt identity-lock language (match text-page strength), single-outfit grid helper
- `src/urunstudio-port/coverAgent.js` — no changes (already fixed earlier today)
- `src/api/text-generator.js` — no changes (Gemini enhance already added, just needs server restart)
- `src/stories/*/book.json` (all 40+ templates) — one-time migration to strip hardcoded physical descriptions + literal brand names + English action text from scene.prompt

Helper scripts (new):
- `scripts/migrate-templates-generic.js` — one-time batch script to sanitize all book.json files
- `scripts/validate-template.js` — linter that runs on every new template to catch regressions

---

## Task 1: Scene-prompt runtime sanitizer (orchestrator-level)

Defensive layer that cleans problematic strings at order time, independent of template quality. Safe net while template migration runs.

**Files:**
- Modify: `src/agents/book-orchestrator.js` around personalizeFieldsMorpho helpers (currently line ~200)

- [ ] **Step 1: Add `sanitizeScenePrompt` function before `applyAll`**

```js
// Strip legacy literal-bleed phrases from scene prompts.
// These made sense as STYLE DIRECTION in concept generation but AI interprets them
// as literal content to render ("Ice Age posters", "Bedtime! wall text").
const sanitizeScenePrompt = (s) => {
  if (typeof s !== "string") return s;
  let out = s;
  // Brand-name style bleed → generic Pixar
  out = out.replace(/\bIce\s+Age\s+and\s+Shrek\s+style\b/gi, "Pixar 3D CGI animation style");
  out = out.replace(/\bIce\s+Age\s*(?:and|\/|,)\s*Shrek\b/gi, "Pixar 3D CGI");
  out = out.replace(/\bin\s+the\s+style\s+of\s+(?:Ice\s+Age|Shrek|Disney|Pixar)\b/gi, "in premium 3D CGI style");
  // Lone brand mentions (rarer) — strip if adjacent to "style/film/movie"
  out = out.replace(/\b(Shrek|Ice\s+Age)\s+(?:style|film|movie|like)\b/gi, "premium 3D CGI style");
  return out;
};
```

- [ ] **Step 2: Call `sanitizeScenePrompt` inside `personalizeFieldsMorpho` after applyAll**

In the scenes loop, after the existing `if (sc.prompt) sc.prompt = genderSanitize(applyAll(sc.prompt));`, wrap with sanitizer:

```js
if (sc.prompt) sc.prompt = sanitizeScenePrompt(genderSanitize(applyAll(sc.prompt)));
```

- [ ] **Step 3: Add explicit "no English text on walls" directive in prompt-architect buildScenePrompt**

In `src/agents/prompt-architect.js::buildScenePrompt`, after the existing references section, add:

```js
parts.push("");
parts.push("═══ TEXT RENDERING RULES (CRITICAL) ═══");
parts.push("- Any English words in this prompt are ART DIRECTION for the AI — NEVER render them as visible text in the scene (no English words on walls, no posters with English titles, no signs in English).");
parts.push("- Brand names (Shrek, Ice Age, Pixar, Disney) are STYLE REFERENCES ONLY — NEVER render them as literal posters, logos, or products in the scene.");
parts.push("- Only Turkish text may appear visibly in the scene, and only when the prompt explicitly requests a Turkish sign/label.");
```

- [ ] **Step 4: Syntax check**

Run: `cd "C:/Users/ASUS/Desktop/masal" && node -c src/agents/book-orchestrator.js && node -c src/agents/prompt-architect.js && echo OK`
Expected: `OK`

---

## Task 2: Strengthen identity lock in scene prompt (match text-page quality)

Currently text pages say "CHARACTER IDENTITY LOCK: face MUST be IDENTICAL to FIRST REFERENCE" — explicit, strong. Scene gen just says "match Image 2 exactly" which is weaker, letting AI drift to outfit-grid filler.

**Files:**
- Modify: `src/agents/prompt-architect.js::buildScenePrompt` (currently around line 183-250)

- [ ] **Step 1: Insert explicit identity-lock block after IMAGE REFERENCES**

In buildScenePrompt, after the existing image references and before "RULE: If the child has glasses...", add:

```js
parts.push("");
parts.push("═══ CHARACTER IDENTITY LOCK (CRITICAL, HIGHEST PRIORITY) ═══");
parts.push(`- The child in this scene MUST have IDENTICAL face, hair (color + length + style), skin tone, eye shape and color to Image 1 (the real child photo).`);
parts.push("- If Image 2 (outfit/character grid) shows a different-looking character, IGNORE the grid character's facial features — use ONLY the outfit from Image 2, and take face/hair/skin tone from Image 1.");
parts.push("- If any cell of Image 2 contains placeholder text like 'AWAITING ADDITIONAL OUTFIT SPECIFICATIONS', IGNORE that cell — use only the filled cell showing the actual outfit.");
parts.push("- Hair type is NON-NEGOTIABLE: straight stays straight, curly stays curly, short stays short. Never render a straight-haired child as curly or vice versa.");
parts.push("- ANY deviation from Image 1's face identity is a QUALITY FAILURE.");
parts.push("");
```

- [ ] **Step 2: Remove hardcoded physical description from characterDesc fallback**

Find the line `characterDesc = \`a ${this.ageDesc} ${this.genderDesc} with the exact same face...` (around line 247).
Replace with:

```js
characterDesc = `the main child character (exact identity from Image 1 real child photo — same face, hair, skin, accessories — do NOT invent or change any physical feature)`;
```

- [ ] **Step 3: Syntax check**

Run: `cd "C:/Users/ASUS/Desktop/masal" && node -c src/agents/prompt-architect.js && echo OK`

---

## Task 3: Fix outfit grid for single-outfit case

When there's only 1 unique outfit, don't generate a 2x2 grid (3 cells become "AWAITING" placeholders that corrupt scene refs). Instead generate a clean 4-pose turntable of the SAME outfit — or simply skip the grid and use character-profile as outfit ref.

**Files:**
- Modify: `src/agents/book-orchestrator.js` around line 500-560 (Phase 2.5 block)
- Modify: `src/agents/prompt-architect.js::buildCombinedOutfitGridPrompt` around line 548

- [ ] **Step 1: Branch Phase 2.5 logic based on outfit count**

In book-orchestrator.js, wrap the grid generation block with a single-outfit branch:

```js
if (uniqueOutfits.length > 0 && characterProfileRef) {
  if (uniqueOutfits.length === 1) {
    // SINGLE OUTFIT: skip grid, reuse character-profile as outfit ref + augment description in scene prompt
    console.log("  [orchestrator] FAZ 2.5: tek outfit — grid atlandı, character-profile outfit ref olarak kullanilacak");
    combinedOutfitRef = characterProfileRef;
    combinedOutfitBuffer = characterProfileBuffer;
    outfitProfileMap.set(uniqueOutfits[0].outfitId, { ref: characterProfileRef, buffer: characterProfileBuffer });
    this.sendSSE({ type: "heartbeat", message: "Tek outfit icin character-profile referans olarak kullanilacak" });
  } else {
    // MULTI-OUTFIT: existing grid logic (unchanged)
    // ... existing gridPrompt + generateScene code ...
  }
}
```

- [ ] **Step 2: Update buildCombinedOutfitGridPrompt to refuse single-outfit input**

```js
buildCombinedOutfitGridPrompt(outfits) {
  if (!Array.isArray(outfits) || outfits.length < 2) {
    throw new Error("buildCombinedOutfitGridPrompt requires 2+ outfits; use character-profile ref for single outfit");
  }
  // ... rest unchanged ...
}
```

- [ ] **Step 3: Syntax check + smoke test**

Run: `cd "C:/Users/ASUS/Desktop/masal" && node -c src/agents/book-orchestrator.js && node -e "const PA = require('./src/agents/prompt-architect'); try { new PA({scenes:[]}, {}).buildCombinedOutfitGridPrompt([{outfitId:'casual',description:'x'}]); console.log('FAIL'); } catch(e) { console.log('OK (throws on single outfit):', e.message); }"`
Expected: `OK (throws on single outfit): buildCombinedOutfitGridPrompt requires 2+ outfits...`

---

## Task 4: Template migration script (one-time batch fix)

Sanitize all existing book.json templates to remove Toprak-specific bleed. Run once; regressions prevented by Task 5 linter.

**Files:**
- Create: `scripts/migrate-templates-generic.js`

- [ ] **Step 1: Write migration script**

```js
// scripts/migrate-templates-generic.js
const fs = require("fs");
const path = require("path");

const STORIES_DIR = path.join(__dirname, "..", "src", "stories");

// Patterns that leak physical/brand info into scene prompts.
const PHYSICAL_DESC_PATTERNS = [
  // Curly/wavy hair color descriptors
  /\b(Messy,?\s+slightly\s+wavy\s+and\s+curly|wavy\s+and\s+curly|slightly\s+wavy|curly)\s+(light\s+brown|dark\s+brown|blonde|black|red|auburn)\s+hair[^.]*\./gi,
  /\b(straight|short|long|messy)\s+(black|brown|blonde|red|gray)\s+hair[^.]*\./gi,
  // Eye color descriptors  
  /\b(huge|large|round)?\s*(hazel|hazel-green|green|blue|brown)\s+eyes[^.]*\./gi,
  // Dimples, freckles, skin tones
  /\b(very\s+prominent|cute)\s+dimple(s)?[^.]*\./gi,
  /\b(olive|tan|fair|dark)\s+skin(\s+tone)?[^.]*\./gi,
  /\b(chubby|soft|pink)\s+cheeks[^.]*\./gi,
];

const BRAND_BLEED_REPLACEMENTS = [
  [/\bIce\s+Age\s+and\s+Shrek\s+style\b/gi, "Pixar 3D CGI animation style"],
  [/\bIce\s+Age\s*(?:and|\/|,)\s*Shrek\b/gi, "Pixar 3D CGI"],
  [/\bin\s+the\s+style\s+of\s+(?:Ice\s+Age|Shrek)\b/gi, "in premium 3D CGI style"],
  [/\b(Shrek|Ice\s+Age)\s+(?:style|film|movie|like)\b/gi, "premium 3D CGI style"],
];

// English action/command words that AI renders as literal wall text.
const ENGLISH_LEAK_REPLACEMENTS = [
  [/\bBedtime!\s*/g, ""],   // drop entirely
  [/\bWake\s+up!\s*/g, ""],
  [/\bHurry!\s*/g, ""],
];

function sanitizeText(txt) {
  if (typeof txt !== "string") return txt;
  let out = txt;
  for (const pat of PHYSICAL_DESC_PATTERNS) out = out.replace(pat, "");
  for (const [pat, repl] of BRAND_BLEED_REPLACEMENTS) out = out.replace(pat, repl);
  for (const [pat, repl] of ENGLISH_LEAK_REPLACEMENTS) out = out.replace(pat, repl);
  // Normalize whitespace
  out = out.replace(/\s+/g, " ").replace(/\s([.,!?])/g, "$1").trim();
  return out;
}

function migrateBook(bookPath) {
  const raw = fs.readFileSync(bookPath, "utf-8");
  const book = JSON.parse(raw);
  let changed = false;

  // Sanitize kahraman.fizikselOzellikleri (physicalFeatures) — keep only if generic
  if (book.characterDescription?.base && /hair|eyes|skin|dimple/i.test(book.characterDescription.base)) {
    const orig = book.characterDescription.base;
    book.characterDescription.base = "Turkish child; exact face, hair and skin tone come from the character-profile reference photo. No hardcoded physical traits — the reference photo is the source of truth.";
    if (orig !== book.characterDescription.base) changed = true;
  }

  // Sanitize each scene.prompt
  if (Array.isArray(book.scenes)) {
    for (const sc of book.scenes) {
      if (typeof sc.prompt === "string") {
        const before = sc.prompt;
        sc.prompt = sanitizeText(sc.prompt);
        if (before !== sc.prompt) changed = true;
      }
    }
  }

  // Sanitize specialPagePrompts too
  if (book.specialPagePrompts) {
    for (const key of Object.keys(book.specialPagePrompts)) {
      if (typeof book.specialPagePrompts[key] === "string") {
        const before = book.specialPagePrompts[key];
        book.specialPagePrompts[key] = sanitizeText(book.specialPagePrompts[key]);
        if (before !== book.specialPagePrompts[key]) changed = true;
      }
    }
  }

  return { book, changed };
}

function backupFile(srcPath, backupDir) {
  fs.mkdirSync(backupDir, { recursive: true });
  const slug = path.basename(path.dirname(srcPath));
  const dst = path.join(backupDir, `${slug}.book.json.bak`);
  fs.copyFileSync(srcPath, dst);
}

(function main() {
  const slugs = fs.readdirSync(STORIES_DIR).filter(n => {
    return fs.statSync(path.join(STORIES_DIR, n)).isDirectory() &&
           fs.existsSync(path.join(STORIES_DIR, n, "book.json"));
  });
  const backupDir = path.join(__dirname, "..", "_backup-20260421-template-generic-migration");
  console.log(`Migrating ${slugs.length} books. Backup dir: ${backupDir}`);
  let changedCount = 0;
  for (const slug of slugs) {
    const p = path.join(STORIES_DIR, slug, "book.json");
    backupFile(p, backupDir);
    const { book, changed } = migrateBook(p);
    if (changed) {
      fs.writeFileSync(p, JSON.stringify(book, null, 2) + "\n", "utf-8");
      console.log("  ✓", slug);
      changedCount++;
    } else {
      console.log("  -", slug, "(no change)");
    }
  }
  console.log(`\nDone. ${changedCount}/${slugs.length} books updated.`);
})();
```

- [ ] **Step 2: Run migration**

Run: `cd "C:/Users/ASUS/Desktop/masal" && node scripts/migrate-templates-generic.js`
Expected: list of updated books, backup created at `_backup-20260421-template-generic-migration/`

- [ ] **Step 3: Spot-check result**

Run: `node -e "const b=require('./src/stories/ai-1776802406187-toprak-n-uyku-ekspresi/book.json'); console.log(b.scenes[0].prompt);"`
Expected: prompt WITHOUT "wavy light brown hair", WITHOUT "Ice Age and Shrek", WITHOUT "Bedtime!"

---

## Task 5: Template validator (prevent future regressions)

Linter that runs on every new template and flags leak patterns. Run it in CI or before any Shopify upload.

**Files:**
- Create: `scripts/validate-template.js`

- [ ] **Step 1: Write validator**

```js
// scripts/validate-template.js
// Usage: node scripts/validate-template.js <path-to-book.json>
// Exits 0 if clean, 1 if issues found.
const fs = require("fs");
const path = require("path");

const BAD_PATTERNS = [
  { label: "hardcoded hair color", re: /\b(wavy|curly|straight|messy)\s+(light\s+brown|dark\s+brown|blonde|black|red|auburn|brown)\s+hair/gi },
  { label: "hardcoded eye color", re: /\b(hazel|green|blue|brown|gray)\s+eyes/gi },
  { label: "hardcoded dimples", re: /\bdimple(s)?\b/gi },
  { label: "hardcoded skin tone", re: /\b(olive|tan|fair|dark)\s+skin/gi },
  { label: "Ice Age brand bleed", re: /\bIce\s+Age\b/gi },
  { label: "Shrek brand bleed", re: /\bShrek\b/gi },
  { label: "English action word 'Bedtime!'", re: /\bBedtime!/g },
  { label: "missing CHARACTER_DESC marker", re: null, custom: (t) => typeof t === "string" && t.length > 50 && !/CHARACTER_DESC|\{CHILD_NAME\}/.test(t) },
];

const REQUIRED_TOP_FIELDS = ["id", "title", "description", "ageGroup", "pageCount", "lessons", "scenes"];
const REQUIRED_PERSONALIZATION = (b) => b.templateHeroName || JSON.stringify(b).includes("{CHILD_NAME}");

function scan(path, book) {
  const issues = [];
  for (const field of REQUIRED_TOP_FIELDS) {
    if (book[field] === undefined) issues.push(`MISSING REQUIRED FIELD: ${field}`);
  }
  if (!REQUIRED_PERSONALIZATION(book)) {
    issues.push("NO PERSONALIZATION: template must have templateHeroName OR {CHILD_NAME} placeholder");
  }
  if (Array.isArray(book.scenes)) {
    book.scenes.forEach((sc, i) => {
      if (!sc.prompt) issues.push(`Scene ${i+1}: missing prompt`);
      if (!sc.outfitId) issues.push(`Scene ${i+1}: missing outfitId (orchestrator will default to 'casual' with warning)`);
      if (/REPLACE|TODO|TBD/.test(sc.prompt || "")) issues.push(`Scene ${i+1}: placeholder prompt`);
      for (const { label, re, custom } of BAD_PATTERNS) {
        if (re && re.test(sc.prompt || "")) issues.push(`Scene ${i+1}: leak — ${label}`);
        if (custom && custom(sc.prompt)) issues.push(`Scene ${i+1}: ${label}`);
      }
    });
  }
  return issues;
}

(function main() {
  const argPath = process.argv[2];
  if (!argPath) {
    console.error("Usage: node scripts/validate-template.js <path-to-book.json | slug>");
    process.exit(2);
  }
  let bookPath = argPath;
  if (!fs.existsSync(bookPath)) {
    bookPath = path.join(__dirname, "..", "src", "stories", argPath, "book.json");
    if (!fs.existsSync(bookPath)) { console.error("not found:", argPath); process.exit(2); }
  }
  const book = JSON.parse(fs.readFileSync(bookPath, "utf-8"));
  const issues = scan(bookPath, book);
  if (issues.length === 0) {
    console.log("✓ OK:", bookPath);
    process.exit(0);
  }
  console.log("✗ ISSUES:", bookPath);
  for (const i of issues) console.log("  -", i);
  process.exit(1);
})();
```

- [ ] **Step 2: Smoke-test validator**

Run: `cd "C:/Users/ASUS/Desktop/masal" && node scripts/validate-template.js ai-1776802406187-toprak-n-uyku-ekspresi`
Expected: Either `✓ OK` (if Task 4 migration was already run) or `✗ ISSUES` (if run BEFORE migration — validates the linter catches leaks).

---

## Task 6: Server restart + final regression test

The Gemini text enhance (Task 57 earlier today) needs a server restart to take effect. Then regenerate Yiğit's book to verify everything works end-to-end.

- [ ] **Step 1: Restart server with all new code**

Run:
```bash
netstat -ano | grep :3000 | grep LISTENING | awk '{print $5}' | head -1 | xargs -I {} taskkill //PID {} //F
sleep 3
cd "C:/Users/ASUS/Desktop/masal" && set -a && source .env && set +a && nohup node src/server.js > /tmp/masal-server.log 2>&1 & disown
sleep 5
curl -sf http://localhost:3000/api/books > /dev/null && echo "SERVER READY"
```

- [ ] **Step 2: Re-run Yiğit/Toprak test**

Run: `cd "C:/Users/ASUS/agentclaw" && node _test-yigit-toprak.js` (uses existing yigit-photo.png + Toprak template)
Expected: generation completes ~8-10 min. No Canvas fallback. No "degraded" label.

- [ ] **Step 3: Verify output**

Visually check:
- `scene-01-final.png`: Yiğit has STRAIGHT BLACK hair (not wavy brown) matching character-profile. No Shrek/Ice Age posters. No English text on walls.
- `outfit-grid.png`: single character consistently posed (no "AWAITING" placeholders).
- `texts.json`: contains "Yiğit'in" (not "Yiğit'ının") — morphology correct.
- `sender-note.png`: "Canım Yiğit" + "Annen" (sender was set to Anne, kadin).
- Scene text reads simply for 3-6 age (Gemini enhance active).

- [ ] **Step 4: Compress + send PDF to user**

Compress via existing `_rebuild-yigit-pdf.js` pattern. Send via Telegram with verification notes for each category above.

---

## Task 7 (optional): Retrofit existing Shopify products with Ögretiyor visual

Deferred — this is a batch job that doesn't affect production quality, only listing completeness. Plan to resume after Task 1-6 verified correct.

---

## Self-Review

**Spec coverage:**
- ✓ Character identity drift → Task 2 (identity lock) + Task 4 (template migration removes bleed)
- ✓ Outfit grid single-outfit bug → Task 3
- ✓ Brand name bleed (Ice Age / Shrek) → Task 1 runtime sanitizer + Task 4 migration
- ✓ English text on walls → Task 1 runtime rule + Task 4 migration
- ✓ Morphology double-suffix → already fixed in code (before this plan was written)
- ✓ Heavy text for age group → Task 6 (server restart activates Gemini enhance)
- ✓ Sender note wrong gender → already fixed
- ✓ Template linter to prevent regressions → Task 5
- ✓ Don't touch UrunStudio → explicitly scoped out

**Placeholder scan:** All steps contain actual code, exact commands, and expected outputs. No TBD/TODO.

**Type consistency:** `sanitizeScenePrompt` defined in Task 1, used in Task 1. Migration patterns defined in Task 4, linter patterns similar shape in Task 5.

Plan is complete.
