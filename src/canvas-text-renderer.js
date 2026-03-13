/**
 * CanvasTextRenderer - Illustrasyon uzerine profesyonel metin overlay
 *
 * Baloo2 (cocuk dostu yuvarlak font) ile gorselin ALT KISMINA metin yazar.
 * Seffaf gradient overlay + buyuk okunabilir font.
 *
 * Cikti boyutu: 1785x2526 px (3:4 portrait, yuksek cozunurluk)
 */

const { createCanvas, loadImage, registerFont } = require("canvas");
const fs = require("fs");
const path = require("path");
const { CANVAS_W: CW, CANVAS_H: CH } = require("./constants");

// Yas grubuna gore font ayarlari - BUYUK ve okunaklı
const AGE_FONTS = {
  "0-3": { titleSize: 96, bodySize: 74, lineH: 1.7, maxBodyLines: 4 },
  "3-6": { titleSize: 86, bodySize: 64, lineH: 1.65, maxBodyLines: 6 },
  "6-12": { titleSize: 74, bodySize: 54, lineH: 1.6, maxBodyLines: 10 },
};

// Font - Windows Segoe UI Bold (temiz, kalin, okunaklı)
let fontsRegistered = false;
const FONT_NAME = "StoryBold";

function ensureFonts() {
  if (fontsRegistered) return;

  // Segoe UI Bold - Windows'un en temiz kalin fontu
  const boldFonts = [
    "C:\\Windows\\Fonts\\segoeuib.ttf",   // Segoe UI Bold
    "C:\\Windows\\Fonts\\arialbd.ttf",     // Arial Bold fallback
  ];

  for (const fp of boldFonts) {
    try {
      if (fs.existsSync(fp)) {
        registerFont(fp, { family: FONT_NAME });
        console.log(`  [canvas] Font yuklendi: ${path.basename(fp)}`);
        break;
      }
    } catch (e) {}
  }

  fontsRegistered = true;
}

class CanvasTextRenderer {
  constructor() {
    ensureFonts();
    this.titleFont = FONT_NAME;
    this.bodyFont = FONT_NAME;
  }

  /**
   * Illustrasyon gorseline metin overlay ekler
   * @param {string|Buffer} imagePath - Illustrasyon PNG dosya yolu veya Buffer
   * @param {object} options
   * @returns {Promise<Buffer>} - Final composite PNG buffer
   */
  async renderTextOnImage(imagePath, options) {
    const {
      sceneNumber = 1,
      title = "",
      text = "",
      theme = {},
      ageGroup = "3-6",
      pageNumber = 1,
      totalScenes = 10,
      outputPath,
    } = options;

    const primary = theme.primaryColor || "#8b5cf6";
    const accent = theme.accentColor || "#fbbf24";
    const fonts = AGE_FONTS[ageGroup] || AGE_FONTS["3-6"];
    const tfont = this.titleFont;  // Baslik fontu (ExtraBold)
    const bfont = this.bodyFont;   // Govde fontu (Bold)

    // Canvas olustur
    const canvas = createCanvas(CW, CH);
    const ctx = canvas.getContext("2d");

    // 1. Arka plan: illustrasyon gorselini ciz
    try {
      const img = await loadImage(imagePath);
      const scale = Math.max(CW / img.width, CH / img.height);
      const sw = img.width * scale;
      const sh = img.height * scale;
      const sx = (CW - sw) / 2;
      const sy = (CH - sh) / 2;
      ctx.drawImage(img, sx, sy, sw, sh);
    } catch (e) {
      ctx.fillStyle = "#0f0f1a";
      ctx.fillRect(0, 0, CW, CH);
    }

    // 2. Alt kisim: seffaf gradient overlay (gorselin alt %42'si)
    const gradStartY = Math.round(CH * 0.55);
    const gradient = ctx.createLinearGradient(0, gradStartY, 0, CH);
    gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    gradient.addColorStop(0.10, "rgba(0, 0, 0, 0.06)");
    gradient.addColorStop(0.25, "rgba(0, 0, 0, 0.25)");
    gradient.addColorStop(0.45, "rgba(0, 0, 0, 0.50)");
    gradient.addColorStop(0.70, "rgba(0, 0, 0, 0.72)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0.85)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, gradStartY, CW, CH - gradStartY);

    // 3. Ust ve alt ince tema seritleri
    ctx.fillStyle = primary;
    ctx.fillRect(0, 0, CW, 5);
    ctx.fillStyle = accent;
    ctx.fillRect(0, CH - 5, CW, 5);

    // =============== METIN ALANI - ALT KISIM ===============
    const mx = 80; // Kenar boslugu
    const textAreaBottom = CH - 60; // Alt sinir
    const maxTextWidth = CW - mx * 2;

    // Oncelikle metin satirlarini hesapla (boyut belirlemek icin)
    let bodyFontSize = fonts.bodySize;
    ctx.font = `${bodyFontSize}px ${bfont}`;
    let bodyLines = this._wrapText(ctx, text, maxTextWidth);
    let bodyLineH = Math.round(bodyFontSize * fonts.lineH);

    // Metin sigmiyorsa font kucult
    const maxAvailH = Math.round(CH * 0.37); // Metin alani max yukseklik
    while (bodyLines.length * bodyLineH > maxAvailH - fonts.titleSize * 1.6 && bodyFontSize > fonts.bodySize * 0.6) {
      bodyFontSize -= 2;
      bodyLineH = Math.round(bodyFontSize * fonts.lineH);
      ctx.font = `${bodyFontSize}px ${bfont}`;
      bodyLines = this._wrapText(ctx, text, maxTextWidth);
    }

    // Hala sigmiyorsa kes
    const titleBlockH = Math.round(fonts.titleSize * 1.5) + 20;
    const maxBodyH = maxAvailH - titleBlockH;
    const maxLines = Math.floor(maxBodyH / bodyLineH);
    if (bodyLines.length > maxLines) {
      bodyLines = bodyLines.slice(0, maxLines);
      if (bodyLines.length > 0) {
        const lastLine = bodyLines[bodyLines.length - 1];
        const lastSpace = lastLine.lastIndexOf(" ");
        bodyLines[bodyLines.length - 1] = (lastSpace > 10 ? lastLine.substring(0, lastSpace) : lastLine.substring(0, Math.max(10, lastLine.length - 5))) + "...";
      }
    }

    // Toplam metin blogu yuksekligi
    const totalBodyH = bodyLines.length * bodyLineH;
    const totalTextH = titleBlockH + totalBodyH + 10;

    // Metin blogu alt kisimdan yukariya dogru konumlanir
    const textBlockTop = textAreaBottom - totalTextH;

    // 4. Sahne numarasi dairesi (metin blogunun basinda)
    const circleR = 32;
    const circleX = mx + circleR;
    const circleY = textBlockTop + circleR + 4;

    ctx.save();
    ctx.beginPath();
    ctx.arc(circleX, circleY, circleR + 5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(circleX, circleY, circleR, 0, Math.PI * 2);
    ctx.fillStyle = primary;
    ctx.fill();
    ctx.font = `36px ${tfont}`;
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${sceneNumber}`, circleX, circleY + 2);
    ctx.restore();

    // 5. Baslik (sahne dairesi yaninda, accent renk) - BUYUK
    const titleX = circleX + circleR + 20;
    const titleMaxW = CW - titleX - mx;

    let titleFontSize = fonts.titleSize;
    ctx.font = `${titleFontSize}px ${tfont}`;
    let titleLines = this._wrapText(ctx, title, titleMaxW);

    // Baslik 2 satirdan fazlaysa kucult
    while (titleLines.length > 2 && titleFontSize > fonts.titleSize * 0.65) {
      titleFontSize -= 4;
      ctx.font = `${titleFontSize}px ${tfont}`;
      titleLines = this._wrapText(ctx, title, titleMaxW);
    }

    const titleLineH = Math.round(titleFontSize * 1.3);
    const titleY = textBlockTop + 8;

    ctx.save();
    ctx.font = `${titleFontSize}px ${tfont}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    for (let i = 0; i < titleLines.length; i++) {
      const y = titleY + i * titleLineH;
      // Golge (3 katman derin golge)
      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      ctx.fillText(titleLines[i], titleX + 5, y + 5);
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillText(titleLines[i], titleX + 3, y + 3);
      ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
      ctx.fillText(titleLines[i], titleX + 1, y + 1);
      // Ana metin - parlak accent tonu
      ctx.fillStyle = accent;
      ctx.fillText(titleLines[i], titleX, y);
    }
    ctx.restore();

    // Dekoratif ayirici cizgi
    const sepY = titleY + titleLines.length * titleLineH + 12;
    ctx.save();
    const lineGrad = ctx.createLinearGradient(mx, sepY, mx + 400, sepY);
    lineGrad.addColorStop(0, accent);
    lineGrad.addColorStop(0.6, "rgba(255, 255, 255, 0.3)");
    lineGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(mx, sepY);
    ctx.lineTo(mx + 400, sepY);
    ctx.stroke();
    ctx.restore();

    // 6. Hikaye metni (beyaz, word-wrapped, BUYUK font, golge)
    const bodyStartY = sepY + 18;

    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    for (let i = 0; i < bodyLines.length; i++) {
      const y = bodyStartY + i * bodyLineH;
      const line = bodyLines[i];

      ctx.font = `${bodyFontSize}px ${bfont}`;

      // Golge (cift katman - daha kalin)
      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.fillText(line, mx + 4, y + 4);
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.fillText(line, mx + 2, y + 2);

      // Ana metin
      ctx.fillStyle = "rgba(255, 255, 255, 0.97)";
      ctx.fillText(line, mx, y);
    }
    ctx.restore();

    // 7. PNG buffer olarak export
    const buffer = canvas.toBuffer("image/png");

    if (outputPath) {
      fs.writeFileSync(outputPath, buffer);
    }

    return buffer;
  }

  // =========================================================================
  // METIN SARMALAMA (Canvas measureText kullanan)
  // =========================================================================
  _wrapText(ctx, text, maxWidth) {
    if (!text) return [""];

    const paragraphs = text.split(/\n/);
    const lines = [];

    for (const para of paragraphs) {
      if (para.trim() === "") {
        lines.push(""); // Paragraf boslugu
        continue;
      }

      const words = para.split(/\s+/);
      let currentLine = "";

      for (const word of words) {
        const testLine = currentLine ? currentLine + " " + word : word;
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }

      if (currentLine) {
        lines.push(currentLine);
      }
    }

    return lines;
  }

  // =========================================================================
  // RENK YARDIMCILARI
  // =========================================================================
  _hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
      : { r: 139, g: 92, b: 246 };
  }

  _lightenColor(hex, amount) {
    const rgb = this._hexToRgb(hex);
    const r = Math.min(255, rgb.r + amount);
    const g = Math.min(255, rgb.g + amount);
    const b = Math.min(255, rgb.b + amount);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

module.exports = CanvasTextRenderer;
