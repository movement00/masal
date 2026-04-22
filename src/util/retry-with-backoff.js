// Retry wrapper with exponential backoff for AI calls.
// Real network blackouts last 30-120s; back-to-back retries without wait are useless.
// waits[i] = seconds to sleep BEFORE attempt i+1. Last entry ignored.
async function retryWithBackoff(fn, {
  label = "AI call",
  attempts = 3,
  waits = [30000, 60000, 120000],
  onAttempt = null,
} = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      if (onAttempt) onAttempt(i, attempts);
      const result = await fn();
      if (i > 1) {
        console.log(`  [retry] ${label} succeeded on attempt ${i}/${attempts}`);
      }
      return result;
    } catch (err) {
      lastErr = err;
      console.error(`  [retry] ${label} attempt ${i}/${attempts} failed: ${err.message}`);
      if (i < attempts) {
        const wait = waits[i - 1] || 60000;
        console.log(`  [retry] ${label} waiting ${Math.round(wait / 1000)}s before retry ${i + 1}/${attempts}...`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  const e = new Error(`${label} failed after ${attempts} attempts: ${lastErr?.message || "unknown"}`);
  e.cause = lastErr;
  e.exhausted = true;
  throw e;
}

module.exports = { retryWithBackoff };
