require("dotenv").config();

const config = {
  google: {
    apiKey: process.env.GOOGLE_API_KEY,
    model: "gemini-3-pro-image-preview",
  },
  fal: {
    apiKey: process.env.FAL_API_KEY,
    model: "fal-ai/nano-banana-pro",
    editModel: "fal-ai/nano-banana-pro/edit",
  },
  kie: {
    apiKey: process.env.KIE_API_KEY,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-4o",
  },
  geminiVision: {
    model: process.env.GEMINI_VISION_MODEL || "gemini-2.0-flash",
    enabled: process.env.GEMINI_VISION_ENABLED !== "false",
  },
  imageProvider: process.env.IMAGE_PROVIDER || "google",
  output: {
    dir: process.env.OUTPUT_DIR || "./output",
    resolution: process.env.IMAGE_RESOLUTION || "2K",
    format: process.env.IMAGE_FORMAT || "png",
  },
};

/**
 * Gerekli ortam degiskenlerini dogrular.
 * Eksik key varsa acik hata mesaji gosterir ve process.exit(1) cagirir.
 */
config.validate = function () {
  const errors = [];

  if (!config.openai.apiKey) {
    errors.push("OPENAI_API_KEY eksik (.env dosyasını kontrol edin)");
  }

  const provider = config.imageProvider;
  if (provider === "google" && !config.google.apiKey) {
    errors.push("GOOGLE_API_KEY eksik (IMAGE_PROVIDER=google secili)");
  }
  if (provider === "fal" && !config.fal.apiKey) {
    errors.push("FAL_API_KEY eksik (IMAGE_PROVIDER=fal secili)");
  }
  if (provider === "kie" && !config.kie.apiKey) {
    errors.push("KIE_API_KEY eksik (IMAGE_PROVIDER=kie secili)");
  }

  if (errors.length > 0) {
    console.error("\n╔══════════════════════════════════════════╗");
    console.error("║   MASAL - YAPILANDIRMA HATASI            ║");
    console.error("╚══════════════════════════════════════════╝");
    errors.forEach((e) => console.error(`  ✗ ${e}`));
    console.error("\n  .env dosyasini kontrol edin veya .env.example'i referans alin.\n");
    process.exit(1);
  }
};

module.exports = config;
