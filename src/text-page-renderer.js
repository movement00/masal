/**
 * TextPageRenderer - Profesyonel Çocuk Kitabı Metin Sayfası Renderer
 *
 * Sharp + SVG ile metin sayfalarını yüksek kalitede PNG olarak render eder.
 * PDFKit metin rendering yerine kullanılır - tam tipografi kontrolü sağlar.
 *
 * Render boyutu: 1785x2526 px (3:4 portrait, yüksek çözünürlük)
 */

const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const { CANVAS_W: PW, CANVAS_H: PH } = require("./constants");

// Yas grubuna gore font boyutlari
const AGE_FONTS = {
  "0-3": { title: 80, body: 58, lineH: 1.8, charsPerLine: 22, bodyLineH: 1.85 },
  "3-6": { title: 68, body: 46, lineH: 1.7, charsPerLine: 28, bodyLineH: 1.75 },
  "6-12": { title: 56, body: 42, lineH: 1.65, charsPerLine: 32, bodyLineH: 1.7 },
};

class TextPageRenderer {
  /**
   * Metin sayfasini profesyonel PNG olarak render eder
   */
  async renderTextPage(options) {
    const {
      textBgPath,
      sceneNumber,
      title,
      text,
      theme = {},
      ageGroup = "3-6",
      pageNumber = 1,
      totalScenes = 10,
      outputPath,
    } = options;

    const primary = theme.primaryColor || "#8b5cf6";
    const secondary = theme.secondaryColor || "#a78bfa";
    const accent = theme.accentColor || "#f5f0ff";
    const icon = theme.icon || "★";
    const fonts = AGE_FONTS[ageGroup] || AGE_FONTS["3-6"];

    // 1. Arka plan hazirla
    let bgBuffer;
    if (textBgPath && fs.existsSync(textBgPath)) {
      bgBuffer = await sharp(textBgPath)
        .resize(PW, PH, { fit: "cover" })
        .png()
        .toBuffer();
    } else {
      // Fallback: duz acik renk arka plan
      bgBuffer = await sharp({
        create: { width: PW, height: PH, channels: 4, background: this._hexToRgba(accent, 255) },
      }).png().toBuffer();
    }

    // 2. Metin SVG overlay olustur
    const textSVG = this._createTextPageSVG({
      sceneNumber,
      title,
      text,
      primary,
      secondary,
      accent,
      icon,
      fonts,
      pageNumber,
      totalScenes,
      ageGroup,
    });

    // 3. Birlestir
    const result = await sharp(bgBuffer)
      .composite([
        { input: Buffer.from(textSVG), top: 0, left: 0 },
      ])
      .png({ quality: 95 })
      .toBuffer();

    if (outputPath) {
      fs.writeFileSync(outputPath, result);
    }

    return result;
  }

  /**
   * Kapak sayfasini PNG olarak render eder
   */
  async renderCoverPage(options) {
    const {
      imagePath,
      title,
      childName,
      theme = {},
      ageGroup = "3-6",
      icon,
      outputPath,
    } = options;

    let bgBuffer;
    if (imagePath && fs.existsSync(imagePath)) {
      bgBuffer = await sharp(imagePath)
        .resize(PW, PH, { fit: "cover" })
        .png()
        .toBuffer();
    } else {
      bgBuffer = await sharp({
        create: { width: PW, height: PH, channels: 4, background: { r: 15, g: 15, b: 26, alpha: 255 } },
      }).png().toBuffer();
    }

    const coverSVG = this._createCoverSVG({
      title,
      childName,
      theme,
      ageGroup,
      icon: icon || theme.icon || "★",
    });

    const result = await sharp(bgBuffer)
      .composite([{ input: Buffer.from(coverSVG), top: 0, left: 0 }])
      .png({ quality: 95 })
      .toBuffer();

    if (outputPath) fs.writeFileSync(outputPath, result);
    return result;
  }

  /**
   * Ic kapak sayfasini PNG olarak render eder
   */
  async renderInnerCoverPage(options) {
    const { title, childName, theme = {}, ageGroup = "3-6", outputPath } = options;

    const primary = theme.primaryColor || "#8b5cf6";
    const secondary = theme.secondaryColor || "#a78bfa";
    const accent = theme.accentColor || "#f5f0ff";
    const icon = theme.icon || "★";

    const rgb = this._hexToRgb(primary);

    const bgBuffer = await sharp({
      create: { width: PW, height: PH, channels: 4, background: { r: 254, g: 252, b: 249, alpha: 255 } },
    }).png().toBuffer();

    const svg = this._createInnerCoverSVG({ title, childName, primary, secondary, accent, icon, rgb, ageGroup });

    const result = await sharp(bgBuffer)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .png({ quality: 95 })
      .toBuffer();

    if (outputPath) fs.writeFileSync(outputPath, result);
    return result;
  }

  /**
   * Ithaf sayfasini PNG olarak render eder
   */
  async renderDedicationPage(options) {
    const { childName, theme = {}, outputPath } = options;

    const primary = theme.primaryColor || "#8b5cf6";
    const secondary = theme.secondaryColor || "#a78bfa";
    const icon = theme.icon || "★";

    const bgBuffer = await sharp({
      create: { width: PW, height: PH, channels: 4, background: { r: 254, g: 252, b: 249, alpha: 255 } },
    }).png().toBuffer();

    const svg = this._createDedicationSVG({ childName, primary, secondary, icon });

    const result = await sharp(bgBuffer)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .png({ quality: 95 })
      .toBuffer();

    if (outputPath) fs.writeFileSync(outputPath, result);
    return result;
  }

  /**
   * "Biliyor Muydun?" sayfasini PNG olarak render eder
   */
  async renderFunFactPage(options) {
    const { funFact, theme = {}, outputPath, backgroundImagePath } = options;

    const factBg = theme.funFactBg || "#FF6D00";
    const icon = funFact.icon || theme.icon || "★";
    const rgb = this._hexToRgb(factBg);

    let bgBuffer;
    if (backgroundImagePath && fs.existsSync(backgroundImagePath)) {
      bgBuffer = await sharp(backgroundImagePath)
        .resize(PW, PH, { fit: "cover" })
        .png()
        .toBuffer();
    } else {
      bgBuffer = await sharp({
        create: { width: PW, height: PH, channels: 4, background: { r: rgb.r, g: rgb.g, b: rgb.b, alpha: 255 } },
      }).png().toBuffer();
    }

    const svg = this._createFunFactSVG({ funFact, factBg, icon, rgb });

    const result = await sharp(bgBuffer)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .png({ quality: 95 })
      .toBuffer();

    if (outputPath) fs.writeFileSync(outputPath, result);
    return result;
  }

  /**
   * Kapanis sayfasini PNG olarak render eder
   */
  async renderEndingPage(options) {
    const { childName, theme = {}, outputPath } = options;

    const primary = theme.primaryColor || "#8b5cf6";
    const icon = theme.icon || "★";
    const rgb = this._hexToRgb(primary);

    const bgBuffer = await sharp({
      create: { width: PW, height: PH, channels: 4, background: { r: 15, g: 15, b: 26, alpha: 255 } },
    }).png().toBuffer();

    const svg = this._createEndingSVG({ childName, primary, icon, rgb });

    const result = await sharp(bgBuffer)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .png({ quality: 95 })
      .toBuffer();

    if (outputPath) fs.writeFileSync(outputPath, result);
    return result;
  }

  /**
   * Arka kapak sayfasini PNG olarak render eder
   */
  async renderBackCoverPage(options) {
    const { title, childName, description, lessons, theme = {}, outputPath, backgroundImagePath } = options;
    const primary = theme.primaryColor || "#8b5cf6";
    const icon = theme.icon || "★";
    const rgb = this._hexToRgb(primary);

    let bgBuffer;
    if (backgroundImagePath && fs.existsSync(backgroundImagePath)) {
      bgBuffer = await sharp(backgroundImagePath)
        .resize(PW, PH, { fit: "cover" })
        .png()
        .toBuffer();
    } else {
      bgBuffer = await sharp({
        create: { width: PW, height: PH, channels: 4, background: { r: 15, g: 15, b: 26, alpha: 255 } },
      }).png().toBuffer();
    }

    const svg = this._createBackCoverSVG({ title, primary, rgb, childName, description, icon, lessons });

    const result = await sharp(bgBuffer)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .png({ quality: 95 })
      .toBuffer();

    if (outputPath) fs.writeFileSync(outputPath, result);
    return result;
  }

  /**
   * "Hikayemizin Kahramani" sayfasini render eder (V2 — D v5 layout).
   * AI bg üzerine gerçek fotoğrafları sharp ile SVG-çerçeve + gölgeli olarak yerleştirir.
   *
   * Layout:
   *   - 1 photo  → wide panorama, center of middle zone
   *   - 2 photos → side-by-side, middle zone (recommended — user default)
   *   - 3-5     → legacy grid (old _getPhotoGridLayout)
   *
   * Photo area (ratios on final page, PW=1785, PH=2526):
   *   x: 12% - 88% (width 76%)
   *   y: 33% - 70% (height 37%)
   */
  async renderHeroPage(options) {
    const { childPhotoPath, extraPhotoPaths = [], outputPath, backgroundImagePath } = options;

    // 1. Arka plan: AI uretilmis veya duz cream
    let bgBuffer;
    if (backgroundImagePath && fs.existsSync(backgroundImagePath)) {
      bgBuffer = await sharp(backgroundImagePath)
        .resize(PW, PH, { fit: "cover" })
        .png()
        .toBuffer();
    } else {
      bgBuffer = await sharp({
        create: { width: PW, height: PH, channels: 4, background: { r: 254, g: 252, b: 249, alpha: 255 } },
      }).png().toBuffer();
    }

    // 2. Tum fotograflari topla
    const allPhotos = [];
    if (childPhotoPath && fs.existsSync(childPhotoPath)) allPhotos.push(childPhotoPath);
    for (const ep of (extraPhotoPaths || [])) {
      if (ep && fs.existsSync(ep)) allPhotos.push(ep);
    }
    const photoCount = Math.min(allPhotos.length, 5);

    if (photoCount === 0) {
      // Foto yoksa sadece arka planı döndür
      if (outputPath) fs.writeFileSync(outputPath, bgBuffer);
      return bgBuffer;
    }

    // 3. D v5 layout coords (ratios on PW × PH)
    const areaX = Math.round(PW * 0.12);
    const areaY = Math.round(PH * 0.33);
    const areaW = Math.round(PW * 0.76);
    const areaH = Math.round(PH * 0.37);

    let composites;
    if (photoCount <= 2) {
      composites = await this._buildHeroFrames(allPhotos.slice(0, photoCount), { areaX, areaY, areaW, areaH });
    } else {
      // 3+ foto için legacy grid fallback — eski styling ile
      composites = await this._buildLegacyHeroGrid(allPhotos.slice(0, 5), options);
    }

    // 4. Compose ve kaydet
    const result = await sharp(bgBuffer)
      .composite(composites)
      .png({ quality: 95 })
      .toBuffer();

    if (outputPath) fs.writeFileSync(outputPath, result);
    return result;
  }

  /**
   * Hero page için 1 veya 2 fotoğrafa göre SVG-çerçeve + gölge ile composite listesi üretir.
   */
  async _buildHeroFrames(photos, { areaX, areaY, areaW, areaH }) {
    const BORDER = 22;           // cream outer border
    const STROKE = 3;            // thin warm-brown stroke
    const CORNER = 16;           // outer rounded corner
    const SHADOW_BLUR = 18;
    const SHADOW_OFFSET = 10;
    const GAP = 26;

    const buildFrame = async (photoPath, frameW, frameH) => {
      const photoW = frameW - BORDER * 2;
      const photoH = frameH - BORDER * 2;
      const photoBuf = await sharp(photoPath)
        .resize(photoW, photoH, { fit: "cover", position: "centre" })
        .toBuffer();

      const innerCorner = Math.max(CORNER - BORDER + 4, 6);
      const innerMask = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${photoW}" height="${photoH}">
          <rect width="${photoW}" height="${photoH}" rx="${innerCorner}" ry="${innerCorner}" fill="white"/>
        </svg>`
      );
      const photoMasked = await sharp(photoBuf)
        .composite([{ input: innerMask, blend: "dest-in" }])
        .png()
        .toBuffer();

      const CW = frameW + SHADOW_BLUR * 2 + SHADOW_OFFSET;
      const CH = frameH + SHADOW_BLUR * 2 + SHADOW_OFFSET;
      const frameSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${CW}" height="${CH}">
          <defs>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="${SHADOW_BLUR / 3}"/>
              <feOffset dx="${SHADOW_OFFSET / 2}" dy="${SHADOW_OFFSET / 2}" result="offsetblur"/>
              <feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer>
              <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <rect x="${SHADOW_BLUR}" y="${SHADOW_BLUR}" width="${frameW}" height="${frameH}"
                rx="${CORNER}" ry="${CORNER}"
                fill="#FBF6EC" stroke="#8B5E3C" stroke-width="${STROKE}"
                filter="url(#shadow)"/>
          <rect x="${SHADOW_BLUR + BORDER - 5}" y="${SHADOW_BLUR + BORDER - 5}"
                width="${photoW + 10}" height="${photoH + 10}"
                rx="${Math.max(innerCorner + 2, 8)}" ry="${Math.max(innerCorner + 2, 8)}"
                fill="none" stroke="#D4A574" stroke-width="2"/>
        </svg>
      `;
      const framePng = await sharp(Buffer.from(frameSvg)).png().toBuffer();
      return await sharp(framePng)
        .composite([{ input: photoMasked, top: SHADOW_BLUR + BORDER, left: SHADOW_BLUR + BORDER }])
        .png()
        .toBuffer();
    };

    const composites = [];
    if (photos.length === 1) {
      // Portrait frame (2026-04-22 fix): dikey, photo aspect 3:4 preserve edilsin
      const PH_local = 2526, PW_local = 1785;
      const frameH = Math.round(PH_local * 0.58);
      const frameW = Math.round(frameH * 0.75);
      const frameX = Math.round((PW_local - frameW) / 2);
      const frameY = Math.round(PH_local * 0.32);
      const frame = await buildFrame(photos[0], frameW, frameH);
      composites.push({ input: frame, top: frameY - SHADOW_BLUR, left: frameX - SHADOW_BLUR });
    } else {
      const frameW = Math.floor((areaW - GAP) / 2);
      const f1 = await buildFrame(photos[0], frameW, areaH);
      const f2 = await buildFrame(photos[1], frameW, areaH);
      composites.push({ input: f1, top: areaY - SHADOW_BLUR, left: areaX - SHADOW_BLUR });
      composites.push({ input: f2, top: areaY - SHADOW_BLUR, left: areaX + frameW + GAP - SHADOW_BLUR });
    }
    return composites;
  }

  /**
   * 3-5 foto için legacy grid (eski _getPhotoGridLayout styling'i).
   */
  async _buildLegacyHeroGrid(photos, options) {
    const { theme = {} } = options;
    const primary = theme.primaryColor || "#8b5cf6";
    const layouts = this._getPhotoGridLayout(photos.length);
    const frameColor = this._hexToRgb(primary);
    const framePadding = 10;
    const cornerRadius = 24;
    const composites = [];

    for (let i = 0; i < photos.length; i++) {
      const layout = layouts[i];
      try {
        const photoBuffer = await sharp(photos[i])
          .resize(layout.w, layout.h, { fit: "cover", position: "centre" })
          .png()
          .toBuffer();
        const roundedMask = Buffer.from(
          `<svg width="${layout.w}" height="${layout.h}">
            <rect width="${layout.w}" height="${layout.h}" rx="${cornerRadius}" ry="${cornerRadius}" fill="white"/>
          </svg>`
        );
        const maskedPhoto = await sharp(photoBuffer)
          .composite([{ input: roundedMask, blend: 'dest-in' }])
          .png()
          .toBuffer();
        const frameW = layout.w + framePadding * 2;
        const frameH = layout.h + framePadding * 2;
        const frameSvg = Buffer.from(
          `<svg width="${frameW}" height="${frameH}">
            <rect width="${frameW}" height="${frameH}" rx="${cornerRadius + 4}" ry="${cornerRadius + 4}"
              fill="rgb(${frameColor.r},${frameColor.g},${frameColor.b})" opacity="0.9"/>
          </svg>`
        );
        const frameBuffer = await sharp({
          create: { width: frameW, height: frameH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
        })
        .composite([{ input: frameSvg, top: 0, left: 0 }])
        .png()
        .toBuffer();
        composites.push({ input: frameBuffer, top: layout.y - framePadding, left: layout.x - framePadding });
        composites.push({ input: maskedPhoto, top: layout.y, left: layout.x });
      } catch (err) {
        console.warn(`  [TextPageRenderer] Legacy hero foto ${i + 1} hatasi:`, err.message);
      }
    }
    return composites;
  }

  /**
   * Fotograf sayisina gore dinamik grid layout hesaplar
   * @param {number} count - 1 ile 5 arasi fotograf sayisi
   * @returns {Array<{x, y, w, h}>} Her fotografin pozisyon ve boyutu
   */
  _getPhotoGridLayout(count) {
    const margin = 80;
    const gap = 24;
    const gridTop = 580;   // Baslik alani altinda
    const gridBottom = PH - 200; // Alt metin alani ustunde
    const gridH = gridBottom - gridTop;
    const gridW = PW - margin * 2;

    switch (count) {
      case 1: {
        // Tek buyuk fotograf, ortada
        const size = Math.min(gridW * 0.65, gridH * 0.85);
        return [{
          x: Math.round((PW - size) / 2),
          y: Math.round(gridTop + (gridH - size) / 2),
          w: Math.round(size),
          h: Math.round(size),
        }];
      }
      case 2: {
        // 2 fotograf yan yana
        const photoW = Math.round((gridW - gap) / 2);
        const photoH = Math.min(photoW, Math.round(gridH * 0.85));
        const startY = Math.round(gridTop + (gridH - photoH) / 2);
        return [
          { x: margin, y: startY, w: photoW, h: photoH },
          { x: margin + photoW + gap, y: startY, w: photoW, h: photoH },
        ];
      }
      case 3: {
        // 1 buyuk ust, 2 kucuk alt
        const topW = Math.round(gridW * 0.6);
        const topH = Math.round(gridH * 0.52);
        const botW = Math.round((gridW - gap) / 2);
        const botH = Math.round(gridH * 0.42);
        return [
          { x: Math.round((PW - topW) / 2), y: gridTop, w: topW, h: topH },
          { x: margin, y: gridTop + topH + gap, w: botW, h: botH },
          { x: margin + botW + gap, y: gridTop + topH + gap, w: botW, h: botH },
        ];
      }
      case 4: {
        // 2x2 grid
        const photoW = Math.round((gridW - gap) / 2);
        const photoH = Math.round((gridH - gap) / 2);
        return [
          { x: margin, y: gridTop, w: photoW, h: photoH },
          { x: margin + photoW + gap, y: gridTop, w: photoW, h: photoH },
          { x: margin, y: gridTop + photoH + gap, w: photoW, h: photoH },
          { x: margin + photoW + gap, y: gridTop + photoH + gap, w: photoW, h: photoH },
        ];
      }
      case 5: {
        // 2 ust + 3 alt
        const topW = Math.round((gridW - gap) / 2);
        const topH = Math.round(gridH * 0.48);
        const botW = Math.round((gridW - gap * 2) / 3);
        const botH = Math.round(gridH * 0.46);
        return [
          { x: margin, y: gridTop, w: topW, h: topH },
          { x: margin + topW + gap, y: gridTop, w: topW, h: topH },
          { x: margin, y: gridTop + topH + gap, w: botW, h: botH },
          { x: margin + botW + gap, y: gridTop + topH + gap, w: botW, h: botH },
          { x: margin + (botW + gap) * 2, y: gridTop + topH + gap, w: botW, h: botH },
        ];
      }
      default:
        return [];
    }
  }

  /**
   * "Kimden Not" sayfasini render eder - el yazisi stili
   */
  async renderSenderNotePage(options) {
    const { childName, senderName, senderNote, theme = {}, outputPath, backgroundImagePath } = options;

    const primary = theme.primaryColor || "#8b5cf6";
    const secondary = theme.secondaryColor || "#a78bfa";
    const icon = theme.icon || "★";

    let bgBuffer;
    if (backgroundImagePath && fs.existsSync(backgroundImagePath)) {
      bgBuffer = await sharp(backgroundImagePath)
        .resize(PW, PH, { fit: "cover" })
        .png()
        .toBuffer();
    } else {
      bgBuffer = await sharp({
        create: { width: PW, height: PH, channels: 4, background: { r: 254, g: 252, b: 249, alpha: 255 } },
      }).png().toBuffer();
    }

    const svg = this._createSenderNoteSVG({ childName, senderName, senderNote, primary, secondary, icon });

    const result = await sharp(bgBuffer)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .png({ quality: 95 })
      .toBuffer();

    if (outputPath) fs.writeFileSync(outputPath, result);
    return result;
  }

  // =========================================================================
  // METIN SAYFASI SVG - Ana template
  // =========================================================================
  _createTextPageSVG({ sceneNumber, title, text, primary, secondary, accent, icon, fonts, pageNumber, totalScenes, ageGroup }) {
    const mx = 100; // Kenar boslugu
    const rgb = this._hexToRgb(primary);
    const secRgb = this._hexToRgb(secondary);

    // Metin satirlari
    const titleLines = this._wrapText(title, Math.round(fonts.charsPerLine * 0.8));
    const textLines = this._wrapText(text, fonts.charsPerLine);

    const titleLineH = Math.round(fonts.title * fonts.lineH);
    const bodyLineH = Math.round(fonts.body * fonts.bodyLineH);

    // Akilli metin sigdirma: font boyutunu kucult
    let bodyFontSize = fonts.body;
    let currentLines = textLines;
    const maxBodyH = PH - 680; // Mevcut alan (baslik + ust dekorasyon + alt bosluk cikinca)

    while (currentLines.length * Math.round(bodyFontSize * fonts.bodyLineH) > maxBodyH && bodyFontSize > fonts.body * 0.65) {
      bodyFontSize -= 2;
      currentLines = this._wrapText(text, Math.round(fonts.charsPerLine * (fonts.body / bodyFontSize)));
    }

    const actualBodyLineH = Math.round(bodyFontSize * fonts.bodyLineH);

    // Pozisyonlar
    const topBarY = 0;
    const topBarH = 80;
    const titleCardY = topBarH + 40;
    const titleBlockH = titleLines.length * titleLineH;
    const titleCardH = titleBlockH + 60;
    const bodyStartY = titleCardY + titleCardH + 35;
    const bodyBlockH = currentLines.length * actualBodyLineH;

    // Beyaz kart alani
    const cardX = mx - 20;
    const cardY = titleCardY - 20;
    const cardW = PW - mx * 2 + 40;
    const cardH = (bodyStartY + bodyBlockH) - cardY + 80;

    // Baslik SVG
    let titleSVG = "";
    for (let i = 0; i < titleLines.length; i++) {
      const ty = titleCardY + 35 + i * titleLineH;
      titleSVG += `<text x="${mx + 70}" y="${ty}" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="${fonts.title}" fill="${primary}" letter-spacing="-1">${this._esc(titleLines[i])}</text>`;
    }

    // Body SVG - paragrafları ayır
    let bodySVG = "";
    for (let i = 0; i < currentLines.length; i++) {
      const by = bodyStartY + i * actualBodyLineH;
      // Diyalog satırları italik olsun
      const isDialogue = currentLines[i].startsWith('"') || currentLines[i].startsWith("\"") || currentLines[i].startsWith("'") || currentLines[i].startsWith("\u201C");
      const style = isDialogue ? ' font-style="italic"' : "";
      const color = isDialogue ? primary : "#2d2d3f";

      bodySVG += `<text x="${mx + 15}" y="${by}" font-family="Segoe UI, Georgia, serif" font-weight="400" font-size="${bodyFontSize}" fill="${color}"${style} letter-spacing="0.3">${this._esc(currentLines[i])}</text>`;
    }

    // Dekoratif ayirici cizgi
    const sepY = bodyStartY + bodyBlockH + 30;

    return `<svg width="${PW}" height="${PH}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="topGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgb(${rgb.r},${rgb.g},${rgb.b})" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="rgb(${secRgb.r},${secRgb.g},${secRgb.b})" stop-opacity="0.85"/>
    </linearGradient>
    <linearGradient id="cardGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="white" stop-opacity="0.92"/>
      <stop offset="100%" stop-color="white" stop-opacity="0.85"/>
    </linearGradient>
    <filter id="cardShadow">
      <feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="rgba(0,0,0,0.12)"/>
    </filter>
    <filter id="titleShadow">
      <feDropShadow dx="2" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.15)"/>
    </filter>
  </defs>

  <!-- Ust bar - tema rengi gradient bant -->
  <rect x="0" y="0" width="${PW}" height="${topBarH}" fill="url(#topGrad)"/>

  <!-- Ust bar - MASAL marka (sol) -->
  <text x="${mx}" y="52" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="28" fill="white" opacity="0.9" letter-spacing="3">MASAL</text>

  <!-- Ust bar - Dekoratif noktalar (orta) -->
  <circle cx="${PW/2 - 20}" cy="40" r="4" fill="white" opacity="0.4"/>
  <circle cx="${PW/2}" cy="40" r="4" fill="white" opacity="0.6"/>
  <circle cx="${PW/2 + 20}" cy="40" r="4" fill="white" opacity="0.4"/>

  <!-- Ust bar - Sahne numarasi (sag) -->
  <rect x="${PW - mx - 80}" y="18" width="80" height="44" rx="22" fill="white" opacity="0.25"/>
  <text x="${PW - mx - 40}" y="50" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="24" fill="white">${sceneNumber}/${totalScenes}</text>

  <!-- Ana beyaz kart - okunabilirlik katmani -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="24" fill="url(#cardGrad)" filter="url(#cardShadow)"/>

  <!-- Kart kenar cizgisi -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="24" fill="none" stroke="rgb(${rgb.r},${rgb.g},${rgb.b})" stroke-opacity="0.12" stroke-width="2"/>

  <!-- Sahne numarasi dairesi -->
  <circle cx="${mx + 30}" cy="${titleCardY + 35 + (titleBlockH > titleLineH ? titleLineH/2 : 0)}" r="28" fill="${primary}"/>
  <text x="${mx + 30}" y="${titleCardY + 44 + (titleBlockH > titleLineH ? titleLineH/2 : 0)}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="28" fill="white">${sceneNumber}</text>

  <!-- Baslik metni (tema rengi, bold) -->
  <g filter="url(#titleShadow)">
    ${titleSVG}
  </g>

  <!-- Dekoratif ayirici: baslik-metin arasi -->
  <line x1="${mx + 15}" y1="${titleCardY + titleCardH - 10}" x2="${mx + 200}" y2="${titleCardY + titleCardH - 10}" stroke="${primary}" stroke-opacity="0.35" stroke-width="3" stroke-linecap="round"/>
  <circle cx="${mx + 215}" cy="${titleCardY + titleCardH - 10}" r="5" fill="${secondary}"/>

  <!-- Hikaye metni -->
  ${bodySVG}

  <!-- Alt dekoratif ayirici -->
  <line x1="${PW/2 - 60}" y1="${sepY}" x2="${PW/2 + 60}" y2="${sepY}" stroke="${primary}" stroke-opacity="0.2" stroke-width="2" stroke-linecap="round"/>
  <circle cx="${PW/2}" cy="${sepY}" r="4" fill="${secondary}" opacity="0.4"/>

  <!-- Sayfa numarasi -->
  <text x="${PW/2}" y="${PH - 60}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="600" font-size="26" fill="${primary}" opacity="0.4">&#9733; ${pageNumber} &#9733;</text>

  <!-- Sag alt kose dekorasyon -->
  <circle cx="${PW - 60}" cy="${PH - 60}" r="30" fill="${primary}" opacity="0.06"/>
  <circle cx="${PW - 60}" cy="${PH - 60}" r="18" fill="${primary}" opacity="0.04"/>

  <!-- Sol alt kose dekorasyon -->
  <circle cx="60" cy="${PH - 100}" r="20" fill="${secondary}" opacity="0.06"/>
</svg>`;
  }

  // =========================================================================
  // KAPAK SVG
  // =========================================================================
  _createCoverSVG({ title, childName, theme, ageGroup, icon }) {
    const primary = theme.primaryColor || "#8b5cf6";
    const secondary = theme.secondaryColor || "#a78bfa";
    const rgb = this._hexToRgb(primary);
    const secRgb = this._hexToRgb(secondary);
    const mx = 100;

    const titleLines = this._wrapText(title, 18);
    const titleFontSize = 98;
    const titleLineH = Math.round(titleFontSize * 1.18);
    const bandH = Math.round(PH * 0.32);
    const bandY = PH - bandH;
    const titleStartY = bandY + Math.round(bandH * 0.28);

    let titleSVG = "";
    for (let i = 0; i < titleLines.length; i++) {
      const ty = titleStartY + i * titleLineH;
      titleSVG += `<text x="${mx + 4}" y="${ty + 4}" font-family="Segoe UI, Arial, sans-serif" font-weight="900" font-size="${titleFontSize}" fill="rgba(0,0,0,0.45)" letter-spacing="-2">${this._esc(titleLines[i])}</text>`;
      titleSVG += `<text x="${mx}" y="${ty}" font-family="Segoe UI, Arial, sans-serif" font-weight="900" font-size="${titleFontSize}" fill="white" letter-spacing="-2">${this._esc(titleLines[i])}</text>`;
    }

    const decorY = titleStartY + titleLines.length * titleLineH + 20;
    const subY = decorY + 55;

    return `<svg width="${PW}" height="${PH}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="cBand" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgb(${rgb.r},${rgb.g},${rgb.b})" stop-opacity="0"/>
      <stop offset="25%" stop-color="rgb(${rgb.r},${rgb.g},${rgb.b})" stop-opacity="0.65"/>
      <stop offset="55%" stop-color="rgb(${Math.max(0,rgb.r-30)},${Math.max(0,rgb.g-30)},${Math.max(0,rgb.b-30)})" stop-opacity="0.88"/>
      <stop offset="100%" stop-color="rgb(${Math.max(0,rgb.r-60)},${Math.max(0,rgb.g-60)},${Math.max(0,rgb.b-60)})" stop-opacity="0.96"/>
    </linearGradient>
    <linearGradient id="cTop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgb(${rgb.r},${rgb.g},${rgb.b})" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="rgb(${rgb.r},${rgb.g},${rgb.b})" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <!-- Ust color bant -->
  <rect x="0" y="0" width="${PW}" height="${Math.round(PH*0.08)}" fill="url(#cTop)"/>
  <rect x="0" y="0" width="${PW}" height="8" fill="${primary}"/>

  <!-- Kisiye Ozel badge -->
  <rect x="${mx}" y="35" width="420" height="55" rx="28" fill="rgba(0,0,0,0.4)"/>
  <text x="${mx + 210}" y="72" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="28" fill="white" opacity="0.9" font-weight="600">Ki&#351;iye &#214;zel Macera Kitab&#305;</text>

  <!-- MASAL marka (sag ust) -->
  <rect x="${PW - mx - 180}" y="35" width="180" height="55" rx="28" fill="rgba(255,255,255,0.2)"/>
  <text x="${PW - mx - 90}" y="72" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="30" fill="white" font-weight="800" letter-spacing="3">MASAL</text>

  <!-- Yas grubu badge -->
  <rect x="${PW - mx - 120}" y="105" width="120" height="40" rx="20" fill="rgba(255,255,255,0.15)"/>
  <text x="${PW - mx - 60}" y="133" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="22" fill="white" opacity="0.7" font-weight="600">${ageGroup} ya&#351;</text>

  <!-- Alt gradient bant -->
  <rect x="0" y="${bandY}" width="${PW}" height="${bandH}" fill="url(#cBand)"/>

  <!-- Baslik -->
  ${titleSVG}

  <!-- Dekoratif cizgi -->
  <rect x="${mx}" y="${decorY}" width="200" height="7" rx="4" fill="${secondary}"/>
  <circle cx="${mx + 220}" cy="${decorY + 3}" r="6" fill="white" opacity="0.6"/>

  <!-- Cocuk ismi -->
  <text x="${mx + 3}" y="${subY + 3}" font-family="Segoe UI, Arial, sans-serif" font-size="38" fill="rgba(0,0,0,0.3)" font-weight="600">${this._esc(childName)} i&#231;in &#246;zel olarak haz&#305;rland&#305;</text>
  <text x="${mx}" y="${subY}" font-family="Segoe UI, Arial, sans-serif" font-size="38" fill="white" opacity="0.9" font-weight="600">${this._esc(childName)} i&#231;in &#246;zel olarak haz&#305;rland&#305;</text>

  <!-- Alt serit -->
  <rect x="0" y="${PH - 8}" width="${PW}" height="8" fill="${secondary}"/>

  <!-- Dekoratif yildizlar -->
  <text x="${mx}" y="${PH - 25}" font-family="Segoe UI" font-size="24" fill="rgba(255,255,255,0.3)">&#10022; &#10022; &#10022;</text>
  <text x="${PW - mx - 80}" y="${PH - 25}" font-family="Segoe UI" font-size="24" fill="rgba(255,255,255,0.3)">&#10022; &#10022; &#10022;</text>
</svg>`;
  }

  // =========================================================================
  // IC KAPAK SVG
  // =========================================================================
  _createInnerCoverSVG({ title, childName, primary, secondary, accent, icon, rgb, ageGroup }) {
    const mx = 120;
    const cy = PH / 2 - 100;
    const titleLines = this._wrapText(title, 20);
    const titleFontSize = 64;
    const titleLineH = Math.round(titleFontSize * 1.3);

    let titleSVG = "";
    for (let i = 0; i < titleLines.length; i++) {
      const ty = cy + 80 + i * titleLineH;
      titleSVG += `<text x="${PW/2}" y="${ty}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="${titleFontSize}" fill="#1a1a2e" letter-spacing="-1">${this._esc(titleLines[i])}</text>`;
    }

    const afterTitleY = cy + 80 + titleLines.length * titleLineH + 25;

    return `<svg width="${PW}" height="${PH}" xmlns="http://www.w3.org/2000/svg">
  <!-- Ince cerceve -->
  <rect x="40" y="40" width="${PW-80}" height="${PH-80}" rx="0" fill="none" stroke="#e0d8d0" stroke-width="1.5"/>
  <rect x="50" y="50" width="${PW-100}" height="${PH-100}" rx="0" fill="none" stroke="#ece4dc" stroke-width="0.8"/>

  <!-- Tema ikonu -->
  <text x="${PW/2}" y="${cy}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="96" fill="${primary}">${this._esc(icon)}</text>

  <!-- Ust dekoratif cizgi -->
  <rect x="${PW/2 - 60}" y="${cy + 30}" width="120" height="3" rx="2" fill="${primary}"/>

  <!-- Baslik -->
  ${titleSVG}

  <!-- Alt dekoratif cizgi -->
  <rect x="${PW/2 - 45}" y="${afterTitleY}" width="90" height="3" rx="2" fill="${primary}"/>

  <!-- Cocuk icin hazirlandi -->
  <text x="${PW/2}" y="${afterTitleY + 45}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="500" font-size="32" fill="${primary}">${this._esc(childName)} i&#231;in haz&#305;rland&#305;</text>

  <!-- Yas grubu badge -->
  <rect x="${PW/2 - 70}" y="${afterTitleY + 70}" width="140" height="40" rx="20" fill="${accent}"/>
  <text x="${PW/2}" y="${afterTitleY + 98}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="22" fill="${primary}">${ageGroup} YA&#350;</text>

  <!-- Alt metin -->
  <text x="${PW/2}" y="${PH - 75}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="400" font-size="20" fill="#b0a090">MASAL - Ki&#351;iselle&#351;tirilmi&#351; Hikaye Kitab&#305;</text>
</svg>`;
  }

  // =========================================================================
  // ITHAF SVG
  // =========================================================================
  _createDedicationSVG({ childName, primary, secondary, icon }) {
    const cy = PH / 2 - 80;

    return `<svg width="${PW}" height="${PH}" xmlns="http://www.w3.org/2000/svg">
  <!-- Cerceve -->
  <rect x="40" y="40" width="${PW-80}" height="${PH-80}" rx="0" fill="none" stroke="#e0d8d0" stroke-width="1.5"/>

  <!-- Ikon -->
  <text x="${PW/2}" y="${cy - 30}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="88" fill="${primary}">${this._esc(icon)}</text>

  <!-- Ust dekoratif -->
  <line x1="${PW/2 - 80}" y1="${cy + 30}" x2="${PW/2 + 80}" y2="${cy + 30}" stroke="${secondary}" stroke-width="2"/>

  <!-- Sevgili ... -->
  <text x="${PW/2}" y="${cy + 90}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="44" fill="#2d2d3f">Sevgili ${this._esc(childName)},</text>

  <!-- Ithaf metni -->
  <text x="${PW/2}" y="${cy + 160}" text-anchor="middle" font-family="Segoe UI, Georgia, serif" font-weight="400" font-size="30" fill="#5a5a6e">Bu hikaye sana &#246;zel olarak yaz&#305;ld&#305;.</text>
  <text x="${PW/2}" y="${cy + 210}" text-anchor="middle" font-family="Segoe UI, Georgia, serif" font-weight="400" font-size="30" fill="#5a5a6e">Her sayfada seni bekleyen maceralar var.</text>
  <text x="${PW/2}" y="${cy + 260}" text-anchor="middle" font-family="Segoe UI, Georgia, serif" font-weight="400" font-size="30" fill="#5a5a6e">Haydi, birlikte ke&#351;fedelim!</text>

  <!-- Alt dekoratif -->
  <line x1="${PW/2 - 80}" y1="${cy + 310}" x2="${PW/2 + 80}" y2="${cy + 310}" stroke="${secondary}" stroke-width="2"/>
</svg>`;
  }

  // =========================================================================
  // BILIYOR MUYDUN SVG
  // =========================================================================
  _createFunFactSVG({ funFact, factBg, icon, rgb }) {
    const mx = 120;
    const facts = funFact.facts || [];
    const factCount = Math.min(facts.length, 5);
    const startY = 350;
    const cardW = PW - mx * 2;
    const gap = 22;
    const cardH = Math.min(180, (PH - startY - 100 - gap * (factCount - 1)) / factCount);

    let factsSVG = "";
    for (let i = 0; i < factCount; i++) {
      const y = startY + i * (cardH + gap);
      const factLines = this._wrapText(facts[i], 42);
      const factFontSize = factCount >= 5 ? 26 : (factLines.length > 3 ? 28 : 32);
      const factLineH = Math.round(factFontSize * 1.5);

      factsSVG += `
    <!-- Kart ${i + 1} -->
    <rect x="${mx}" y="${y}" width="${cardW}" height="${cardH}" rx="20" fill="white" opacity="0.18"/>
    <rect x="${mx}" y="${y}" width="8" height="${cardH}" rx="4" fill="white" opacity="0.5"/>
    <circle cx="${mx + 55}" cy="${y + cardH/2}" r="28" fill="white" opacity="0.25"/>
    <text x="${mx + 55}" y="${y + cardH/2 + 10}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="30" fill="white">${i + 1}</text>`;

      for (let j = 0; j < factLines.length; j++) {
        const fy = y + 30 + j * factLineH + (cardH - factLines.length * factLineH) / 2;
        factsSVG += `\n    <text x="${mx + 100}" y="${fy}" font-family="Segoe UI, Georgia, serif" font-weight="400" font-size="${factFontSize}" fill="white">${this._esc(factLines[j])}</text>`;
      }
    }

    return `<svg width="${PW}" height="${PH}" xmlns="http://www.w3.org/2000/svg">
  <!-- Ust koyu overlay -->
  <rect x="0" y="0" width="${PW}" height="340" fill="black" opacity="0.15"/>

  <!-- Sol kenar dekoratif -->
  <rect x="0" y="0" width="12" height="${PH}" fill="black" opacity="0.2"/>

  <!-- Buyuk ikon -->
  <text x="${PW/2}" y="130" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="96" fill="white">${this._esc(icon)}</text>

  <!-- Baslik -->
  <text x="${PW/2}" y="230" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="56" fill="white">${this._esc(funFact.title || "Biliyor muydun?")}</text>

  <!-- Ayirici -->
  <rect x="${PW/2 - 50}" y="265" width="100" height="4" rx="2" fill="white" opacity="0.4"/>

  <!-- Bilgi kartlari -->
  ${factsSVG}

  <!-- Alt dekoratif -->
  <rect x="${PW/2 - 40}" y="${PH - 70}" width="80" height="3" rx="2" fill="white" opacity="0.3"/>
</svg>`;
  }

  // =========================================================================
  // KAPANIS SVG
  // =========================================================================
  _createEndingSVG({ childName, primary, icon, rgb }) {
    return `<svg width="${PW}" height="${PH}" xmlns="http://www.w3.org/2000/svg">
  <!-- Ust/alt tema seritleri -->
  <rect x="0" y="0" width="${PW}" height="6" fill="${primary}"/>
  <rect x="0" y="${PH-6}" width="${PW}" height="6" fill="${primary}"/>

  <!-- Dekoratif daireler -->
  <circle cx="${PW/2}" cy="${PH/2}" r="320" fill="${primary}" opacity="0.04"/>
  <circle cx="${PW/2}" cy="${PH/2}" r="230" fill="${primary}" opacity="0.04"/>
  <circle cx="${PW/2}" cy="${PH/2}" r="140" fill="${primary}" opacity="0.04"/>

  <!-- Ikon -->
  <text x="${PW/2}" y="${PH/2 - 180}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="120" fill="${primary}">${this._esc(icon)}</text>

  <!-- Son -->
  <text x="${PW/2}" y="${PH/2 + 10}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="900" font-size="96" fill="white" letter-spacing="-2">Son</text>

  <!-- Dekoratif cizgi -->
  <rect x="${PW/2 - 60}" y="${PH/2 + 50}" width="120" height="5" rx="3" fill="${primary}"/>

  <!-- Alt mesajlar -->
  <text x="${PW/2}" y="${PH/2 + 120}" text-anchor="middle" font-family="Segoe UI, Georgia, serif" font-weight="400" font-size="32" fill="#c0b0d0">Bu hikaye ${this._esc(childName)} i&#231;in sevgiyle haz&#305;rland&#305;.</text>
  <text x="${PW/2}" y="${PH/2 + 175}" text-anchor="middle" font-family="Segoe UI, Georgia, serif" font-weight="400" font-size="26" fill="#7a7a8e">Her &#231;ocu&#287;un i&#231;inde bir kahraman sakl&#305;d&#305;r.</text>
</svg>`;
  }

  // =========================================================================
  // ARKA KAPAK SVG
  // =========================================================================
  _createBackCoverSVG({ title, primary, rgb, childName, description, icon, lessons }) {
    // Vertically stack: icon → title → divider → tagline → description → lessons header → lessons → childname → logo.
    // Each block's Y is computed from the previous block's end, so nothing overlaps.
    const descLines = this._wrapText(description || '', 38).slice(0, 5);
    const lessonsArr = (lessons || []).slice(0, 4);

    const ICON_Y = 380;
    const ICON_SIZE = 90;
    const TITLE_Y = ICON_Y + 140;
    const TITLE_SIZE = 52;
    const DIVIDER_Y = TITLE_Y + 40;
    const TAGLINE_Y = DIVIDER_Y + 70;
    const TAGLINE_SIZE = 32;
    const DESC_START_Y = TAGLINE_Y + 90;
    const DESC_SIZE = 28;
    const DESC_LINE_H = 44;
    const DESC_BLOCK_H = descLines.length * DESC_LINE_H;
    const LESSONS_HEADER_Y = DESC_START_Y + DESC_BLOCK_H + 70;
    const LESSONS_START_Y = LESSONS_HEADER_Y + 70;
    const LESSON_GAP = 56;
    const LESSONS_BLOCK_H = lessonsArr.length * LESSON_GAP;
    const CHILDNAME_Y = LESSONS_START_Y + LESSONS_BLOCK_H + 70;

    let descSVG = '';
    for (let i = 0; i < descLines.length; i++) {
      descSVG += `<text x="${PW/2}" y="${DESC_START_Y + i * DESC_LINE_H}" text-anchor="middle" font-family="Segoe UI, Georgia, serif" font-weight="400" font-size="${DESC_SIZE}" fill="#b8b8c8">${this._esc(descLines[i])}</text>\n  `;
    }

    let lessonsSVG = '';
    if (lessonsArr.length > 0) {
      lessonsSVG = `<text x="${PW/2}" y="${LESSONS_HEADER_Y}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="28" fill="#a0a0b8" letter-spacing="3">BU K&#304;TAPTA NE &#214;&#286;REND&#304;K?</text>
  <rect x="${PW/2 - 40}" y="${LESSONS_HEADER_Y + 15}" width="80" height="2" rx="1" fill="${primary}" opacity="0.4"/>
  `;
      for (let i = 0; i < lessonsArr.length; i++) {
        lessonsSVG += `<text x="${PW/2}" y="${LESSONS_START_Y + i * LESSON_GAP}" text-anchor="middle" font-family="Segoe UI, Georgia, serif" font-weight="400" font-size="26" fill="#c0c0d0">&#10022; ${this._esc(lessonsArr[i])}</text>\n  `;
      }
    }

    return `<svg width="${PW}" height="${PH}" xmlns="http://www.w3.org/2000/svg">
  <!-- Ust/alt tema seritleri -->
  <rect x="0" y="0" width="${PW}" height="8" fill="${primary}"/>
  <rect x="0" y="${PH-8}" width="${PW}" height="8" fill="${primary}"/>

  <!-- Dekoratif daireler -->
  <circle cx="${PW/2}" cy="${TITLE_Y - 30}" r="360" fill="${primary}" opacity="0.04"/>
  <circle cx="${PW/2}" cy="${TITLE_Y - 30}" r="240" fill="${primary}" opacity="0.04"/>

  <!-- Ikon -->
  <text x="${PW/2}" y="${ICON_Y}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="${ICON_SIZE}" fill="${primary}" opacity="0.85">${this._esc(icon || '★')}</text>

  <!-- Kitap adi -->
  <text x="${PW/2}" y="${TITLE_Y}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="${TITLE_SIZE}" fill="white">${this._esc(title)}</text>

  <!-- Dekoratif cizgi -->
  <rect x="${PW/2 - 60}" y="${DIVIDER_Y}" width="120" height="4" rx="2" fill="${primary}"/>

  <!-- Masal bitti tagline -->
  <text x="${PW/2}" y="${TAGLINE_Y}" text-anchor="middle" font-family="Segoe UI, Georgia, serif" font-weight="400" font-size="${TAGLINE_SIZE}" fill="#c0b0d0" font-style="italic">"Masal bitti ama izleri kald&#305;..."</text>

  <!-- Aciklama -->
  ${descSVG}

  <!-- Ogrenilen degerler -->
  ${lessonsSVG}

  <!-- Cocuk icin ozel -->
  ${childName ? `<text x="${PW/2}" y="${CHILDNAME_Y}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="500" font-size="26" fill="#9a9aae">${this._esc(childName)} i&#231;in sevgiyle haz&#305;rland&#305;</text>` : ''}

  <!-- MasalSensin marka alani -->
  <text x="${PW/2}" y="${PH - 140}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="900" font-size="44" fill="white" letter-spacing="4">MasalSensin</text>
  <text x="${PW/2}" y="${PH - 95}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="400" font-size="20" fill="#8a8a9e">www.masalsensin.com</text>
</svg>`;
  }

  // =========================================================================
  // HERO SAYFASI SVG
  // =========================================================================
  // =========================================================================
  // GONDEREN NOTU SVG
  // =========================================================================
  _createSenderNoteSVG({ childName, senderName, senderNote, primary, secondary, icon }) {
    const mx = 160;
    const noteText = senderNote || `Canim ${childName}, bu hikaye sana olan sevgimle hazirlandi. Her sayfasinda seni dusundum. Seni cok seviyorum!`;
    const noteLines = this._wrapText(noteText, 30);
    const fontSize = 36;
    const lineH = Math.round(fontSize * 2.0);
    const startY = 750;

    let notesSVG = "";
    for (let i = 0; i < noteLines.length; i++) {
      const y = startY + i * lineH;
      notesSVG += `<text x="${mx + 40}" y="${y}" font-family="Segoe Script, Comic Sans MS, Georgia, serif" font-weight="400" font-size="${fontSize}" fill="#3a3020" font-style="italic" opacity="0.85">${this._esc(noteLines[i])}</text>`;
    }

    const signY = startY + noteLines.length * lineH + 60;

    return `<svg width="${PW}" height="${PH}" xmlns="http://www.w3.org/2000/svg">
  <!-- Kagit dokusu cerceve -->
  <rect x="80" y="80" width="${PW-160}" height="${PH-160}" rx="4" fill="#faf6f0" stroke="#e0d0c0" stroke-width="1"/>
  <rect x="90" y="90" width="${PW-180}" height="${PH-180}" rx="2" fill="none" stroke="#ece0d4" stroke-width="0.5"/>

  <!-- Sol kenar kirmizi cizgi (defter etkisi) -->
  <line x1="${mx}" y1="200" x2="${mx}" y2="${PH - 200}" stroke="#e8b0a0" stroke-width="2" opacity="0.4"/>

  <!-- Yazilar icin yatay cizgiler (defter etkisi) -->
  ${Array.from({length: 20}, (_, i) => `<line x1="${mx + 20}" y1="${700 + i * lineH}" x2="${PW - 160}" y2="${700 + i * lineH}" stroke="#d8d0c8" stroke-width="0.5" opacity="0.5"/>`).join('\n  ')}

  <!-- Ikon -->
  <text x="${PW/2}" y="350" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="72" fill="${primary}">${this._esc(icon)}</text>

  <!-- Baslik -->
  <text x="${PW/2}" y="460" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="300" font-size="32" fill="#8a7a6a" letter-spacing="6">SANA B&#304;R NOT</text>

  <!-- Dekoratif cizgi -->
  <rect x="${PW/2 - 50}" y="490" width="100" height="2" rx="1" fill="${primary}" opacity="0.4"/>

  <!-- Sevgili ... -->
  <text x="${mx + 40}" y="600" font-family="Segoe Script, Comic Sans MS, Georgia, serif" font-weight="700" font-size="44" fill="#3a3020" font-style="italic">Sevgili ${this._esc(childName)},</text>

  <!-- Not metni -->
  ${notesSVG}

  <!-- Imza -->
  <text x="${PW - mx - 40}" y="${signY}" text-anchor="end" font-family="Segoe Script, Comic Sans MS, Georgia, serif" font-weight="700" font-size="40" fill="${primary}" font-style="italic">Sevgiyle, ${this._esc(senderName || 'Seni seven')}</text>

  <!-- Dekoratif kalp -->
  <text x="${PW - mx - 40}" y="${signY + 50}" text-anchor="end" font-family="Segoe UI" font-size="28" fill="${primary}" opacity="0.5">&#10084;</text>
</svg>`;
  }

  // =========================================================================
  // YARDIMCI FONKSIYONLAR
  // =========================================================================
  _esc(str) {
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
    // Satirlari parcala (newline'lar paragraf sonu)
    const paragraphs = text.split(/\n/);
    const lines = [];

    for (const para of paragraphs) {
      if (para.trim() === "") {
        lines.push(""); // Bos satir (paragraf arasi bosluk)
        continue;
      }
      const words = para.split(" ");
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
    }

    return lines;
  }

  _hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
      : { r: 139, g: 92, b: 246 };
  }

  _hexToRgba(hex, alpha) {
    const rgb = this._hexToRgb(hex);
    return { r: rgb.r, g: rgb.g, b: rgb.b, alpha };
  }
}

module.exports = TextPageRenderer;
