/**
 * PDFBuilder - Tek Sayfa Modeli PDF Olusturucu
 *
 * Her sahne TEK PNG olarak verilir (illustrasyon + metin overlay birlikte).
 * Bu builder PNG'leri sirasiyla A4 sayfasina yerlestirir.
 *
 * Sayfa akisi:
 *   [1]  Kapak (pre-rendered PNG)
 *   [2]  Ic kapak (pre-rendered PNG)
 *   [3]  Ithaf (pre-rendered PNG)
 *   [4+] Sahne (tek sayfa: illustrasyon + metin overlay)
 *        Araya "Biliyor muydun?" PNG sayfalari eklenir
 *   [Son-1] Kapanis (pre-rendered PNG)
 *   [Son]   Arka kapak (pre-rendered PNG)
 */

const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { PDF_W: W, PDF_H: H } = require("./constants");

class PDFBuilder {
  /**
   * Tum sayfalar PNG olarak verilir, PDF sadece birlestirme yapar.
   *
   * @param {object} options
   * @param {string} options.pdfPath - Cikti PDF dosyasi
   * @param {string} options.title - Kitap basligi
   * @param {string} options.childName - Cocugun adi
   * @param {Buffer|string} options.coverPNG - Kapak sayfasi PNG
   * @param {Buffer|string} options.innerCoverPNG - Ic kapak PNG
   * @param {Buffer|string} options.dedicationPNG - Ithaf sayfasi PNG
   * @param {Array<{finalPNG, sceneNumber}>} options.scenePages - Sahne sayfalari (tek sayfa per sahne)
   * @param {Array<{afterScene: number, png: Buffer|string}>} options.funFactPages - Biliyor muydun sayfalari
   * @param {Buffer|string} options.endingPNG - Kapanis sayfasi PNG
   * @param {Buffer|string} options.backCoverPNG - Arka kapak PNG
   */
  async build(options) {
    const {
      pdfPath,
      title,
      childName,
      coverPNG,
      innerCoverPNG,
      dedicationPNG,
      scenePages = [],
      funFactPages = [],
      endingPNG,
      backCoverPNG,
    } = options;

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      info: {
        Title: title,
        Author: "MASAL",
        Subject: `${childName} icin ozel hikaye`,
      },
    });

    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    let pageCount = 0;

    // FunFact placement map (afterScene -> PNG)
    const funFactMap = new Map();
    for (const ff of funFactPages) {
      funFactMap.set(ff.afterScene, ff.png);
    }

    // === SAYFA 1: KAPAK ===
    await this._addImagePage(doc, coverPNG, pageCount === 0);
    pageCount++;

    // === SAYFA 2: IC KAPAK ===
    if (innerCoverPNG) {
      this._newPage(doc);
      await this._addImagePage(doc, innerCoverPNG);
      pageCount++;
    }

    // === SAYFA 3: ITHAF ===
    if (dedicationPNG) {
      this._newPage(doc);
      await this._addImagePage(doc, dedicationPNG);
      pageCount++;
    }

    // === TEK SAYFA PER SAHNE: Illustrasyon + Metin Overlay ===
    for (let i = 0; i < scenePages.length; i++) {
      const scene = scenePages[i];

      // Sahne: tek sayfa (illustrasyon + metin birlikte)
      this._newPage(doc);
      await this._addImagePage(doc, scene.finalPNG);
      pageCount++;

      // Bu sahneden sonra funFact?
      const sceneNum = scene.sceneNumber || (i + 1);
      if (funFactMap.has(sceneNum)) {
        this._newPage(doc);
        await this._addImagePage(doc, funFactMap.get(sceneNum));
        pageCount++;
      }
    }

    // === KAPANIS ===
    if (endingPNG) {
      this._newPage(doc);
      await this._addImagePage(doc, endingPNG);
      pageCount++;
    }

    // === ARKA KAPAK ===
    if (backCoverPNG) {
      this._newPage(doc);
      await this._addImagePage(doc, backCoverPNG);
      pageCount++;
    }

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on("finish", () => {
        console.log(`  [pdf] PDF olusturuldu: ${pdfPath} (${pageCount} sayfa)`);
        resolve(pdfPath);
      });
      stream.on("error", reject);
    });
  }

  /**
   * PNG gorselini tam sayfa olarak PDF'e ekler
   * Buffer veya dosya yolu kabul eder
   */
  async _addImagePage(doc, pngSource, isFirstPage = false) {
    if (!pngSource) {
      // Bos sayfa: koyu arka plan
      doc.rect(0, 0, W, H).fill("#0f0f1a");
      return;
    }

    try {
      let buffer;

      if (Buffer.isBuffer(pngSource)) {
        buffer = pngSource;
      } else if (typeof pngSource === "string" && fs.existsSync(pngSource)) {
        buffer = fs.readFileSync(pngSource);
      } else {
        // Dosya yok: bos koyu sayfa
        doc.rect(0, 0, W, H).fill("#0f0f1a");
        return;
      }

      // Orijinal PNG'yi dogrudan PDFKit'e ver - PDFKit otomatik olceklendirir
      // Kaynak PNG'ler 1785x2526 px -> A4 uzerinde ~216 DPI (sharp resize ile ~200 DPI'dan iyilestirme)
      doc.image(buffer, 0, 0, { width: W, height: H });
    } catch (err) {
      console.error("  [pdf] Sayfa gorseli eklenemedi:", err.message);
      doc.rect(0, 0, W, H).fill("#1a1a2e");
    }
  }

  _newPage(doc) {
    doc.addPage({ size: "A4", margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  }
}

module.exports = PDFBuilder;
