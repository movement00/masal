// Basit bir uygulama ikonu olustur (256x256 PNG)
const sharp = require("sharp");
const path = require("path");

async function createIcon() {
  // SVG ile renkli bir kitap ikonu
  const svg = `<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#7c5cfc"/>
      <stop offset="100%" style="stop-color:#a855f7"/>
    </linearGradient>
    <linearGradient id="book" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#ffffff"/>
      <stop offset="100%" style="stop-color:#e0e0ff"/>
    </linearGradient>
  </defs>
  <!-- Arka plan - yuvarlatilmis kare -->
  <rect x="8" y="8" width="240" height="240" rx="48" fill="url(#bg)"/>
  <!-- Kitap govdesi -->
  <rect x="58" y="56" width="140" height="150" rx="8" fill="url(#book)" opacity="0.95"/>
  <!-- Kitap sirT cizgisi -->
  <line x1="128" y1="56" x2="128" y2="206" stroke="#7c5cfc" stroke-width="3" opacity="0.3"/>
  <!-- Sol sayfa cizgileri -->
  <line x1="75" y1="90" x2="118" y2="90" stroke="#b0b0d0" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="75" y1="105" x2="115" y2="105" stroke="#b0b0d0" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="75" y1="120" x2="110" y2="120" stroke="#b0b0d0" stroke-width="2.5" stroke-linecap="round"/>
  <!-- Sag sayfa - yildiz -->
  <text x="163" y="140" font-size="48" text-anchor="middle" fill="#f59e0b">&#9733;</text>
  <!-- Alt yazi: MASAL -->
  <text x="128" y="186" font-family="Arial,sans-serif" font-size="20" font-weight="bold" text-anchor="middle" fill="#7c5cfc" letter-spacing="4">MASAL</text>
  </svg>`;

  const pngPath = path.join(__dirname, "icon.png");
  await sharp(Buffer.from(svg)).resize(256, 256).png().toFile(pngPath);
  console.log("Ikon olusturuldu:", pngPath);

  // ICO icin 16, 32, 48, 64, 128, 256 boyutlarinda PNG'ler olustur
  // electron-builder ICO'yu otomatik olusturur ama 256x256 PNG yeterli
}

createIcon().catch(console.error);
