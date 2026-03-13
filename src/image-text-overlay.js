/**
 * ImageTextOverlay - V2 (Profesyonel Cocuk Kitabi Stili)
 *
 * Sharp + SVG kullanarak gorsel uzerine renkli, cerceveli metin overlay ekler.
 * Referans: Deniz Alti Kesfi PDF stili - renkli metinler, dekoratif cerceveler.
 *
 * Yontem: SVG text render -> Sharp composite
 */

const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

class ImageTextOverlay {
  /**
   * HEX rengi RGB'ye cevirir
   */
  _hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
      : { r: 139, g: 92, b: 246 };
  }

  /**
   * Rengi koyulastir/aciklastir
   */
  _adjustColor(hex, amount) {
    const rgb = this._hexToRgb(hex);
    const r = Math.max(0, Math.min(255, rgb.r + amount));
    const g = Math.max(0, Math.min(255, rgb.g + amount));
    const b = Math.max(0, Math.min(255, rgb.b + amount));
    return `rgb(${r},${g},${b})`;
  }

  /**
   * Gorsel uzerine baslik ve hikaye metni ekler - RENKLI CERCEVE stili
   */
  async addTextOverlay(imagePath, options) {
    const {
      sceneNumber,
      title,
      text,
      totalScenes = 10,
      theme = {},
      outputPath,
      width = 1785,
      height = 2526,
    } = options;

    const primary = theme.primaryColor || "#8b5cf6";
    const secondary = theme.secondaryColor || "#FF8F00";
    const accent = theme.accentColor || "#FFF3E0";
    const rgb = this._hexToRgb(primary);

    // 1. Orijinal gorseli yukle ve boyutlandir
    let baseImage;
    if (fs.existsSync(imagePath)) {
      baseImage = await sharp(imagePath)
        .resize(width, height, { fit: "cover", position: "center" })
        .png()
        .toBuffer();
    } else {
      baseImage = await sharp({
        create: { width, height, channels: 4, background: { r: 15, g: 15, b: 26, alpha: 1 } }
      }).png().toBuffer();
    }

    // 2. Metin cerceveli overlay SVG olustur
    const overlaySVG = this._createFramedTextSVG(width, height, {
      sceneNumber,
      title,
      text,
      totalScenes,
      primary,
      secondary,
      accent,
      rgb,
    });

    // 3. Birlestir
    const result = await sharp(baseImage)
      .composite([
        { input: Buffer.from(overlaySVG), top: 0, left: 0 },
      ])
      .png({ quality: 95 })
      .toBuffer();

    if (outputPath) {
      fs.writeFileSync(outputPath, result);
    }

    return result;
  }

  /**
   * Kapak gorseli icin ozel overlay - PROFESYONEL KAPAK
   */
  async addCoverOverlay(imagePath, options) {
    const {
      title,
      childName,
      theme = {},
      outputPath,
      width = 1785,
      height = 2526,
    } = options;

    const primary = theme.primaryColor || "#8b5cf6";
    const secondary = theme.secondaryColor || "#FF8F00";
    const rgb = this._hexToRgb(primary);
    const secRgb = this._hexToRgb(secondary);

    let baseImage;
    if (fs.existsSync(imagePath)) {
      baseImage = await sharp(imagePath)
        .resize(width, height, { fit: "cover", position: "center" })
        .png()
        .toBuffer();
    } else {
      baseImage = await sharp({
        create: { width, height, channels: 4, background: { r: 15, g: 15, b: 26, alpha: 1 } }
      }).png().toBuffer();
    }

    const coverSVG = this._createCoverSVG(width, height, {
      title,
      childName,
      primary,
      secondary,
      rgb,
      secRgb,
    });

    const result = await sharp(baseImage)
      .composite([
        { input: Buffer.from(coverSVG), top: 0, left: 0 },
      ])
      .png({ quality: 95 })
      .toBuffer();

    if (outputPath) {
      fs.writeFileSync(outputPath, result);
    }

    return result;
  }

  // ======================================================================
  // RENKLI CERCEVELI METIN SVG - Sahne sayfalari icin
  // ======================================================================
  _createFramedTextSVG(w, h, { sceneNumber, title, text, totalScenes, primary, secondary, accent, rgb }) {
    const mx = Math.round(w * 0.05); // Kenar boslugu
    const frameW = w - mx * 2;

    // Font boyutlari
    const titleSize = Math.round(w * 0.038);
    const textSize = Math.round(w * 0.024);
    const numSize = Math.round(w * 0.026);

    // Metin satirlari
    const titleLines = this._wrapText(title, 25);
    const textLines = this._wrapText(text, 42);

    // Boyutlar hesapla
    const titleLineH = Math.round(titleSize * 1.35);
    const textLineH = Math.round(textSize * 1.7);
    const titleBlockH = titleLines.length * titleLineH;
    const textBlockH = textLines.length * textLineH;

    // Cerceve ic padding
    const padTop = Math.round(w * 0.04);
    const padBottom = Math.round(w * 0.035);
    const padX = Math.round(w * 0.04);

    // Toplam cerceve yuksekligi
    const frameH = padTop + titleBlockH + 30 + textBlockH + padBottom + 20; // +20 dekoratif ust ban

    // Cerceve Y pozisyonu (alt kisimda)
    const frameY = h - frameH - Math.round(h * 0.03);
    const frameX = mx;

    // Radius
    const radius = Math.round(w * 0.02);

    // Sahne numarasi dairesi boyutlari
    const circR = Math.round(w * 0.03);
    const circX = frameX + frameW / 2;
    const circY = frameY - circR + 5;

    // Dekoratif ust bant Y
    const bandH = 8;
    const bandY = frameY;

    // Baslik Y
    const titleStartY = frameY + padTop + bandH + 10;

    // Hikaye metni Y
    const bodyStartY = titleStartY + titleBlockH + 25;

    // Basligi olustur (renkli, golge efektli)
    let titleSVG = "";
    for (let i = 0; i < titleLines.length; i++) {
      const ty = titleStartY + i * titleLineH;
      // Golge
      titleSVG += `<text x="${frameX + padX + 3}" y="${ty + 3}"
        font-family="Segoe UI, Arial, sans-serif" font-weight="800"
        font-size="${titleSize}" fill="rgba(0,0,0,0.3)"
        >${this._escapeXml(titleLines[i])}</text>`;
      // Ana metin (tema rengi)
      titleSVG += `<text x="${frameX + padX}" y="${ty}"
        font-family="Segoe UI, Arial, sans-serif" font-weight="800"
        font-size="${titleSize}" fill="${primary}"
        >${this._escapeXml(titleLines[i])}</text>`;
    }

    // Hikaye metnini olustur (beyaz, okunabilir)
    let bodySVG = "";
    for (let i = 0; i < textLines.length; i++) {
      const by = bodyStartY + i * textLineH;
      // Golge
      bodySVG += `<text x="${frameX + padX + 2}" y="${by + 2}"
        font-family="Segoe UI, Arial, sans-serif" font-weight="500"
        font-size="${textSize}" fill="rgba(0,0,0,0.2)"
        >${this._escapeXml(textLines[i])}</text>`;
      // Ana metin
      bodySVG += `<text x="${frameX + padX}" y="${by}"
        font-family="Segoe UI, Arial, sans-serif" font-weight="500"
        font-size="${textSize}" fill="white"
        >${this._escapeXml(textLines[i])}</text>`;
    }

    // Sayfa numarasi
    const pageNumSize = Math.round(w * 0.014);
    const pageNumY = h - Math.round(h * 0.015);

    // Dekoratif yildizlar / noktalar
    const starSize = Math.round(w * 0.012);

    return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Cerceve gradient arka plan -->
        <linearGradient id="frameBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgb(${rgb.r},${rgb.g},${rgb.b})" stop-opacity="0.88"/>
          <stop offset="100%" stop-color="rgb(${Math.max(0,rgb.r-40)},${Math.max(0,rgb.g-40)},${Math.max(0,rgb.b-40)})" stop-opacity="0.94"/>
        </linearGradient>

        <!-- Golge filtresi -->
        <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="rgba(0,0,0,0.5)"/>
        </filter>

        <!-- Daire golge -->
        <filter id="circleShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="rgba(0,0,0,0.4)"/>
        </filter>
      </defs>

      <!-- ANA CERCEVE - yuvarlatilmis dikdortgen -->
      <rect x="${frameX}" y="${frameY}" width="${frameW}" height="${frameH}"
        rx="${radius}" ry="${radius}" fill="url(#frameBg)" filter="url(#shadow)"/>

      <!-- Cerceve kenari (ince parlak cizgi) -->
      <rect x="${frameX}" y="${frameY}" width="${frameW}" height="${frameH}"
        rx="${radius}" ry="${radius}"
        fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="3"/>

      <!-- Ust dekoratif bant (acik renk) -->
      <rect x="${frameX}" y="${frameY}" width="${frameW}" height="${bandH + radius}"
        rx="${radius}" ry="${radius}" fill="rgba(255,255,255,0.15)"/>
      <rect x="${frameX}" y="${frameY + radius}" width="${frameW}" height="${bandH}"
        fill="rgba(255,255,255,0.15)"/>

      <!-- Sahne numarasi dairesi -->
      <circle cx="${circX}" cy="${circY}" r="${circR + 4}"
        fill="rgba(0,0,0,0.3)" filter="url(#circleShadow)"/>
      <circle cx="${circX}" cy="${circY}" r="${circR}"
        fill="${secondary}"/>
      <circle cx="${circX}" cy="${circY}" r="${circR}"
        fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="3"/>
      <text x="${circX}" y="${circY + Math.round(numSize * 0.35)}" text-anchor="middle"
        font-family="Segoe UI, Arial, sans-serif" font-weight="800"
        font-size="${numSize}" fill="white">${sceneNumber}</text>

      <!-- Baslik (renkli + golge) -->
      ${titleSVG}

      <!-- Dekoratif ayirici cizgi -->
      <line x1="${frameX + padX}" y1="${titleStartY + titleBlockH + 8}"
        x2="${frameX + padX + Math.round(frameW * 0.3)}" y2="${titleStartY + titleBlockH + 8}"
        stroke="rgba(255,255,255,0.4)" stroke-width="2" stroke-linecap="round"/>
      <circle cx="${frameX + padX + Math.round(frameW * 0.3) + 10}" cy="${titleStartY + titleBlockH + 8}"
        r="4" fill="${secondary}"/>

      <!-- Hikaye metni (beyaz + golge) -->
      ${bodySVG}

      <!-- Dekoratif kose yildizlari -->
      <text x="${frameX + 20}" y="${frameY + frameH - 15}"
        font-family="Segoe UI, Arial, sans-serif" font-size="${starSize}"
        fill="rgba(255,255,255,0.3)">&#10022;</text>
      <text x="${frameX + frameW - 30}" y="${frameY + frameH - 15}"
        font-family="Segoe UI, Arial, sans-serif" font-size="${starSize}"
        fill="rgba(255,255,255,0.3)">&#10022;</text>

      <!-- Sayfa numarasi -->
      <text x="${w / 2}" y="${pageNumY}" text-anchor="middle"
        font-family="Segoe UI, Arial, sans-serif" font-size="${pageNumSize}"
        fill="white" opacity="0.5" font-weight="600">${sceneNumber} / ${totalScenes}</text>

      <!-- Ust-sol marka -->
      <rect x="${mx - 5}" y="18" width="${Math.round(w * 0.1)}" height="${Math.round(w * 0.025)}"
        rx="12" ry="12" fill="rgba(0,0,0,0.35)"/>
      <text x="${mx + Math.round(w * 0.05) - 5}" y="${18 + Math.round(w * 0.018)}" text-anchor="middle"
        font-family="Segoe UI, Arial, sans-serif" font-size="${Math.round(w * 0.016)}"
        fill="white" opacity="0.7" font-weight="700">MASAL</text>
    </svg>`;
  }

  // ======================================================================
  // KAPAK SVG - Profesyonel kapak
  // ======================================================================
  _createCoverSVG(w, h, { title, childName, primary, secondary, rgb, secRgb }) {
    const mx = Math.round(w * 0.06);
    const escapedTitle = this._escapeXml(title);
    const escapedName = this._escapeXml(childName);

    // Baslik altta
    const titleLines = this._wrapText(title, 18);
    const titleFontSize = Math.round(w * 0.055);
    const titleLineH = Math.round(titleFontSize * 1.2);
    const subFontSize = Math.round(w * 0.024);
    const brandFontSize = Math.round(w * 0.018);

    // Alt bant boyutlari
    const bandH = Math.round(h * 0.28);
    const bandY = h - bandH;

    // Baslik Y pozisyonu
    const titleStartY = bandY + Math.round(bandH * 0.25);

    // Baslik SVG (golge + ana)
    let titleSVG = "";
    for (let i = 0; i < titleLines.length; i++) {
      const ty = titleStartY + i * titleLineH;
      // Koyu golge
      titleSVG += `<text x="${mx + 4}" y="${ty + 4}"
        font-family="Segoe UI, Arial, sans-serif" font-weight="900"
        font-size="${titleFontSize}" fill="rgba(0,0,0,0.5)"
        >${this._escapeXml(titleLines[i])}</text>`;
      // Ana metin - beyaz
      titleSVG += `<text x="${mx}" y="${ty}"
        font-family="Segoe UI, Arial, sans-serif" font-weight="900"
        font-size="${titleFontSize}" fill="white"
        >${this._escapeXml(titleLines[i])}</text>`;
    }

    const decorY = titleStartY + titleLines.length * titleLineH + 15;
    const subY = decorY + Math.round(w * 0.045);

    return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Alt bant gradient -->
        <linearGradient id="coverBand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgb(${rgb.r},${rgb.g},${rgb.b})" stop-opacity="0"/>
          <stop offset="20%" stop-color="rgb(${rgb.r},${rgb.g},${rgb.b})" stop-opacity="0.6"/>
          <stop offset="50%" stop-color="rgb(${Math.max(0,rgb.r-30)},${Math.max(0,rgb.g-30)},${Math.max(0,rgb.b-30)})" stop-opacity="0.85"/>
          <stop offset="100%" stop-color="rgb(${Math.max(0,rgb.r-60)},${Math.max(0,rgb.g-60)},${Math.max(0,rgb.b-60)})" stop-opacity="0.95"/>
        </linearGradient>

        <!-- Ust bant gradient -->
        <linearGradient id="coverTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgb(${rgb.r},${rgb.g},${rgb.b})" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="rgb(${rgb.r},${rgb.g},${rgb.b})" stop-opacity="0"/>
        </linearGradient>
      </defs>

      <!-- Ust renk banti -->
      <rect x="0" y="0" width="${w}" height="${Math.round(h * 0.08)}" fill="url(#coverTop)"/>

      <!-- Ust serit -->
      <rect x="0" y="0" width="${w}" height="6" fill="${primary}"/>

      <!-- Ust-sol: "Kisiye Ozel Macera Kitabi" -->
      <rect x="${mx - 10}" y="25" width="${Math.round(w * 0.45)}" height="${Math.round(w * 0.035)}"
        rx="20" ry="20" fill="rgba(0,0,0,0.4)"/>
      <text x="${mx + Math.round(w * 0.45)/2 - 10}" y="${25 + Math.round(w * 0.026)}" text-anchor="middle"
        font-family="Segoe UI, Arial, sans-serif" font-size="${Math.round(w * 0.02)}"
        fill="white" opacity="0.85" font-weight="600">Ki&#351;iye &#214;zel Macera Kitab&#305;</text>

      <!-- MASAL marka (sag ust) -->
      <rect x="${w - mx - Math.round(w * 0.13)}" y="25" width="${Math.round(w * 0.13)}" height="${Math.round(w * 0.035)}"
        rx="20" ry="20" fill="rgba(255,255,255,0.2)"/>
      <text x="${w - mx - Math.round(w * 0.065)}" y="${25 + Math.round(w * 0.026)}" text-anchor="middle"
        font-family="Segoe UI, Arial, sans-serif" font-size="${brandFontSize}"
        fill="white" font-weight="800">MASAL</text>

      <!-- Alt gradient bant -->
      <rect x="0" y="${bandY}" width="${w}" height="${bandH}" fill="url(#coverBand)"/>

      <!-- Dekoratif ince cizgi (bant ustu) -->
      <line x1="${mx}" y1="${bandY + Math.round(bandH * 0.15)}"
        x2="${w - mx}" y2="${bandY + Math.round(bandH * 0.15)}"
        stroke="rgba(255,255,255,0.2)" stroke-width="1"/>

      <!-- Baslik (golge + beyaz) -->
      ${titleSVG}

      <!-- Dekoratif cizgi (baslik alti) -->
      <rect x="${mx}" y="${decorY}" width="${Math.round(w * 0.15)}" height="6" rx="3" fill="${secondary}"/>
      <circle cx="${mx + Math.round(w * 0.15) + 15}" cy="${decorY + 3}" r="5" fill="white" opacity="0.6"/>

      <!-- Cocuk ismi -->
      <text x="${mx + 3}" y="${subY + 3}"
        font-family="Segoe UI, Arial, sans-serif" font-size="${subFontSize}"
        fill="rgba(0,0,0,0.3)" font-weight="600">${escapedName} i&#231;in &#246;zel olarak haz&#305;rland&#305;</text>
      <text x="${mx}" y="${subY}"
        font-family="Segoe UI, Arial, sans-serif" font-size="${subFontSize}"
        fill="white" opacity="0.9" font-weight="600">${escapedName} i&#231;in &#246;zel olarak haz&#305;rland&#305;</text>

      <!-- Alt serit -->
      <rect x="0" y="${h - 6}" width="${w}" height="6" fill="${secondary}"/>

      <!-- Dekoratif kose yildizlari -->
      <text x="${mx}" y="${h - 20}"
        font-family="Segoe UI, Arial, sans-serif" font-size="20"
        fill="rgba(255,255,255,0.3)">&#10022; &#10022; &#10022;</text>
      <text x="${w - mx - 60}" y="${h - 20}"
        font-family="Segoe UI, Arial, sans-serif" font-size="20"
        fill="rgba(255,255,255,0.3)">&#10022; &#10022; &#10022;</text>
    </svg>`;
  }

  // ======================================================================
  // Yardimci fonksiyonlar
  // ======================================================================
  _escapeXml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  _wrapText(text, maxCharsPerLine) {
    if (!text) return [""];
    const words = text.split(" ");
    const lines = [];
    let current = "";

    for (const word of words) {
      if (current.length + word.length + 1 > maxCharsPerLine && current.length > 0) {
        lines.push(current.trim());
        current = word;
      } else {
        current += (current ? " " : "") + word;
      }
    }
    if (current) lines.push(current.trim());

    return lines;
  }
}

module.exports = ImageTextOverlay;
