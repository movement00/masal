# Canvas→AI Hardening Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate silent Canvas fallback in Masal PDF pipeline. Every page must be AI-generated — if AI fails after retries, the book fails loudly rather than shipping degraded Canvas pages.

**Architecture:** Add a `retryWithBackoff` helper that wraps each AI call (30s/60s/120s waits between attempts). On exhaustion, mark book as degraded: write `pages-failed.json`, rename PDF to `kitap-degraded.pdf`, emit SSE `degraded` event. Canvas fallback kept only behind env flag `MASAL_FORCE_CANVAS_FALLBACK=1` for emergency.

**Tech Stack:** Node.js, book-orchestrator.js, scene-generator.js, text-page-renderer.js (fallback), coverAgent.js (prompt tweaks)

---

## Root Cause (from 2026-04-21 Elif run)

`/tmp/masal-server.log` line 763-795:
- Scene 14 OK → back-cover call: KIE fetch failed, Gemini fetch failed → Canvas fallback
- FunFact 4 + 9: `Kie.ai bağlantı hatası: 6 ardışık hata` → Canvas fallback
- Certificate: fetch failed 2x → skipped
- Network blackout (~19:30) hit during finalize phase AFTER all 14 scenes succeeded

Retry logic exists but fires back-to-back without wait — useless when network is actually down for 30-60s.

## Files Touched

- `src/util/retry-with-backoff.js` (new)
- `src/agents/book-orchestrator.js` (wrap 4 AI calls)
- `src/text-page-renderer.js` (fix Canvas back-cover layout overlap bug)
- `src/urunstudio-port/coverAgent.js` (restore decorative typography; guard duplicate prefix)

## Task 1: Retry helper with exponential backoff

**Files:**
- Create: `src/util/retry-with-backoff.js`

- [ ] **Step 1: Write helper**

```js
// src/util/retry-with-backoff.js
async function retryWithBackoff(fn, { label, attempts = 3, waits = [30000, 60000, 120000], onAttempt } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      if (onAttempt) onAttempt(i, attempts);
      const result = await fn();
      if (i > 1) console.log(`  [retry] ${label} succeeded on attempt ${i}/${attempts}`);
      return result;
    } catch (err) {
      lastErr = err;
      console.error(`  [retry] ${label} attempt ${i}/${attempts} failed: ${err.message}`);
      if (i < attempts) {
        const wait = waits[i - 1] || 60000;
        console.log(`  [retry] ${label} waiting ${wait/1000}s before retry...`);
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${lastErr?.message || "unknown"}`);
}
module.exports = { retryWithBackoff };
```

- [ ] **Step 2: Commit**

## Task 2: Wrap cover/back-cover/sender-note/hero/funfact/diploma in retry

**Files:**
- Modify: `src/agents/book-orchestrator.js`

Wrap each generate* call with `retryWithBackoff`. If retry throws, catch it and proceed to Task 3 (degraded handling) instead of immediate Canvas fallback.

Guard:
```js
const FORCE_CANVAS = process.env.MASAL_FORCE_CANVAS_FALLBACK === "1";
```

If `!FORCE_CANVAS` and AI exhausted: push to `degradedPages` array, leave page file NOT written (so PDFBuilder notices) or write marker.

- [ ] **Step 1: Add require + FORCE_CANVAS flag at top of BookOrchestrator class**

- [ ] **Step 2: Cover block (line 790-856): wrap generateCoverImage in retry; if exhausted and !FORCE_CANVAS, throw "degraded" error caught below**

- [ ] **Step 3: Back-cover block (line 907-966): same pattern**

- [ ] **Step 4: Sender-note block (line 968-1000): same pattern**

- [ ] **Step 5: FunFact block (line 1032-1069): same pattern per fact**

- [ ] **Step 6: Diploma block (line 1072-1097): same pattern**

- [ ] **Step 7: Hero block (line 860-905): same pattern**

- [ ] **Step 8: Commit**

## Task 3: Degraded book mode

**Files:**
- Modify: `src/agents/book-orchestrator.js`
- Modify: `src/pdf-builder.js` (skip missing pages)

- [ ] **Step 1: Collect degraded pages in `this.degradedPages = []`**

- [ ] **Step 2: After PDF build, if degradedPages.length > 0: rename PDF to `kitap-degraded.pdf`, write `pages-failed.json`, emit SSE `degraded` event with list of failed pages**

- [ ] **Step 3: Commit**

## Task 4: Fix Canvas back-cover layout overlap bug

**Files:**
- Modify: `src/text-page-renderer.js` (renderBackCoverPage)

Current bug: "Elif, hata yapmaktan..." description block renders at same Y as "BU KİTAPTA NE ÖĞRENDİK?" lessons block → overlap. Also "MASAL" text instead of logo artwork.

- [ ] **Step 1: Read current renderBackCoverPage**
- [ ] **Step 2: Stack blocks vertically with measured heights; embed assets/brand/masalsensin-logo.jpg instead of "MASAL" text**
- [ ] **Step 3: Render test output; visually verify no overlap**
- [ ] **Step 4: Commit**

## Task 5: Cover decorative typography (with duplicate-prefix guard)

**Files:**
- Modify: `src/urunstudio-port/coverAgent.js`

F2 fix this morning removed "hand-lettered decorative script with flourishes" to avoid duplicate "Öykü: Öykü'nün" bug. Restore decorative directive; guard bug via conditional prefix stripping in fakeConcept.bookTitle.

- [ ] **Step 1: Read current generateCoverImage prompt builder**
- [ ] **Step 2: Restore decorative language; explicitly forbid rendering any prefix like "Öykü:" even if included in concept**
- [ ] **Step 3: Commit**

## Task 6: Regen Elif cover + back-cover; visual verification

- [ ] **Step 1: Run regen script on existing Elif book (reuse character profile/scenes); regenerate only cover + back-cover**
- [ ] **Step 2: Read PNGs; verify sizes (>2MB = AI, <500KB = fallback); visually inspect**
- [ ] **Step 3: Send samples to user via Telegram; await feedback**

---
