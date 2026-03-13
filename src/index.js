const fs = require("fs");
const path = require("path");
const config = require("./config");
const GoogleImageGenerator = require("./api/google-image");
const FalImageGenerator = require("./api/fal-image");
const KieImageGenerator = require("./api/kie-image");
const TextGenerator = require("./api/text-generator");

class StoryBookGenerator {
  constructor() {
    // Gorsel ureticiyi sec (google, fal veya kie)
    if (config.imageProvider === "fal") {
      this.imageGen = new FalImageGenerator();
      console.log("[*] Görsel üretici: fal.ai (Nano Banana Pro)");
    } else if (config.imageProvider === "kie") {
      this.imageGen = new KieImageGenerator();
      console.log("[*] Görsel üretici: Kie.ai (Nano Banana Pro)");
    } else {
      this.imageGen = new GoogleImageGenerator();
      console.log("[*] Görsel üretici: Google Gemini (Nano Banana Pro)");
    }

    this.textGen = new TextGenerator();
  }

  /**
   * ANA FONKSIYON: Tam bir kisisellesirilmis kitap uretir
   *
   * @param {object} options
   * @param {string} options.bookId - Kitap ID'si (ör: "basketball-champion")
   * @param {string} options.childPhotoPath - Cocuk fotografinin yolu
   * @param {string} options.childName - Cocugun adi
   * @param {string} options.childGender - "erkek" veya "kiz"
   * @param {string} options.childAge - Cocugun yasi
   */
  async generateBook(options) {
    const { bookId, childPhotoPath, childName, childGender, childAge } =
      options;

    console.log(`\n${"=".repeat(60)}`);
    console.log(`  MASAL - Kişiselleştirilmiş Hikaye Kitabı Üretici`);
    console.log(`${"=".repeat(60)}`);
    console.log(`  Kitap: ${bookId}`);
    console.log(`  Çocuk: ${childName} (${childAge} yaş, ${childGender})`);
    console.log(`${"=".repeat(60)}\n`);

    // 1. Kitap sablonunu yukle
    console.log("[1/5] Kitap şablonu yükleniyor...");
    const bookData = this._loadBookTemplate(bookId);
    console.log(`  -> "${bookData.title}" yüklendi (${bookData.scenes.length} sahne)`);

    // 2. Cikti klasoru olustur
    const outputDir = this._createOutputDir(bookId, childName);
    console.log(`[2/5] Çıktı klasörü: ${outputDir}`);

    // 3. Hikaye metinlerini kisisellestir
    console.log("[3/5] Hikaye metinleri kişiselleştiriliyor...");
    const childInfo = { name: childName, gender: childGender, age: childAge };
    const personalizedTexts = await this.textGen.personalizeStoryTexts(
      bookData,
      childInfo,
    );
    console.log("  -> Metinler kişiselleştirildi");

    // Kisisellesirilmis metinleri kaydet
    fs.writeFileSync(
      path.join(outputDir, "texts.json"),
      JSON.stringify(personalizedTexts, null, 2),
      "utf-8",
    );

    // 4. Karakter referans sayfasi olustur
    console.log("[4/5] Karakter referans sayfası oluşturuluyor...");
    const charSheet = await this.imageGen.generateCharacterSheet(
      childPhotoPath,
      bookData.style,
    );
    const charSheetPath = path.join(outputDir, "character-sheet.png");
    fs.writeFileSync(charSheetPath, charSheet);
    console.log("  -> Karakter sayfası kaydedildi");

    // 5. Sahne gorsellerini sirayla uret
    console.log("[5/5] Sahne görselleri üretiliyor...\n");
    const generatedImages = [charSheetPath]; // Referans havuzu

    for (const scene of bookData.scenes) {
      const sceneNum = scene.sceneNumber;
      console.log(
        `  Sahne ${sceneNum}/${bookData.scenes.length}: ${scene.title}`,
      );

      // Prompt'u kisisellestir
      const personalizedPrompt = this.textGen.buildCharacterPrompt(
        scene.prompt,
        childInfo,
      );

      // Son 3 gorseli referans olarak kullan (karakter tutarliligi icin)
      const recentRefs = generatedImages.slice(-3);

      try {
        const imageBuffer = await this.imageGen.generateSceneImage(
          personalizedPrompt,
          childPhotoPath,
          recentRefs,
        );

        const imagePath = path.join(
          outputDir,
          `scene-${String(sceneNum).padStart(2, "0")}.png`,
        );
        fs.writeFileSync(imagePath, imageBuffer);
        generatedImages.push(imagePath);

        console.log(`    ✓ Kaydedildi: scene-${String(sceneNum).padStart(2, "0")}.png`);
      } catch (error) {
        console.error(`    ✗ HATA: ${error.message}`);
        console.log("    Yeniden deneniyor...");

        try {
          // Tekrar dene - sadece cocuk fotografi ile
          const retryBuffer = await this.imageGen.generateSceneImage(
            personalizedPrompt,
            childPhotoPath,
            [],
          );
          const imagePath = path.join(
            outputDir,
            `scene-${String(sceneNum).padStart(2, "0")}.png`,
          );
          fs.writeFileSync(imagePath, retryBuffer);
          generatedImages.push(imagePath);
          console.log(`    ✓ Yeniden deneme başarılı`);
        } catch (retryError) {
          console.error(`    ✗ Yeniden deneme başarısız: ${retryError.message}`);
        }
      }
    }

    // Ozet rapor
    console.log(`\n${"=".repeat(60)}`);
    console.log("  KİTAP ÜRETİMİ TAMAMLANDI!");
    console.log(`  Çıktı: ${outputDir}`);
    console.log(`  Toplam sahne: ${bookData.scenes.length}`);
    console.log(`  Üretilen görsel: ${generatedImages.length - 1}`);
    console.log(`${"=".repeat(60)}\n`);

    return {
      outputDir,
      texts: personalizedTexts,
      imageCount: generatedImages.length - 1,
    };
  }

  /**
   * Kitap sablonunu yukler
   */
  _loadBookTemplate(bookId) {
    const bookPath = path.join(
      __dirname,
      "stories",
      bookId,
      "book.json",
    );
    if (!fs.existsSync(bookPath)) {
      throw new Error(`Kitap şablonu bulunamadı: ${bookId}`);
    }
    return JSON.parse(fs.readFileSync(bookPath, "utf-8"));
  }

  /**
   * Cikti klasoru olusturur
   */
  _createOutputDir(bookId, childName) {
    const timestamp = new Date().toISOString().slice(0, 10);
    const safeName = childName.replace(/[^a-zA-ZçğıöşüÇĞİÖŞÜ0-9]/g, "_");
    const dirName = `${bookId}_${safeName}_${timestamp}`;
    const outputDir = path.join(config.output.dir, dirName);

    fs.mkdirSync(outputDir, { recursive: true });
    return outputDir;
  }
}

// ============================================
// CLI KULLANIM
// ============================================
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 4) {
    console.log(`
Kullanım:
  node src/index.js <kitap-id> <foto-yolu> <çocuk-adı> <cinsiyet> [yaş]

Örnek:
  node src/index.js basketball-champion ./uploads/ali.jpg Ali erkek 6

Mevcut Kitaplar:
  basketball-champion  - Dünyaca Ünlü Basketbolcu Oldum!
`);
    process.exit(1);
  }

  const [bookId, photoPath, childName, gender, age] = args;

  const generator = new StoryBookGenerator();
  await generator.generateBook({
    bookId,
    childPhotoPath: photoPath,
    childName,
    childGender: gender,
    childAge: age || "6",
  });
}

// Modül olarak da kullanılabilir
module.exports = StoryBookGenerator;

// CLI'den çalıştırılırsa
if (require.main === module) {
  main().catch(console.error);
}
