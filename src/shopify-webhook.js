/**
 * Shopify Webhook Handler + Telegram Delivery
 *
 * Siparis alinca Shopify webhook gelir, biz de:
 * 1. HMAC imzasini dogrula
 * 2. Line item property'lerini parse et (Cocugun Adi, Yas, Cinsiyet, Foto 1/2, Ozel Not)
 * 3. Product handle'dan Masal book.json bul
 * 4. Fotograflari indir
 * 5. Masal BookOrchestrator tetikle
 * 6. PDF hazirlandiginda Telegram'a admin'e gonder (PDF attached)
 *
 * Asenkron: webhook endpoint 200 doner hemen, uretim arka planda.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const config = require("./config");

// ════════════════════════════════════════════════════════════
// HMAC VERIFICATION
// ════════════════════════════════════════════════════════════

/**
 * Shopify webhook HMAC-SHA256 imzasini dogrula.
 * @param {Buffer|string} rawBody - raw request body (Buffer onerilir)
 * @param {string} hmacHeader - X-Shopify-Hmac-Sha256 header
 * @param {string} secret - SHOPIFY_WEBHOOK_SECRET
 * @returns {boolean}
 */
function verifyShopifyHmac(rawBody, hmacHeader, secret) {
  if (!secret || !hmacHeader) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf8");
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64");
  // Sabit zamanli karsilastirma
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

// ════════════════════════════════════════════════════════════
// ORDER PARSER
// ════════════════════════════════════════════════════════════

/**
 * Shopify order payload'undan line item + property cikart.
 * @param {object} order - Shopify Order JSON
 * @returns {Array<{
 *   productHandle: string,
 *   productTitle: string,
 *   childName: string,
 *   age: string,
 *   gender: string,
 *   photoUrl1: string|null,
 *   photoUrl2: string|null,
 *   customMessage: string,
 *   orderId: string,
 *   orderName: string,
 *   customerEmail: string,
 *   shippingName: string,
 *   shippingAddress: string,
 * }>}
 */
function parseOrder(order) {
  const items = [];
  if (!order || !Array.isArray(order.line_items)) return items;

  const customerEmail = order.contact_email || order.email || "";
  const shippingName = order.shipping_address
    ? `${order.shipping_address.first_name || ""} ${order.shipping_address.last_name || ""}`.trim()
    : "";
  const shippingAddress = order.shipping_address
    ? [
        order.shipping_address.address1,
        order.shipping_address.address2,
        order.shipping_address.city,
        order.shipping_address.province,
        order.shipping_address.zip,
        order.shipping_address.country,
      ].filter(Boolean).join(", ")
    : "";

  for (const li of order.line_items) {
    const props = {};
    (li.properties || []).forEach((p) => { if (p && p.name) props[p.name] = p.value; });

    const childName = props["Çocuğun Adı"] || props["Cocugun Adi"] || "";
    if (!childName) continue; // Ozellik yoksa kiside ozel olmayan urundur

    const gender = (props["Cinsiyet"] || "").toLowerCase();
    const genderMasal = gender.startsWith("k") ? "kiz" : "erkek";

    items.push({
      productHandle: li.product_handle || li.handle || "",
      productTitle: li.title || li.name || "",
      childName: childName.trim(),
      age: String(props["Yaş"] || props["Yas"] || "6").trim(),
      gender: genderMasal,
      photoUrl1: props["Fotoğraf 1"] || props["Fotograf 1"] || null,
      photoUrl2: props["Fotoğraf 2"] || props["Fotograf 2"] || null,
      customMessage: (props["Özel Not"] || props["Ozel Not"] || "").trim(),
      orderId: String(order.id || ""),
      orderName: order.name || "",
      customerEmail,
      shippingName,
      shippingAddress,
    });
  }

  return items;
}

// ════════════════════════════════════════════════════════════
// PHOTO DOWNLOAD
// ════════════════════════════════════════════════════════════

/**
 * URL'den dosya indir, buffer dondur.
 */
function downloadUrl(url) {
  return new Promise((resolve, reject) => {
    if (!url) return resolve(null);
    const client = url.startsWith("https://") ? https : http;
    client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadUrl(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

/**
 * Cocuk fotografini indirip temp dizinine yaz.
 * @returns {Promise<{mainPath:string, extraPaths:string[]}>}
 */
async function downloadChildPhotos(item, outDir) {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const main = item.photoUrl1;
  if (!main) throw new Error("Fotoğraf 1 yok — sipariş eksik");
  const mainBuf = await downloadUrl(main);
  const mainPath = path.join(outDir, "child-photo.jpg");
  fs.writeFileSync(mainPath, mainBuf);

  const extraPaths = [];
  if (item.photoUrl2) {
    try {
      const buf = await downloadUrl(item.photoUrl2);
      const p = path.join(outDir, "child-photo-2.jpg");
      fs.writeFileSync(p, buf);
      extraPaths.push(p);
    } catch (e) { console.warn("  [webhook] Foto 2 indirilemedi:", e.message); }
  }
  return { mainPath, extraPaths };
}

// ════════════════════════════════════════════════════════════
// TELEGRAM SENDER
// ════════════════════════════════════════════════════════════

/**
 * Telegram Bot API ile dosya ekli mesaj gonderir.
 * @param {string} chatId
 * @param {string} text - caption
 * @param {string} filePath - PDF veya baska dosya
 */
async function telegramSendDocument(chatId, text, filePath) {
  const botToken = config.telegram.botToken;
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN yok");
  if (!chatId) throw new Error("chatId yok");

  const fileBuf = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const boundary = "----MasalBoundary" + Math.random().toString(16).slice(2);

  const parts = [];
  const addText = (name, value) => {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`, "utf8"));
  };
  addText("chat_id", chatId);
  addText("caption", text.slice(0, 1024)); // Telegram caption limit
  addText("parse_mode", "HTML");

  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${fileName}"\r\nContent-Type: application/pdf\r\n\r\n`, "utf8"));
  parts.push(fileBuf);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"));
  const body = Buffer.concat(parts);

  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "api.telegram.org",
      path: `/bot${botToken}/sendDocument`,
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length,
      },
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const txt = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode === 200) resolve(JSON.parse(txt));
        else reject(new Error(`Telegram API ${res.statusCode}: ${txt.slice(0, 400)}`));
      });
    });
    req.on("error", reject);
    req.setTimeout(120000, () => req.destroy(new Error("timeout")));
    req.write(body);
    req.end();
  });
}

/**
 * Sadece metin Telegram mesaji (error bildirimi icin).
 */
async function telegramSendMessage(chatId, text) {
  const botToken = config.telegram.botToken;
  if (!botToken || !chatId) return;
  const body = JSON.stringify({ chat_id: chatId, text: text.slice(0, 4096), parse_mode: "HTML" });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: "api.telegram.org",
      path: `/bot${botToken}/sendMessage`,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, (res) => { res.on("data", () => {}); res.on("end", resolve); });
    req.on("error", () => resolve(null));
    req.setTimeout(30000, () => req.destroy());
    req.write(body);
    req.end();
  });
}

// ════════════════════════════════════════════════════════════
// PDF COMPRESS (Telegram 50MB limit icin)
// ════════════════════════════════════════════════════════════

/**
 * PDF'i Ghostscript varsa compress et, yoksa olduguz gibi birak.
 * Telegram bot API 50MB limit var. Kitaplarimiz ~50-80MB cikabiliyor.
 */
async function maybeCompressPdf(pdfPath) {
  const stat = fs.statSync(pdfPath);
  const sizeMB = stat.size / (1024 * 1024);
  if (sizeMB <= 48) return pdfPath; // 48MB altinda gerek yok

  try {
    const { execSync } = require("child_process");
    const outPath = pdfPath.replace(/\.pdf$/, "-compressed.pdf");
    // Ghostscript compress (screen = en yuksek compression, ebook = orta, printer = dusuk)
    execSync(`gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outPath}" "${pdfPath}"`, { timeout: 120000 });
    if (fs.existsSync(outPath)) {
      const newSize = fs.statSync(outPath).size / (1024 * 1024);
      console.log(`  [webhook] PDF compress: ${sizeMB.toFixed(1)}MB -> ${newSize.toFixed(1)}MB`);
      return outPath;
    }
  } catch (e) {
    console.warn("  [webhook] PDF compress basarisiz (Ghostscript kurulu mu?):", e.message);
  }
  return pdfPath;
}

// ════════════════════════════════════════════════════════════
// MAIN WEBHOOK HANDLER
// ════════════════════════════════════════════════════════════

/**
 * Webhook handler — triggerMasalGenerate callback'i ile kullanilir.
 * server.js tarafi:
 *   handleShopifyWebhook(rawBody, headers, { triggerMasalGenerate, getMasalOutputDir })
 *     .then(...) .catch(...)
 *
 * @param {Buffer} rawBody
 * @param {object} headers - req.headers
 * @param {object} opts
 * @param {function} opts.triggerMasalGenerate - async ({bookId, childName, age, gender, photoPath, extraPhotoPaths, customMessage}) => {outputDir, pdfPath}
 * @param {string} opts.storiesDir - absolute path to src/stories/
 * @param {string} opts.uploadsDir - absolute path to uploads/
 * @returns {Promise<{ok:boolean, processedItems:number, error?:string}>}
 */
async function handleShopifyWebhook(rawBody, headers, opts = {}) {
  const hmacHeader = headers["x-shopify-hmac-sha256"] || headers["X-Shopify-Hmac-Sha256"];
  const secret = config.shopify.webhookSecret;

  // HMAC dogrulama
  if (!verifyShopifyHmac(rawBody, hmacHeader, secret)) {
    return { ok: false, processedItems: 0, error: "HMAC dogrulamasi basarisiz" };
  }

  let order;
  try { order = JSON.parse(rawBody.toString("utf8")); }
  catch (e) { return { ok: false, processedItems: 0, error: "JSON parse hatasi: " + e.message }; }

  const items = parseOrder(order);
  if (items.length === 0) {
    return { ok: true, processedItems: 0, error: "Line item yok veya child name yok — bu siparis kisiye ozel degil" };
  }

  // Hemen cevap verecegiz (5s Shopify timeout'u), arka planda isle
  setImmediate(() => processItems(items, opts).catch((e) => {
    console.error("  [webhook] Background process hatasi:", e.stack || e.message);
    telegramSendMessage(config.telegram.adminChatId,
      `<b>❌ Webhook hatasi</b>\nSiparis #${order.name || order.id}\n${e.message}`
    ).catch(() => {});
  }));

  return { ok: true, processedItems: items.length };
}

/**
 * Her line item icin asenkron Masal uretimi + Telegram bildirim.
 */
async function processItems(items, opts) {
  for (const item of items) {
    const label = `${item.orderName} — ${item.childName} (${item.productTitle})`;
    console.log(`  [webhook] ISLENIYOR: ${label}`);

    // Baslangic bildirimi
    await telegramSendMessage(config.telegram.adminChatId,
      `<b>🚀 Yeni sipariş</b>\n` +
      `<b>Sipariş:</b> ${item.orderName}\n` +
      `<b>Ürün:</b> ${item.productTitle}\n` +
      `<b>Çocuk:</b> ${item.childName}, ${item.age} yaş (${item.gender})\n` +
      `<b>Müşteri:</b> ${item.shippingName}\n` +
      `<b>Özel not:</b> ${item.customMessage || "—"}\n` +
      `<i>Üretim başladı, 15-20 dk sürer...</i>`
    ).catch(() => {});

    try {
      // book.json var mi kontrol
      const bookDir = path.join(opts.storiesDir, item.productHandle);
      if (!fs.existsSync(path.join(bookDir, "book.json"))) {
        throw new Error(`Masal template yok: ${item.productHandle}. Stage 1 sync calistirilmali.`);
      }

      // Foto indir
      const tempDir = path.join(opts.uploadsDir, `order-${item.orderId}-${item.childName.replace(/\s/g, "-")}`);
      const { mainPath, extraPaths } = await downloadChildPhotos(item, tempDir);

      // Masal uretim tetikle
      const result = await opts.triggerMasalGenerate({
        bookId: item.productHandle,
        childName: item.childName,
        age: item.age,
        gender: item.gender,
        photoPath: mainPath,
        extraPhotoPaths: extraPaths,
        customMessage: item.customMessage,
        orderMeta: {
          orderName: item.orderName,
          orderId: item.orderId,
          customerEmail: item.customerEmail,
          shippingName: item.shippingName,
          shippingAddress: item.shippingAddress,
        },
      });

      if (!result || !result.pdfPath || !fs.existsSync(result.pdfPath)) {
        throw new Error("PDF uretilemedi veya dosya yok");
      }

      // PDF compress (gerekirse)
      const pdfToSend = await maybeCompressPdf(result.pdfPath);

      // Telegram'a PDF gonder
      const caption =
        `<b>✅ Kitap hazır</b>\n` +
        `<b>Sipariş:</b> ${item.orderName}\n` +
        `<b>Ürün:</b> ${item.productTitle}\n` +
        `<b>Çocuk:</b> ${item.childName}, ${item.age} yaş\n\n` +
        `<b>Baskı için teslim alın:</b>\n` +
        `👤 <b>${item.shippingName}</b>\n` +
        `📍 ${item.shippingAddress}\n` +
        `✉️ ${item.customerEmail}`;

      await telegramSendDocument(config.telegram.adminChatId, caption, pdfToSend);
      console.log(`  [webhook] TAMAM: ${label}`);
    } catch (e) {
      console.error(`  [webhook] HATA (${label}):`, e.message);
      await telegramSendMessage(config.telegram.adminChatId,
        `<b>❌ Üretim hatası</b>\n` +
        `<b>Sipariş:</b> ${item.orderName}\n` +
        `<b>Ürün:</b> ${item.productTitle}\n` +
        `<b>Çocuk:</b> ${item.childName}\n\n` +
        `<b>Hata:</b> ${e.message}`
      ).catch(() => {});
    }
  }
}

module.exports = {
  verifyShopifyHmac,
  parseOrder,
  downloadChildPhotos,
  telegramSendDocument,
  telegramSendMessage,
  maybeCompressPdf,
  handleShopifyWebhook,
};
