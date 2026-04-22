// KIE.ai Node client — ported from UrunStudio browser kieClient.ts
// API key from process.env.KIE_API_KEY

const KIE_API_BASE = "https://api.kie.ai";
const KIE_UPLOAD_BASE = "https://kieai.redpandaai.co";
const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 300000; // 5 min

function getApiKey() {
  const k = process.env.KIE_API_KEY;
  if (!k) throw new Error("KIE_API_KEY missing — set in env");
  return k;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
  };
}

async function uploadDataUrlToKie(dataUrl) {
  const fileName = `urunstudio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
  const r = await fetch(`${KIE_UPLOAD_BASE}/api/file-base64-upload`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ base64Data: dataUrl, uploadPath: "urunstudio/refs", fileName }),
  });
  const d = await r.json();
  if (!d.success && d.code !== 200) throw new Error(`KIE upload failed: ${d.msg || JSON.stringify(d)}`);
  const url = d.data?.downloadUrl;
  if (!url) throw new Error("KIE upload: no downloadUrl in response");
  return url;
}

async function ensureHttpUrl(ref) {
  if (ref.startsWith("http")) return ref;
  if (ref.startsWith("data:image")) return uploadDataUrlToKie(ref);
  throw new Error("Unknown reference image format: " + ref.slice(0, 40));
}

async function createTask(prompt, imageUrls, aspectRatio) {
  // Always use nano-banana-2 endpoint — matches Masal's own kie-image.js
  // (src/api/kie-image.js) which reliably renders long Turkish across text pages.
  // Previously this port switched to `google/nano-banana-edit` when refs were
  // present, but that endpoint mangles multi-paragraph Turkish (observed on
  // back-cover/sender-note pages). nano-banana-2 accepts refs via `image_input`
  // and preserves full Turkish diacritics + long summaries.
  const body = {
    model: "nano-banana-2",
    input: {
      prompt,
      aspect_ratio: aspectRatio || "2:3",
      resolution: "2K",
      output_format: "png",
    },
  };
  if (imageUrls.length > 0) {
    body.input.image_input = imageUrls.slice(0, 8);
  }

  const r = await fetch(`${KIE_API_BASE}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (d.code !== 200) throw new Error(`KIE createTask failed: ${d.msg || JSON.stringify(d)}`);
  return d.data.taskId;
}

async function pollTask(taskId) {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const r = await fetch(`${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${taskId}`, {
      headers: authHeaders(),
    });
    const d = await r.json();
    const state = d.data?.state;
    if (state === "success") {
      const result = JSON.parse(d.data.resultJson);
      const url = result.resultUrls?.[0];
      if (!url) throw new Error("KIE: no resultUrl");
      return url;
    }
    if (state === "fail") throw new Error(`KIE generation failed: ${d.data?.failMsg || "unknown"}`);
    await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
  }
  throw new Error("KIE polling timeout");
}

async function urlToDataUrl(url) {
  const res = await fetch(url);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "image/png";
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

async function kieGenerateImage(prompt, referenceImages = [], aspectRatio = "2:3") {
  const httpRefs = [];
  for (const ref of referenceImages) {
    httpRefs.push(await ensureHttpUrl(ref));
  }
  const taskId = await createTask(prompt, httpRefs, aspectRatio);
  const resultUrl = await pollTask(taskId);
  return await urlToDataUrl(resultUrl);
}

module.exports = { kieGenerateImage };
