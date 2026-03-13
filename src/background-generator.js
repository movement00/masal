/**
 * Metin sayfası arka plan üretici
 * 3 yöntem: AI pastel, bulanık sahne, programatik gradient
 */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

// Standart boyut: 1024x1365 (3:4 portrait, A4 benzeri)
const BG_WIDTH = 1024;
const BG_HEIGHT = 1365;

/**
 * Sahne görselinden bulanık arka plan oluşturur
 * @param {string} sourceImagePath - Kaynak sahne görseli
 * @param {string} outputPath - Çıktı dosyası
 * @param {object} theme - Tema renkleri
 */
async function createBlurredBackground(sourceImagePath, outputPath, theme) {
  const accentHex = theme.accentColor || "#FFF0E5";
  const { r, g, b } = hexToRgb(accentHex);

  // Renk tint overlay SVG
  const tintOverlay = Buffer.from(`
    <svg width="${BG_WIDTH}" height="${BG_HEIGHT}">
      <rect width="100%" height="100%" fill="rgba(${r},${g},${b},0.4)"/>
    </svg>
  `);

  await sharp(sourceImagePath)
    .resize(BG_WIDTH, BG_HEIGHT, { fit: "cover" })
    .blur(30)
    .modulate({ brightness: 1.3, saturation: 0.6 })
    .composite([
      { input: tintOverlay, blend: "over" }
    ])
    .png()
    .toFile(outputPath);

  console.log(`    [bg-gen] Bulanık arka plan oluşturuldu: ${path.basename(outputPath)}`);
}

/**
 * Tema renklerinden gradient arka plan oluşturur
 * @param {string} outputPath - Çıktı dosyası
 * @param {object} theme - Tema renkleri
 * @param {string} mood - Sahne ruh hali (opsiyonel)
 */
async function createGradientBackground(outputPath, theme, mood) {
  const primary = theme.primaryColor || "#FF6B35";
  const accent = theme.accentColor || "#FFF0E5";
  const secondary = theme.secondaryColor || "#FFA07A";

  const { r: pr, g: pg, b: pb } = hexToRgb(primary);
  const { r: ar, g: ag, b: ab } = hexToRgb(accent);
  const { r: sr, g: sg, b: sb } = hexToRgb(secondary);

  // Dekoratif gradient SVG
  const svgContent = `
    <svg width="${BG_WIDTH}" height="${BG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Ana gradient -->
        <linearGradient id="mainGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:rgba(${ar},${ag},${ab},1)"/>
          <stop offset="50%" style="stop-color:rgba(${sr},${sg},${sb},0.3)"/>
          <stop offset="100%" style="stop-color:rgba(${ar},${ag},${ab},1)"/>
        </linearGradient>
        <!-- Dekoratif daireler -->
        <radialGradient id="circle1" cx="15%" cy="20%">
          <stop offset="0%" style="stop-color:rgba(${pr},${pg},${pb},0.12)"/>
          <stop offset="100%" style="stop-color:rgba(${pr},${pg},${pb},0)"/>
        </radialGradient>
        <radialGradient id="circle2" cx="85%" cy="75%">
          <stop offset="0%" style="stop-color:rgba(${sr},${sg},${sb},0.15)"/>
          <stop offset="100%" style="stop-color:rgba(${sr},${sg},${sb},0)"/>
        </radialGradient>
        <radialGradient id="circle3" cx="50%" cy="50%">
          <stop offset="0%" style="stop-color:rgba(${pr},${pg},${pb},0.08)"/>
          <stop offset="100%" style="stop-color:rgba(${pr},${pg},${pb},0)"/>
        </radialGradient>
      </defs>
      <!-- Ana arka plan -->
      <rect width="100%" height="100%" fill="url(#mainGrad)"/>
      <!-- Dekoratif daireler -->
      <circle cx="150" cy="270" r="300" fill="url(#circle1)"/>
      <circle cx="874" cy="1020" r="350" fill="url(#circle2)"/>
      <circle cx="512" cy="680" r="500" fill="url(#circle3)"/>
      <!-- İnce nokta deseni -->
      ${generateDotPattern(pr, pg, pb)}
      <!-- Üst ve alt dekoratif çizgiler -->
      <rect x="0" y="0" width="${BG_WIDTH}" height="12" fill="rgba(${pr},${pg},${pb},0.25)" rx="0"/>
      <rect x="0" y="${BG_HEIGHT - 12}" width="${BG_WIDTH}" height="12" fill="rgba(${pr},${pg},${pb},0.25)" rx="0"/>
    </svg>
  `;

  await sharp(Buffer.from(svgContent))
    .png()
    .toFile(outputPath);

  console.log(`    [bg-gen] Gradient arka plan oluşturuldu: ${path.basename(outputPath)}`);
}

/**
 * SVG nokta deseni oluşturur
 */
function generateDotPattern(r, g, b) {
  let dots = "";
  const spacing = 80;
  for (let y = 40; y < BG_HEIGHT; y += spacing) {
    for (let x = 40; x < BG_WIDTH; x += spacing) {
      // Hafif random offset
      const ox = x + ((x * 7 + y * 3) % 11) - 5;
      const oy = y + ((y * 5 + x * 2) % 9) - 4;
      dots += `<circle cx="${ox}" cy="${oy}" r="2" fill="rgba(${r},${g},${b},0.06)"/>`;
    }
  }
  return dots;
}

/**
 * Hex renk kodunu RGB'ye dönüştürür
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 255, g: 240, b: 229 };
}

module.exports = {
  createBlurredBackground,
  createGradientBackground,
  BG_WIDTH,
  BG_HEIGHT,
};
