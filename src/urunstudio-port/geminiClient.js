/**
 * geminiClient.js — Node.js port of MasalSensinUrunStudio's geminiClient.ts.
 *
 * Adapts the browser-based GoogleGenAI client to Node:
 *   - reads GOOGLE_API_KEY from process.env (instead of localStorage)
 *   - exposes generateText / generateTextDeep / generateImage / Type
 *   - no KIE.ai fallback in this port (UrunStudio's web build has one; here we
 *     surface the error so the caller can decide how to handle quota issues)
 *
 * 1:1 functional parity with the original TS where possible. No added features.
 */

const { GoogleGenAI, Type } = require("@google/genai");

const ANALYSIS_MODEL = "gemini-3.1-pro-preview";
const IMAGE_GEN_MODEL = "gemini-3.1-flash-image-preview";

function getApiKey() {
  const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";
  return key;
}

function getClient() {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      "API anahtari ayarlanmadi. GOOGLE_API_KEY (veya GEMINI_API_KEY) ortam degiskenini tanimlayin."
    );
  }
  return new GoogleGenAI({ apiKey });
}

async function _withRetry(fn, maxRetries = 3) {
  let lastError;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = (err && err.message) || String(err);
      const isRetryable =
        msg.includes("503") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("high demand") ||
        msg.includes("429") ||
        msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("deadline");
      if (!isRetryable || i === maxRetries) throw err;
      const delay = Math.min(2000 * Math.pow(2, i), 15000);
      console.log(`[geminiClient] Retry ${i + 1}/${maxRetries} after ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/**
 * Plain text / structured JSON generation.
 * @param {string} prompt
 * @param {object} [responseSchema] — optional JSON schema; when supplied, response is JSON
 * @returns {Promise<string>}
 */
async function generateText(prompt, responseSchema) {
  return _withRetry(async () => {
    const ai = getClient();
    const config = {};
    if (responseSchema) {
      config.responseMimeType = "application/json";
      config.responseSchema = responseSchema;
    }
    const response = await ai.models.generateContent({
      model: ANALYSIS_MODEL,
      contents: prompt,
      config,
    });
    return response.text || "";
  });
}

/**
 * Deep-thinking text generation with optional web search grounding.
 * @param {string} prompt
 * @param {{thinking?: number, search?: boolean}} [options]
 * @returns {Promise<string>}
 */
async function generateTextDeep(prompt, options = {}) {
  return _withRetry(async () => {
    const ai = getClient();
    const config = {};
    if (options.thinking) {
      config.thinkingConfig = { thinkingBudget: options.thinking };
    }
    if (options.search) {
      config.tools = [{ googleSearch: {} }];
    }
    const response = await ai.models.generateContent({
      model: ANALYSIS_MODEL,
      contents: prompt,
      config,
    });
    return response.text || "";
  });
}

/**
 * Image generation.
 * @param {string} prompt
 * @param {string[]} [referenceImages] — each either a data URL or raw base64
 * @param {string} [aspectRatio] — e.g. "2:3", "3:4"
 * @returns {Promise<string>} — data URL (data:image/png;base64,...)
 */
async function generateImage(prompt, referenceImages = [], aspectRatio = "2:3") {
  // KIE-first image generation (user preference: all visuals via KIE.ai nano-banana).
  // Gemini used as fallback only if KIE fails.
  try {
    const { kieGenerateImage } = require("./kieClient");
    return await kieGenerateImage(prompt, referenceImages, aspectRatio);
  } catch (kieErr) {
    console.warn("[geminiClient] KIE failed, falling back to Gemini:", (kieErr?.message || kieErr).toString().slice(0, 140));
  }

  return _withRetry(async () => {
    const ai = getClient();

    const parts = [];

    // Reference images FIRST for consistency
    for (const b64 of referenceImages) {
      if (!b64) continue;
      const matches = b64.match(/^data:([^;]*);base64,(.+)$/);
      if (matches) {
        parts.push({
          inlineData: {
            mimeType: matches[1] || "image/jpeg",
            data: matches[2],
          },
        });
      } else {
        parts.push({
          inlineData: { mimeType: "image/jpeg", data: b64 },
        });
      }
    }

    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: IMAGE_GEN_MODEL,
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio,
          imageSize: "2K",
        },
      },
    });

    const imagePart = response.candidates &&
      response.candidates[0] &&
      response.candidates[0].content &&
      response.candidates[0].content.parts &&
      response.candidates[0].content.parts.find((p) => p.inlineData);

    if (!imagePart || !imagePart.inlineData) {
      throw new Error("Gorsel olusturulamadi");
    }
    return `data:image/png;base64,${imagePart.inlineData.data}`;
  });
}

module.exports = {
  Type,
  ANALYSIS_MODEL,
  IMAGE_GEN_MODEL,
  getClient,
  getApiKey,
  generateText,
  generateTextDeep,
  generateImage,
};
