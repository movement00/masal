/**
 * PDFBuilder - Tek Sayfa Modeli PDF Olusturucu
 *
 * Her sahne TEK PNG olarak verilir (illustrasyon + metin overlay birlikte).
 * Bu builder PNG'leri sirasiyla A4 sayfasina yerlestirir.
 *
 * UPGRADE 2026-04-20: Kullanici talebi dogrultusunda sadelesmis akis.
 *
 * Yeni sayfa akisi:
 *   [1]      On kapak
 *   [2]      Hikayemizin Kahramani
 *   [3..N]   Sahneler (her sahne 2 sayfa: illustrasyon + text sayfa)
 *            Sahne aralarina 2 adet "Bunlari biliyor muydunuz" kartlari
 *   [N+1]    Diploma (kategoriye gore isim)
 *   [N+2]    Not sayfasi (hediyeyi hazirlayanin)
 *   [Son]    Arka kapak
 *
 * KALDIRILDI: Ic kapak, Ithaf, Kapanis (SON) — kullanici konseptinde yok.
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
   * @param {Buffer|string} options.heroPagePNG - Hikayemizin Kahramani PNG
   * @param {Array<{finalPNG, sceneNumber, textPNG}>} options.scenePages - Sahne sayfalari (illustrasyon + text)
   * @param {Array<{afterScene: number, png: Buffer|string}>} options.funFactPages - Biliyor muydun sayfalari
   * @param {Buffer|string} options.diplomaPNG - Diploma / kategori sertifikasi PNG
   * @param {Buffer|string} options.senderNotePNG - Hediyeyi hazirlayanin notu PNG
   * @param {Buffer|string} options.backCoverPNG - Arka kapak PNG
   */
  async build(options) {
    const {
      pdfPath,
      title,
      childName,
      coverPNG,
      heroPagePNG,
      scenePages = [],
      funFactPages = [],
      diplomaPNG,
      senderNotePNG,
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

    // === SAYFA 1: ON KAPAK ===
    await this._addImagePage(doc, coverPNG, pageCount === 0);
    pageCount++;

    // === SAYFA 2: HIKAYEMIZIN KAHRAMANI ===
    if (heroPagePNG && fs.existsSync(heroPagePNG)) {
      this._newPage(doc);
      await this._addImagePage(doc, heroPagePNG);
      pageCount++;
    }

    // === SAHNELER: Her sahne 2 sayfa (illustrasyon + text) + aralarda fun facts ===
    for (let i = 0; i < scenePages.length; i++) {
      const scene = scenePages[i];

      // Sayfa A: Saf illustrasyon (metin yok)
      this._newPage(doc);
      await this._addImagePage(doc, scene.finalPNG);
      pageCount++;

      // Sayfa B: Text sayfasi (AI ile uretilmis, minyatur karakter + story text)
      if (scene.textPNG && fs.existsSync(scene.textPNG)) {
        this._newPage(doc);
        await this._addImagePage(doc, scene.textPNG);
        pageCount++;
      }

      // Bu sahneden sonra funFact?
      const sceneNum = scene.sceneNumber || (i + 1);
      if (funFactMap.has(sceneNum)) {
        this._newPage(doc);
        await this._addImagePage(doc, funFactMap.get(sceneNum));
        pageCount++;
      }
    }

    // === DIPLOMA (not sayfasindan once) ===
    if (diplomaPNG && fs.existsSync(diplomaPNG)) {
      this._newPage(doc);
      await this._addImagePage(doc, diplomaPNG);
      pageCount++;
    }

    // === NOT SAYFASI (arka kapaktan once) ===
    if (senderNotePNG && fs.existsSync(senderNotePNG)) {
      this._newPage(doc);
      await this._addImagePage(doc, senderNotePNG);
      pageCount++;
    }

    // === ARKA KAPAK (son sayfa) ===
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
        doc.rect(0, 0, W, H).fill("#0f0f1a");
        return;
      }

      // Full-bleed cover (2026-04-22 fix): aspect korunur + sayfayi tamamen doldurur, beyaz bosluk yok
      // Kucuk crop (~3% kenar) olabilir ama aspect dogru, print-ready.
      doc.image(buffer, 0, 0, { cover: [W, H], align: "center", valign: "center" });
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
