const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const config = require("./config");
const GoogleImageGenerator = require("./api/google-image");
const FalImageGenerator = require("./api/fal-image");
const KieImageGenerator = require("./api/kie-image");
const TextGenerator = require("./api/text-generator");
const PDFBuilder = require("./pdf-builder");
const TextPageRenderer = require("./text-page-renderer");
const CanvasTextRenderer = require("./canvas-text-renderer");
const { BookOrchestrator } = require("./agents");
const { validateBookId, validateChildName, validateGender, validateAge, validatePhotoExt, sanitizePath } = require("./validation");
const archiver = require("archiver");
const { SSE_BUFFER_MAX: SSE_MAX, UPLOAD_MAX_BYTES, UPLOAD_TIMEOUT_MS } = require("./constants");

const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, "..", "uploads");
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.resolve(config.output.dir);
const PUBLIC_DIR = path.join(__dirname, "public");

// SSE: aktif baglanti + event buffer (yeniden baglantida kayip olaylari tekrarlar)
let sseResponse = null;
let sseEventBuffer = [];       // Son olaylari sakla
let isGenerating = false;      // Cift tiklama korumasi

function sendSSE(data) {
  // Buffer'a ekle (yeniden baglanti icin)
  sseEventBuffer.push(data);
  if (sseEventBuffer.length > SSE_MAX) sseEventBuffer.shift();

  if (sseResponse && !sseResponse.writableEnded) {
    try {
      sseResponse.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      console.warn("  [sse] Yazma hatasi:", e.message);
      sseResponse = null;
    }
  }
}

// Multipart parser
function parseMultipart(buffer, boundary) {
  const parts = {};
  const boundaryStr = `--${boundary}`;
  const content = buffer.toString("binary");
  const sections = content.split(boundaryStr).slice(1, -1);

  for (const section of sections) {
    const headerEnd = section.indexOf("\r\n\r\n");
    const header = section.substring(0, headerEnd);
    const body = section.substring(headerEnd + 4, section.length - 2);

    const nameMatch = header.match(/name="([^"]+)"/);
    const filenameMatch = header.match(/filename="([^"]+)"/);

    if (nameMatch) {
      if (filenameMatch) {
        parts[nameMatch[1]] = {
          filename: filenameMatch[1],
          data: Buffer.from(body, "binary"),
        };
      } else {
        parts[nameMatch[1]] = body.trim();
      }
    }
  }
  return parts;
}

function collectBody(req, maxBytes = UPLOAD_MAX_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalSize = 0;
    req.on("data", (chunk) => {
      totalSize += chunk.length;
      if (totalSize > maxBytes) {
        req.destroy();
        return reject(new Error(`Veri limiti asildi (${Math.round(maxBytes/1024/1024)}MB)`));
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", (err) => reject(err));
    setTimeout(() => {
      if (chunks.length === 0) reject(new Error(`Upload timeout (${UPLOAD_TIMEOUT_MS/1000}s)`));
    }, UPLOAD_TIMEOUT_MS);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

function serveStatic(res, filePath) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    return res.end("Not Found");
  }
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css",
    ".js": "application/javascript",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
  };
  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
  });
  fs.createReadStream(filePath).pipe(res);
}

// Gorsel uretici sec
function createImageGenerator() {
  if (config.imageProvider === "fal") return new FalImageGenerator();
  if (config.imageProvider === "kie") return new KieImageGenerator();
  return new GoogleImageGenerator();
}

// ============================================================
// Ana kitap uretim fonksiyonu (BookOrchestrator ile)
// Tum gorevler: PromptArchitect + SceneGenerator + QualityValidator
// ============================================================
async function generateBookWithProgress(options) {
  const {
    bookId, childPhotoPath, childName, childGender, childAge, extraPhotoPaths,
    recipientName, recipientNickname, senderName, senderGender,
    customMessage, sharedActivity, recipientHobby, specialMemory,
  } = options;

  // Cikti klasoru
  const timestamp = new Date().toISOString().slice(0, 10);
  const safeName = childName.replace(/[^a-zA-ZçğıöşüÇĞİÖŞÜ0-9]/g, "_");
  const dirName = `${bookId}_${safeName}_${timestamp}`;
  const outputDir = path.join(OUTPUT_DIR, dirName);
  fs.mkdirSync(outputDir, { recursive: true });

  // BookOrchestrator ile tum pipeline'i calistir
  const orchestrator = new BookOrchestrator({
    sendSSE,
    createImageGen: createImageGenerator,
  });

  return orchestrator.generateBook({
    bookId,
    childPhotoPath,
    childName,
    childGender,
    childAge,
    outputDir,
    dirName,
    extraPhotoPaths: extraPhotoPaths || [],
    // Ozel alanlar — not ve ozel gun kitaplari icin
    recipientName,
    recipientNickname,
    senderName,
    senderGender,
    customMessage,
    sharedActivity,
    recipientHobby,
    specialMemory,
  });
}

// HTTP Sunucu
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  try {
    // Ana sayfa -> admin panel
    if (url.pathname === "/" && req.method === "GET") {
      return serveStatic(res, path.join(PUBLIC_DIR, "index.html"));
    }

    // SSE progress endpoint (yeniden baglanti destegi)
    if (url.pathname === "/api/progress" && req.method === "GET") {
      // Onceki baglanti aciksa kapat
      if (sseResponse && !sseResponse.writableEnded) {
        try { sseResponse.end(); } catch (e) { /* zaten kapanmis olabilir */ }
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      sseResponse = res;

      // Yeniden baglantiysa onceki olaylari tekrarla
      const replay = url.searchParams.get("replay") === "1";
      if (replay && sseEventBuffer.length > 0) {
        console.log(`  [sse] Yeniden baglanti - ${sseEventBuffer.length} olay tekrarlaniyor`);
        for (const evt of sseEventBuffer) {
          try { res.write(`data: ${JSON.stringify(evt)}\n\n`); } catch(e) { break; }
        }
      }

      // Heartbeat - her 5s baglanti canli tutar (Railway proxy timeout onlemi)
      const heartbeatInterval = setInterval(() => {
        if (sseResponse === res && !res.writableEnded) {
          try { res.write(`:heartbeat\n\n`); } catch(e) { clearInterval(heartbeatInterval); }
        } else {
          clearInterval(heartbeatInterval);
        }
      }, 5000);

      req.on("close", () => {
        clearInterval(heartbeatInterval);
        if (sseResponse === res) sseResponse = null;
      });
      return;
    }

    // Saglik kontrolu
    if (url.pathname === "/api/health" && req.method === "GET") {
      return sendJson(res, 200, {
        status: "ok",
        version: "1.0.0",
        imageProvider: config.imageProvider,
        isGenerating,
        uptime: Math.round(process.uptime()),
      });
    }

    // Kitap listesi (ageGroup bilgisi ile)
    if (url.pathname === "/api/books" && req.method === "GET") {
      const storiesDir = path.join(__dirname, "stories");
      const books = [];
      if (fs.existsSync(storiesDir)) {
        for (const dir of fs.readdirSync(storiesDir)) {
          const bp = path.join(storiesDir, dir, "book.json");
          if (fs.existsSync(bp)) {
            const book = JSON.parse(fs.readFileSync(bp, "utf-8"));
            books.push({
              id: book.id,
              category: book.category || "hikaye",
              title: book.title,
              description: book.description,
              ageRange: book.ageRange || book.ageGroup,
              ageGroup: book.ageGroup || book.ageRange,
              pageCount: book.pageCount,
              sceneCount: book.scenes?.length || 0,
              icon: book.theme?.icon || "📖",
              primaryColor: book.theme?.primaryColor || "#6366f1",
              occasion: book.occasion || null,
              targetAudience: book.targetAudience || "cocuk",
            });
          }
        }
      }
      return sendJson(res, 200, { books });
    }

    // Onceki uretimleri listele (galeri persistence)
    if (url.pathname === "/api/outputs" && req.method === "GET") {
      const outputs = [];
      if (fs.existsSync(OUTPUT_DIR)) {
        const dirs = fs.readdirSync(OUTPUT_DIR).filter(d => {
          return fs.statSync(path.join(OUTPUT_DIR, d)).isDirectory();
        }).sort().reverse(); // En yeni ilk

        for (const dir of dirs) {
          const dirPath = path.join(OUTPUT_DIR, dir);
          const textsPath = path.join(dirPath, "texts.json");
          const files = fs.readdirSync(dirPath);

          // Sahne gorselleri
          const scenes = files
            .filter(f => /^scene-\d+-final\.png$/.test(f))
            .sort()
            .map(f => {
              const num = parseInt(f.match(/scene-(\d+)/)[1]);
              let title = "", text = "";
              try {
                if (fs.existsSync(textsPath)) {
                  const texts = JSON.parse(fs.readFileSync(textsPath, "utf-8"));
                  const entry = texts.find(t => t.sceneNumber === num);
                  if (entry) { title = entry.title || ""; text = entry.text || ""; }
                }
              } catch(e) {}
              return {
                sceneNumber: num,
                title,
                text,
                imagePath: `/output/${dir}/${f}`,
              };
            });

          // Profil ve kiyafet gorselleri
          const profiles = files
            .filter(f => f === "character-profile.png" || /^outfit-.+\.png$/.test(f))
            .sort()
            .map(f => ({
              type: f === "character-profile.png" ? "profile" : "outfit",
              name: f.replace(".png", ""),
              imagePath: `/output/${dir}/${f}`,
            }));

          const hasPdf = files.includes("kitap.pdf");

          outputs.push({
            dir,
            scenes,
            profiles,
            pdfPath: hasPdf ? `/output/${dir}/kitap.pdf` : null,
            sceneCount: scenes.length,
          });
        }
      }
      return sendJson(res, 200, { outputs });
    }

    // Kie.ai callback endpoint
    if (url.pathname === "/api/kie-callback" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const data = JSON.parse(body);
          const taskId = data.taskId || data.data?.taskId;
          console.log(`  [callback] Kie.ai callback alındı: taskId=${taskId}, state=${data.state || data.data?.state}`);
          KieImageGenerator.handleCallback(taskId, data.data || data);
          sendJson(res, 200, { ok: true });
        } catch (err) {
          console.error("  [callback] Parse hatası:", err.message);
          sendJson(res, 400, { error: "Invalid JSON" });
        }
      });
      return;
    }

    // Kitap uret
    if (url.pathname === "/api/generate" && req.method === "POST") {
      console.log("  [server] POST /api/generate alindi");

      // Cift tiklama korumasi
      if (isGenerating) {
        return sendJson(res, 429, { error: "Zaten bir kitap üretiliyor, lütfen bekleyin." });
      }

      const contentType = req.headers["content-type"] || "";
      const boundary = contentType.split("boundary=")[1];
      if (!boundary) return sendJson(res, 400, { error: "multipart/form-data gerekli" });

      const body = await collectBody(req);
      const parts = parseMultipart(body, boundary);

      // Kitap bilgisini yukle (kategori kontrolu icin)
      const storiesDir = path.join(__dirname, "stories");
      const bookCheckResult = validateBookId(parts.bookId, storiesDir);
      if (!bookCheckResult.valid) return sendJson(res, 400, { error: bookCheckResult.error });

      const bookMeta = JSON.parse(fs.readFileSync(path.join(storiesDir, parts.bookId, "book.json"), "utf-8"));
      const isAdultBook = bookMeta.category === "ozel-gunler";

      // Zorunlu alan kontrolu (kategoriye gore)
      if (isAdultBook) {
        // Ozel gunler: recipientName ve foto gerekli, gender/age opsiyonel
        for (const field of ["bookId", "childPhoto"]) {
          if (!parts[field]) {
            console.log(`  [server] Eksik alan: ${field}`);
            return sendJson(res, 400, { error: `Eksik alan: ${field}` });
          }
        }
        const recipientName = parts.recipientName || parts.childName;
        if (!recipientName) {
          return sendJson(res, 400, { error: "Eksik alan: recipientName veya childName" });
        }
        // recipientName'i childName olarak kullan (pipeline uyumlulugu)
        parts.childName = recipientName;
        parts.childGender = parts.childGender || "erkek";
        parts.childAge = parts.childAge || "25";
      } else {
        // Cocuk kitaplari: eski zorunlu alanlar
        for (const field of ["bookId", "childName", "childGender", "childPhoto"]) {
          if (!parts[field]) {
            console.log(`  [server] Eksik alan: ${field}`);
            return sendJson(res, 400, { error: `Eksik alan: ${field}` });
          }
        }
      }

      // Girdi dogrulama (validation modulu)
      const checks = [
        validateChildName(parts.childName),
        validatePhotoExt(parts.childPhoto.filename),
      ];
      if (!isAdultBook) {
        checks.push(validateGender(parts.childGender));
        checks.push(validateAge(parts.childAge));
      }
      for (const check of checks) {
        if (!check.valid) return sendJson(res, 400, { error: check.error });
      }

      console.log(`  [server] Kitap: ${parts.bookId}, Kategori: ${bookMeta.category || 'hikaye'}, Isim: ${parts.childName}`);

      // Fotoyu kaydet
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      const photoExt = path.extname(parts.childPhoto.filename) || ".jpg";
      const photoName = `${Date.now()}${photoExt}`;
      const photoPath = path.join(UPLOADS_DIR, photoName);
      fs.writeFileSync(photoPath, parts.childPhoto.data);
      console.log(`  [server] Foto kaydedildi: ${photoPath}`);

      // Ek fotograflari kaydet
      const extraPhotoPaths = [];
      for (let i = 1; i <= 4; i++) {
        const key = 'extraPhoto_' + i;
        if (parts[key] && parts[key].data) {
          const extraExt = path.extname(parts[key].filename) || ".jpg";
          const extraName = `${Date.now()}_extra${i}${extraExt}`;
          const extraPath = path.join(UPLOADS_DIR, extraName);
          fs.writeFileSync(extraPath, parts[key].data);
          extraPhotoPaths.push(extraPath);
          console.log(`  [server] Ek foto ${i} kaydedildi: ${extraPath}`);
        }
      }

      // Uretimi arka planda baslat
      console.log("  [server] Uretim baslatiliyor...");
      console.log("  [server] senderName:", JSON.stringify(parts.senderName), "| customMessage:", JSON.stringify(parts.customMessage ? parts.customMessage.substring(0, 50) : null));
      isGenerating = true;
      sseEventBuffer = []; // Onceki olaylari temizle

      generateBookWithProgress({
        bookId: parts.bookId,
        childPhotoPath: photoPath,
        childName: parts.childName,
        childGender: parts.childGender,
        childAge: parts.childAge || (isAdultBook ? "25" : "6"),
        extraPhotoPaths,
        // Ozel gunler icin ek alanlar
        recipientName: parts.recipientName || null,
        recipientNickname: parts.recipientNickname || null,
        senderName: parts.senderName || null,
        senderGender: parts.senderGender || null,
        customMessage: parts.customMessage || null,
        sharedActivity: parts.sharedActivity || null,
        recipientHobby: parts.recipientHobby || null,
        specialMemory: parts.specialMemory || null,
      }).catch((err) => {
        console.error("  [server] Uretim hatasi:", err.message);
        sendSSE({ type: "error", message: `Kritik hata: ${err.message}` });
        sendSSE({ type: "generation_failed", message: err.message });
      }).finally(() => {
        isGenerating = false;
        // Yuklenen fotoyu temizle (disk alani tasarrufu)
        try {
          if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
        } catch (cleanupErr) {
          console.warn("  [server] Foto temizleme hatasi:", cleanupErr.message);
        }
        // Ek fotograflari temizle
        for (const ep of (extraPhotoPaths || [])) {
          try { if (fs.existsSync(ep)) fs.unlinkSync(ep); } catch(e) {}
        }
      });

      return sendJson(res, 200, { success: true, message: "Üretim başlatıldı" });
    }

    // Metin duzenleme + tekrar render
    if (url.pathname === "/api/rerender-scene" && req.method === "POST") {
      try {
        const body = await collectBody(req);
        const data = JSON.parse(body.toString("utf-8"));
        const { outputDir: relDir, sceneNumber, title, text, bookId } = data;

        if (!relDir || !sceneNumber) {
          return sendJson(res, 400, { error: "outputDir ve sceneNumber gerekli" });
        }

        const pathCheck = sanitizePath(OUTPUT_DIR, relDir);
        if (!pathCheck.safe) {
          return sendJson(res, 403, { error: pathCheck.error });
        }
        const absDir = pathCheck.resolved;

        const padNum = String(sceneNumber).padStart(2, "0");
        const illPath = path.join(absDir, `scene-${padNum}-illustration.png`);
        const finalPath = path.join(absDir, `scene-${padNum}-final.png`);

        if (!fs.existsSync(illPath)) {
          return sendJson(res, 404, { error: "Illustrasyon bulunamadi" });
        }

        // Kitap bilgilerini oku (tema icin)
        let theme = {};
        let ageGroup = "3-6";
        let totalScenes = 10;
        if (bookId) {
          const bookCheck = validateBookId(bookId);
          if (!bookCheck.valid) {
            return sendJson(res, 400, { error: bookCheck.error });
          }
          const bookPath = path.join(__dirname, "stories", bookId, "book.json");
          if (fs.existsSync(bookPath)) {
            const bookData = JSON.parse(fs.readFileSync(bookPath, "utf-8"));
            theme = bookData.theme || {};
            ageGroup = bookData.ageGroup || "3-6";
            totalScenes = bookData.scenes?.length || 10;
          }
        }

        const canvasRenderer = new CanvasTextRenderer();
        await canvasRenderer.renderTextOnImage(illPath, {
          sceneNumber: parseInt(sceneNumber),
          title: title || `Sahne ${sceneNumber}`,
          text: text || "",
          theme,
          ageGroup,
          pageNumber: 3 + parseInt(sceneNumber),
          totalScenes,
          outputPath: finalPath,
        });

        console.log(`  [server] Sahne ${sceneNumber} yeniden render edildi`);
        return sendJson(res, 200, {
          success: true,
          imagePath: `/output/${relDir}/scene-${padNum}-final.png?t=${Date.now()}`,
        });
      } catch (err) {
        console.error("  [server] Rerender hatasi:", err.message);
        return sendJson(res, 500, { error: err.message });
      }
    }

    // Sahne gorselini yeniden uret (AI illustration regeneration)
    if (url.pathname === "/api/regenerate-scene" && req.method === "POST") {
      console.log("  [server] POST /api/regenerate-scene");

      try {
        const body = await collectBody(req);
        const data = JSON.parse(body.toString("utf-8"));
        const { outputDir: relDir, sceneNumber, bookId, title, text } = data;

        if (!relDir || !sceneNumber || !bookId) {
          return sendJson(res, 400, { error: "outputDir, sceneNumber ve bookId gerekli" });
        }

        const pathCheck = sanitizePath(OUTPUT_DIR, relDir);
        if (!pathCheck.safe) return sendJson(res, 403, { error: pathCheck.error });
        const absDir = pathCheck.resolved;

        const padNum = String(sceneNumber).padStart(2, "0");
        const illPath = path.join(absDir, `scene-${padNum}-illustration.png`);
        const finalPath = path.join(absDir, `scene-${padNum}-final.png`);

        // Kitap verisini yukle
        const bookIdCheck = validateBookId(bookId);
        if (!bookIdCheck.valid) return sendJson(res, 400, { error: bookIdCheck.error });
        const bookPath = path.join(__dirname, "stories", bookId, "book.json");
        if (!fs.existsSync(bookPath)) {
          return sendJson(res, 404, { error: "Kitap bulunamadi" });
        }
        const bookData = JSON.parse(fs.readFileSync(bookPath, "utf-8"));
        const scene = bookData.scenes.find(s => s.sceneNumber === parseInt(sceneNumber));
        if (!scene) {
          return sendJson(res, 404, { error: "Sahne bulunamadi" });
        }

        // Meta bilgilerini oku (cocuk adi, cinsiyet, yas)
        let childName = "Kahraman";
        let childGender = "erkek";
        let childAge = "6";
        const metaPath = path.join(absDir, "meta.json");
        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
            childName = meta.childName || childName;
            childGender = meta.childGender || childGender;
            childAge = meta.childAge || childAge;
          } catch(e) {
            console.warn("  [server] Meta okunamadi:", e.message);
          }
        }

        // Prompt olustur
        const { PromptArchitect, SceneGenerator } = require("./agents");
        const childInfo = { name: childName, gender: childGender, age: childAge };
        const promptArchitect = new PromptArchitect(bookData, childInfo);

        const profilePath = path.join(absDir, "character-profile.png");
        const hasCharacterProfile = fs.existsSync(profilePath);
        // Kiyafet profili varsa kullan
        const outfitId = scene.outfitId;
        let outfitProfilePath = null;
        let hasOutfitProfile = false;
        if (outfitId) {
          const possibleOutfitPath = path.join(absDir, `outfit-${outfitId}.png`);
          if (fs.existsSync(possibleOutfitPath)) {
            outfitProfilePath = possibleOutfitPath;
            hasOutfitProfile = true;
          }
        }

        const promptOptions = {
          hasCharacterProfile: !hasOutfitProfile && hasCharacterProfile,
          hasOutfitProfile,
          hasPreviousScene: false,
        };
        const scenePrompt = promptArchitect.buildScenePrompt(scene, promptOptions);

        // Referans gorselleri
        const referenceImages = [];
        if (hasOutfitProfile) {
          referenceImages.push(outfitProfilePath);
        } else if (hasCharacterProfile) {
          referenceImages.push(profilePath);
        }

        // Gorsel uret
        const imageGen = createImageGenerator();
        const sceneGen = new SceneGenerator(imageGen);

        // Cocuk fotografini bul
        const childPhotoFiles = fs.readdirSync(absDir).filter(f => f.startsWith("child-photo"));
        if (childPhotoFiles.length > 0) {
          await sceneGen.prepareChildPhoto(path.join(absDir, childPhotoFiles[0]));
        } else {
          // uploads dizininde arama yap (eski format uyumlulugu)
          const uploadsChildPhotos = fs.existsSync(UPLOADS_DIR)
            ? fs.readdirSync(UPLOADS_DIR).filter(f => f.match(/\.(jpg|jpeg|png|webp)$/i))
            : [];
          if (uploadsChildPhotos.length > 0) {
            await sceneGen.prepareChildPhoto(path.join(UPLOADS_DIR, uploadsChildPhotos[uploadsChildPhotos.length - 1]));
          } else {
            return sendJson(res, 400, { error: "Cocuk fotografi bulunamadi. Yeniden uretim icin cocuk fotografi gerekli." });
          }
        }

        console.log(`  [server] Sahne ${sceneNumber} gorseli yeniden uretiliyor...`);
        const result = await sceneGen.generateScene({
          prompt: scenePrompt,
          referenceImages,
          maxRetries: 2,
        });

        if (result.success && result.buffer) {
          fs.writeFileSync(illPath, result.buffer);
          console.log(`  [server] Sahne ${sceneNumber} gorseli yeniden uretildi`);

          // Metin overlay uygula
          const theme = bookData.theme || {};
          const ageGroup = bookData.ageGroup || "3-6";
          const canvasRenderer = new CanvasTextRenderer();
          await canvasRenderer.renderTextOnImage(illPath, {
            sceneNumber: parseInt(sceneNumber),
            title: title || scene.title,
            text: text || scene.text,
            theme,
            ageGroup,
            pageNumber: 3 + parseInt(sceneNumber),
            totalScenes: bookData.scenes.length,
            outputPath: finalPath,
          });

          return sendJson(res, 200, {
            success: true,
            imagePath: `/output/${relDir}/scene-${padNum}-final.png?t=${Date.now()}`,
          });
        } else {
          return sendJson(res, 500, { error: result.error || "Gorsel uretilemedi" });
        }
      } catch (err) {
        console.error("  [server] Regenerate hatasi:", err.message);
        return sendJson(res, 500, { error: err.message });
      }
    }

    // PDF tekrar olustur (duzenlenmis metinlerle)
    if (url.pathname === "/api/rebuild-pdf" && req.method === "POST") {
      try {
        const body = await collectBody(req);
        const data = JSON.parse(body.toString("utf-8"));
        const { outputDir: relDir, bookId, childName } = data;

        if (!relDir) return sendJson(res, 400, { error: "outputDir gerekli" });

        const pathCheck = sanitizePath(OUTPUT_DIR, relDir);
        if (!pathCheck.safe) {
          return sendJson(res, 403, { error: pathCheck.error });
        }
        const absDir = pathCheck.resolved;

        let bookTitle = "MASAL Hikaye Kitabi";

        if (bookId) {
          const bookCheck = validateBookId(bookId);
          if (!bookCheck.valid) {
            return sendJson(res, 400, { error: bookCheck.error });
          }
          const bookPath = path.join(__dirname, "stories", bookId, "book.json");
          if (fs.existsSync(bookPath)) {
            const bookData = JSON.parse(fs.readFileSync(bookPath, "utf-8"));
            bookTitle = bookData.title;
          }
        }

        // Mevcut dosyalari tara
        const scenePages = [];
        for (let i = 1; i <= 20; i++) {
          const padNum = String(i).padStart(2, "0");
          const finalPath = path.join(absDir, `scene-${padNum}-final.png`);
          if (fs.existsSync(finalPath)) {
            scenePages.push({ sceneNumber: i, finalPNG: finalPath });
          }
        }

        const funFactPages = [];
        for (let i = 1; i <= 10; i++) {
          const ffPath = path.join(absDir, `funfact-after-${i}.png`);
          if (fs.existsSync(ffPath)) {
            funFactPages.push({ afterScene: i, png: ffPath });
          }
        }

        const pdfBuilder = new PDFBuilder();
        const pdfPath = path.join(absDir, "kitap.pdf");

        await pdfBuilder.build({
          pdfPath,
          title: bookTitle,
          childName: childName || "Cocuk",
          coverPNG: path.join(absDir, "cover-final.png"),
          innerCoverPNG: path.join(absDir, "inner-cover.png"),
          dedicationPNG: path.join(absDir, "dedication.png"),
          scenePages,
          funFactPages,
          endingPNG: path.join(absDir, "ending.png"),
          backCoverPNG: path.join(absDir, "back-cover.png"),
        });

        console.log(`  [server] PDF yeniden olusturuldu: ${pdfPath}`);
        return sendJson(res, 200, {
          success: true,
          pdfPath: `/output/${relDir}/kitap.pdf?t=${Date.now()}`,
        });
      } catch (err) {
        console.error("  [server] PDF rebuild hatasi:", err.message);
        return sendJson(res, 500, { error: err.message });
      }
    }

    // Ozel sayfalari yeniden uret (test icin)
    if (url.pathname === "/api/generate-special-pages" && req.method === "POST") {
      console.log("  [server] POST /api/generate-special-pages");

      const body = await collectBody(req);
      const data = JSON.parse(body.toString());
      const { outputDir: relDir, bookId, childName, senderName, customMessage } = data;

      if (!relDir || !bookId) {
        return sendJson(res, 400, { error: "outputDir ve bookId gerekli" });
      }

      const pathCheck = sanitizePath(OUTPUT_DIR, relDir);
      if (!pathCheck.safe) return sendJson(res, 403, { error: pathCheck.error });
      const absDir = pathCheck.resolved;

      // SSE ile progress gonder
      sendSSE({ type: "step", message: "Özel sayfalar üretimi başlıyor..." });

      const bookPath = path.join(__dirname, "stories", bookId, "book.json");
      if (!fs.existsSync(bookPath)) return sendJson(res, 404, { error: "Kitap bulunamadi" });
      const bookData = JSON.parse(fs.readFileSync(bookPath, "utf-8"));

      try {
        const { PromptArchitect, SceneGenerator } = require("./agents");
        const CoverPromptArchitect = require("./agents/cover-prompt-architect");
        const TextPageRenderer2 = require("./text-page-renderer");

        const childInfo = {
          name: childName || "Kahraman", gender: "erkek", age: "6",
          senderName: senderName || "", customMessage: customMessage || ""
        };
        const theme = bookData.theme || {};
        const textRenderer2 = new TextPageRenderer2();
        const coverArchitect = new CoverPromptArchitect(bookData, childInfo);

        const imageGen = createImageGenerator();
        const sceneGen = new SceneGenerator(imageGen);

        // Karakter profili referansi
        const profilePath = path.join(absDir, "character-profile.png");
        const profileRef = fs.existsSync(profilePath) ? profilePath : null;

        // Cocuk fotografi
        const childPhotos = fs.readdirSync(absDir).filter(f => f.startsWith("child-photo"));
        const childPhotoPath = childPhotos.length > 0 ? path.join(absDir, childPhotos[0]) : null;
        const extraPhotos = fs.readdirSync(absDir).filter(f => f.startsWith("extra-photo-")).map(f => path.join(absDir, f));

        // 1. Kapak
        sendSSE({ type: "step", message: "📖 1/5 Ön kapak üretiliyor..." });
        console.log("  [server] Ozel: Kapak uretiliyor...");
        const coverPrompt = coverArchitect.buildCoverPrompt({ characterDesc: bookData.characterDescription?.base || "" });
        const coverResult = await sceneGen.generateBackground({ prompt: coverPrompt, referenceImages: profileRef ? [profileRef] : [], maxRetries: 2 });
        if (coverResult.success) {
          fs.writeFileSync(path.join(absDir, "cover-final.png"), coverResult.buffer);
          sendSSE({ type: "step", message: "✅ Ön kapak tamamlandı" });
        } else {
          sendSSE({ type: "step", message: "⚠️ Ön kapak üretilemedi, atlanıyor..." });
        }

        // 2. Hero page (AI bg + gercek foto)
        sendSSE({ type: "step", message: "🦸 2/5 Hikayemizin kahramanı sayfası üretiliyor..." });
        console.log("  [server] Ozel: Hero page uretiliyor...");
        if (bookData.specialPagePrompts?.heroPage) {
          const heroPrompt = bookData.specialPagePrompts.heroPage + ", " + bookData.style;
          const heroResult = await sceneGen.generateBackground({ prompt: heroPrompt, referenceImages: profileRef ? [profileRef] : [], maxRetries: 2 });
          if (heroResult.success) {
            const heroBgPath = path.join(absDir, "hero-page-bg.png");
            fs.writeFileSync(heroBgPath, heroResult.buffer);
            await textRenderer2.renderHeroPage({
              childName: childInfo.name, childPhotoPath, extraPhotoPaths: extraPhotos,
              theme, ageGroup: bookData.ageGroup, bookTitle: bookData.title,
              outputPath: path.join(absDir, "hero-page.png"), backgroundImagePath: heroBgPath,
            });
            sendSSE({ type: "step", message: "✅ Kahraman sayfası tamamlandı (fotoğraflar yerleştirildi)" });
          } else {
            sendSSE({ type: "step", message: "⚠️ Kahraman sayfası AI arka plan üretilemedi" });
          }
        }

        // 3. Arka kapak
        sendSSE({ type: "step", message: "📕 3/5 Arka kapak üretiliyor..." });
        console.log("  [server] Ozel: Arka kapak uretiliyor...");
        const bcPrompt = coverArchitect.buildBackCoverPrompt();
        const bcResult = await sceneGen.generateBackground({ prompt: bcPrompt, referenceImages: [], maxRetries: 1 });
        if (bcResult.success) {
          fs.writeFileSync(path.join(absDir, "back-cover.png"), bcResult.buffer);
          sendSSE({ type: "step", message: "✅ Arka kapak tamamlandı" });
        } else {
          sendSSE({ type: "step", message: "⚠️ Arka kapak üretilemedi" });
        }

        // 4. Sender note
        if (senderName || customMessage) {
          sendSSE({ type: "step", message: "✉️ 4/5 Gönderen notu üretiliyor..." });
          console.log("  [server] Ozel: Sender note uretiliyor...");
          const snPrompt = coverArchitect.buildSenderNotePrompt();
          const snResult = await sceneGen.generateBackground({ prompt: snPrompt, referenceImages: [], maxRetries: 1 });
          if (snResult.success) {
            fs.writeFileSync(path.join(absDir, "sender-note.png"), snResult.buffer);
            sendSSE({ type: "step", message: "✅ Gönderen notu tamamlandı" });
          }
        } else {
          sendSSE({ type: "step", message: "⏭️ 4/5 Gönderen notu atlandı (bilgi girilmemiş)" });
        }

        // 5. Fun facts
        const funFacts = bookData.funFacts || [];
        const placements = bookData.funFactPlacements || [];

        let normalizedFacts = [];
        if (funFacts.length > 0 && funFacts[0].fact) {
          const grouped = {};
          funFacts.forEach((f) => { const cat = f.category || "Bilgi"; if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(f.fact); });
          let fid = 1;
          for (const [cat, facts] of Object.entries(grouped)) {
            normalizedFacts.push({ id: `fact-${fid}`, title: `Biliyor muydun? ${cat === "Tarih" ? "\u{1f4dc}" : cat === "Bilim" ? "\u{1f52c}" : "\u{1f4a1}"}`, facts: facts.slice(0, 3), icon: cat === "Tarih" ? "\u{1f4dc}" : cat === "Bilim" ? "\u{1f52c}" : "\u{1f4a1}" });
            fid++;
          }
        } else if (funFacts.length > 0 && funFacts[0].id) {
          normalizedFacts = funFacts;
        }

        let normalizedPlacements = [];
        if (placements.length > 0 && typeof placements[0] === "number") {
          placements.forEach((afterScene, idx) => { if (idx < normalizedFacts.length) normalizedPlacements.push({ afterScene, factId: normalizedFacts[idx].id }); });
        } else {
          normalizedPlacements = placements;
        }

        const factMap = new Map();
        for (const f of normalizedFacts) factMap.set(f.id, f);

        sendSSE({ type: "step", message: `🧠 5/5 Biliyor muydunuz sayfaları üretiliyor (${normalizedPlacements.length} adet)...` });
        let ffDone = 0;
        for (const placement of normalizedPlacements) {
          const fact = factMap.get(placement.factId);
          if (fact) {
            ffDone++;
            sendSSE({ type: "step", message: `🧠 Fun Fact ${ffDone}/${normalizedPlacements.length} üretiliyor...` });
            console.log("  [server] Ozel: FunFact " + placement.afterScene + " uretiliyor...");
            const ffPrompt = coverArchitect.buildFunFactPagePrompt(fact);
            const ffResult = await sceneGen.generateBackground({ prompt: ffPrompt, referenceImages: [], maxRetries: 1 });
            if (ffResult.success) {
              fs.writeFileSync(path.join(absDir, `funfact-after-${placement.afterScene}.png`), ffResult.buffer);
              sendSSE({ type: "step", message: `✅ Fun Fact ${ffDone} tamamlandı` });
            }
          }
        }

        sendSSE({ type: "step", message: "🎉 Tüm özel sayfalar tamamlandı!" });
        console.log("  [server] Ozel sayfalar tamamlandi!");
        return sendJson(res, 200, { success: true, message: "Ozel sayfalar uretildi" });
      } catch (err) {
        console.error("  [server] Ozel sayfa hatasi:", err.message);
        return sendJson(res, 500, { error: err.message });
      }
    }

    // Toplu gorsel indirme (ZIP)
    if (url.pathname === "/api/download-all" && req.method === "GET") {
      const relDir = url.searchParams.get("dir");
      if (!relDir) return sendJson(res, 400, { error: "dir parametresi gerekli" });

      const pathCheck = sanitizePath(OUTPUT_DIR, relDir);
      if (!pathCheck.safe) return sendJson(res, 403, { error: pathCheck.error });
      const absDir = pathCheck.resolved;

      if (!fs.existsSync(absDir)) return sendJson(res, 404, { error: "Klasor bulunamadi" });

      // final PNG dosyalarini topla (sahne + ozel sayfalar)
      const files = fs.readdirSync(absDir).filter(f => f.endsWith("-final.png") || f === "kitap.pdf");
      if (files.length === 0) return sendJson(res, 404, { error: "Indirilecek dosya bulunamadi" });

      const zipName = `${relDir}.zip`;
      res.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
      });

      const archive = archiver("zip", { zlib: { level: 5 } });
      archive.on("error", (err) => {
        console.error("  [server] ZIP hatasi:", err.message);
        if (!res.writableEnded) res.end();
      });
      archive.pipe(res);

      for (const file of files) {
        archive.file(path.join(absDir, file), { name: file });
      }

      await archive.finalize();
      console.log(`  [server] ZIP indirildi: ${zipName} (${files.length} dosya)`);
      return;
    }

    // Tekli gorsel indirme (force download header)
    if (url.pathname === "/api/download-image" && req.method === "GET") {
      const filePath = url.searchParams.get("file");
      if (!filePath) return sendJson(res, 400, { error: "file parametresi gerekli" });

      const check = sanitizePath(OUTPUT_DIR, filePath);
      if (!check.safe) return sendJson(res, 403, { error: check.error });

      if (!fs.existsSync(check.resolved)) return sendJson(res, 404, { error: "Dosya bulunamadi" });

      const fileName = path.basename(check.resolved);
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      });
      fs.createReadStream(check.resolved).pipe(res);
      return;
    }

    // Statik dosyalar: /output/*
    if (url.pathname.startsWith("/output/")) {
      const requested = decodeURIComponent(url.pathname.replace("/output/", ""));
      const check = sanitizePath(OUTPUT_DIR, requested);
      if (!check.safe) return sendJson(res, 403, { error: check.error });
      return serveStatic(res, check.resolved);
    }

    // Statik dosyalar: /uploads/*
    if (url.pathname.startsWith("/uploads/")) {
      const requested = decodeURIComponent(url.pathname.replace("/uploads/", ""));
      const check = sanitizePath(UPLOADS_DIR, requested);
      if (!check.safe) return sendJson(res, 403, { error: check.error });
      return serveStatic(res, check.resolved);
    }

    // Diger public dosyalar
    if (url.pathname.startsWith("/public/")) {
      const requested = decodeURIComponent(url.pathname.replace("/public/", ""));
      const check = sanitizePath(PUBLIC_DIR, requested);
      if (!check.safe) return sendJson(res, 403, { error: check.error });
      return serveStatic(res, check.resolved);
    }

    sendJson(res, 404, { error: "Bulunamadı" });
  } catch (error) {
    console.error("Sunucu hatası:", error);
    sendJson(res, 500, { error: error.message });
  }
});

// Sunucu cokmesini engelle - hata yakaleyip logla
process.on("uncaughtException", (err) => {
  console.error("  [server] YAKALANMAMIS HATA:", err.message);
  console.error(err.stack);
  sendSSE({ type: "error", message: `Sistem hatası: ${err.message}` });
});

process.on("unhandledRejection", (reason) => {
  console.error("  [server] YAKALANMAMIS PROMISE HATASI:", reason);
  sendSSE({ type: "error", message: `Async hata: ${reason}` });
});

// Baslamadan once ortam degiskenlerini dogrula
config.validate();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`
╔══════════════════════════════════════════╗
║   MASAL - Admin Panel                    ║
║   http://localhost:${PORT}                  ║
║                                          ║
║   Görsel: ${config.imageProvider.toUpperCase().padEnd(30)}║
║   Çözünürlük: ${config.output.resolution.padEnd(26)}║
║   Mod: Tek Sayfa (canvas overlay)        ║
║   Callback: ${(process.env.CALLBACK_URL || "KAPALI (polling)").padEnd(24)}║
╚══════════════════════════════════════════╝
`);
  console.log(`  [server] CALLBACK_URL = ${process.env.CALLBACK_URL || "(yok - polling modu)"}`);
});
