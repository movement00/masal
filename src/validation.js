/**
 * Validation - Girdi dogrulama ve path guvenlik fonksiyonlari
 */

const path = require("path");
const fs = require("fs");

const BOOK_ID_REGEX = /^[a-z0-9-]+$/;
const NAME_MAX_LENGTH = 50;
const VALID_GENDERS = ["erkek", "kiz"];
const MAX_AGE = 15;
const ALLOWED_PHOTO_EXTS = [".jpg", ".jpeg", ".png", ".webp"];

/**
 * bookId format ve varlik kontrolu
 * @returns {{ valid: boolean, error?: string }}
 */
function validateBookId(bookId, storiesDir) {
  if (!bookId || typeof bookId !== "string") {
    return { valid: false, error: "Kitap ID gerekli" };
  }
  if (!BOOK_ID_REGEX.test(bookId)) {
    return { valid: false, error: "Geçersiz kitap ID formatı" };
  }
  if (storiesDir) {
    const bookPath = path.join(storiesDir, bookId, "book.json");
    if (!fs.existsSync(bookPath)) {
      return { valid: false, error: `Kitap bulunamadı: ${bookId}` };
    }
  }
  return { valid: true };
}

/**
 * Cocuk adi dogrulama
 */
function validateChildName(name) {
  if (typeof name !== "string" || name.length < 1 || name.length > NAME_MAX_LENGTH) {
    return { valid: false, error: `İsim 1-${NAME_MAX_LENGTH} karakter olmalıdır` };
  }
  return { valid: true };
}

/**
 * Cinsiyet dogrulama
 */
function validateGender(gender) {
  if (!VALID_GENDERS.includes(gender)) {
    return { valid: false, error: `Cinsiyet '${VALID_GENDERS.join("' veya '")}' olmalıdır` };
  }
  return { valid: true };
}

/**
 * Yas dogrulama (opsiyonel alan)
 */
function validateAge(age) {
  if (age === undefined || age === null || age === "") {
    return { valid: true }; // Opsiyonel
  }
  const ageNum = parseInt(age);
  if (isNaN(ageNum) || ageNum < 0 || ageNum > MAX_AGE) {
    return { valid: false, error: `Yaş 0-${MAX_AGE} arasında olmalıdır` };
  }
  return { valid: true };
}

/**
 * Fotograf uzantisi dogrulama
 */
function validatePhotoExt(filename) {
  const ext = path.extname(filename || "").toLowerCase();
  if (!ALLOWED_PHOTO_EXTS.includes(ext)) {
    return { valid: false, error: "Fotoğraf formatı desteklenmiyor (JPG, PNG, WebP)" };
  }
  return { valid: true };
}

/**
 * Path traversal korumasi - guvenli dosya yolu olusturur
 * @returns {{ safe: boolean, resolved: string, error?: string }}
 */
function sanitizePath(baseDir, relativePath) {
  const resolved = path.resolve(baseDir, relativePath);
  if (!resolved.startsWith(path.resolve(baseDir))) {
    return { safe: false, resolved, error: "Erişim reddedildi" };
  }
  return { safe: true, resolved };
}

module.exports = {
  validateBookId,
  validateChildName,
  validateGender,
  validateAge,
  validatePhotoExt,
  sanitizePath,
  BOOK_ID_REGEX,
  VALID_GENDERS,
  ALLOWED_PHOTO_EXTS,
};
