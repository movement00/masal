/**
 * Constants - Uygulama genelinde kullanilan sabitler
 */

// SSE (Server-Sent Events)
const SSE_BUFFER_MAX = 50;

// Upload limitleri
const UPLOAD_MAX_BYTES = 50 * 1024 * 1024; // 50MB
const UPLOAD_TIMEOUT_MS = 60000; // 60 saniye

// Gorsel boyutlari (3:4 portrait, yuksek cozunurluk)
const CANVAS_W = 1785;
const CANVAS_H = 2526;

// PDF A4 boyutlari (pt, 72 DPI)
const PDF_W = 595.28;
const PDF_H = 841.89;

// Varsayilan degerler
const DEFAULT_PORT = 3000;
const DEFAULT_AGE = "6";
const DEFAULT_AGE_GROUP = "3-6";
const DEFAULT_IMAGE_PROVIDER = "google";

// Retry sayilari
const MAX_SCENE_RETRIES = 1;
const MAX_API_RETRIES = 2;
const MAX_DOWNLOAD_RETRIES = 3;

// Validasyon esik degerleri (QualityValidator)
const VALIDATION_OUTFIT_THRESHOLD = 70;   // Kiyafet uyumu min skoru
const VALIDATION_STYLE_THRESHOLD = 65;    // 3D Pixar kalitesi min skoru
const VALIDATION_OVERALL_THRESHOLD = 60;  // Ortalama gecis skoru
const VALIDATION_COMPOSITION_THRESHOLD = 50; // Kompozisyon min skoru
const VALIDATION_FACE_THRESHOLD = 60;     // Yuz tutarliligi min skoru
const MAX_REGEN_ATTEMPTS = 1;             // Basarisiz sahne icin maks tekrar uretim

module.exports = {
  SSE_BUFFER_MAX,
  UPLOAD_MAX_BYTES,
  UPLOAD_TIMEOUT_MS,
  CANVAS_W,
  CANVAS_H,
  PDF_W,
  PDF_H,
  DEFAULT_PORT,
  DEFAULT_AGE,
  DEFAULT_AGE_GROUP,
  DEFAULT_IMAGE_PROVIDER,
  MAX_SCENE_RETRIES,
  MAX_API_RETRIES,
  MAX_DOWNLOAD_RETRIES,
  VALIDATION_OUTFIT_THRESHOLD,
  VALIDATION_STYLE_THRESHOLD,
  VALIDATION_OVERALL_THRESHOLD,
  VALIDATION_COMPOSITION_THRESHOLD,
  VALIDATION_FACE_THRESHOLD,
  MAX_REGEN_ATTEMPTS,
};
