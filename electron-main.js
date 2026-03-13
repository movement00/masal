const { app, BrowserWindow, shell, dialog } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");

// ============================================================
//  Yollar - Paketlenmis ve gelistirme modu icin
// ============================================================
const isDev = !app.isPackaged;
const APP_ROOT = isDev ? __dirname : path.join(process.resourcesPath, "app");

// .env dosyasini yukle
const envPath = isDev
  ? path.join(__dirname, ".env")
  : path.join(process.resourcesPath, ".env");

if (fs.existsSync(envPath)) {
  require("dotenv").config({ path: envPath });
} else {
  // Fallback: uygulama dizininde ara
  require("dotenv").config({ path: path.join(APP_ROOT, ".env") });
}

// Yazilabilir klasorler (output, uploads)
const USER_DATA = app.getPath("userData");
const OUTPUT_DIR = isDev
  ? path.join(__dirname, "output")
  : path.join(USER_DATA, "output");
const UPLOADS_DIR = isDev
  ? path.join(__dirname, "uploads")
  : path.join(USER_DATA, "uploads");

// Klasorleri olustur
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

let mainWindow = null;
let splashWindow = null;
let serverProcess = null;
const PORT = process.env.PORT || 3000;

// ============================================================
//  Splash ekrani (yukleme)
// ============================================================
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 360,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const splashHTML = `data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html>
<html>
<head>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: 'Segoe UI', sans-serif;
    display: flex; align-items: center; justify-content: center;
    height: 100vh; background: transparent;
    -webkit-app-region: drag;
  }
  .container {
    background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%);
    border-radius: 24px; padding: 48px 56px; text-align: center;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    border: 1px solid rgba(124,92,252,0.3);
  }
  .logo { font-size: 48px; margin-bottom: 12px; }
  .title {
    font-size: 28px; font-weight: 700; color: #fff;
    letter-spacing: 6px; margin-bottom: 8px;
  }
  .subtitle { font-size: 13px; color: #888; margin-bottom: 32px; }
  .loader {
    width: 200px; height: 4px; background: rgba(124,92,252,0.15);
    border-radius: 4px; margin: 0 auto; overflow: hidden;
  }
  .loader-bar {
    width: 40%; height: 100%; background: linear-gradient(90deg, #7c5cfc, #a855f7);
    border-radius: 4px; animation: loading 1.5s ease-in-out infinite;
  }
  @keyframes loading {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(350%); }
  }
  .status { font-size: 12px; color: #666; margin-top: 16px; }
</style>
</head>
<body>
  <div class="container">
    <div class="logo">&#128218;</div>
    <div class="title">MASAL</div>
    <div class="subtitle">Hikaye Kitabi Uretici</div>
    <div class="loader"><div class="loader-bar"></div></div>
    <div class="status">Sunucu baslatiliyor...</div>
  </div>
</body>
</html>`)}`;

  splashWindow.loadURL(splashHTML);
}

// ============================================================
//  Sunucuyu baslat
// ============================================================
function startServer() {
  return new Promise((resolve, reject) => {
    const serverScript = path.join(APP_ROOT, "src", "server.js");

    if (!fs.existsSync(serverScript)) {
      return reject(new Error(`Server dosyasi bulunamadi: ${serverScript}`));
    }

    serverProcess = spawn(process.execPath, [serverScript], {
      cwd: APP_ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        OUTPUT_DIR: OUTPUT_DIR,
        UPLOADS_DIR: UPLOADS_DIR,
        ELECTRON_RUN_AS_NODE: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let started = false;

    serverProcess.stdout.on("data", (data) => {
      const msg = data.toString();
      console.log("[SERVER]", msg);
      if (!started && msg.includes("MASAL")) {
        started = true;
        resolve();
      }
    });

    serverProcess.stderr.on("data", (data) => {
      console.error("[SERVER-ERR]", data.toString());
    });

    serverProcess.on("error", (err) => {
      console.error("[SERVER] Baslatilamadi:", err);
      reject(err);
    });

    serverProcess.on("exit", (code) => {
      console.log("[SERVER] Kapandi, kod:", code);
      serverProcess = null;
      // Sunucu beklenmedik sekilde kapandiysa kullaniciyi bilgilendir
      if (code !== 0 && code !== null && mainWindow && !mainWindow.isDestroyed()) {
        dialog.showErrorBox(
          "MASAL - Sunucu Hatasi",
          `Sunucu beklenmedik sekilde kapandi (kod: ${code}).\n\nUygulamayi yeniden baslatmaniz gerekiyor.`
        );
      }
    });

    // 20 saniye timeout
    setTimeout(() => {
      if (!started) {
        checkPort()
          .then(() => {
            started = true;
            resolve();
          })
          .catch(() => reject(new Error("Sunucu baslatma zaman asimi (20s)")));
      }
    }, 20000);
  });
}

function checkPort() {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${PORT}/api/health`, (res) => {
      resolve();
      req.destroy();
    });
    req.on("error", reject);
    req.setTimeout(3000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

// ============================================================
//  Ana pencere
// ============================================================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: "MASAL - Hikaye Kitabi Uretici",
    icon: path.join(APP_ROOT, "assets", "icon.png"),
    backgroundColor: "#08080a",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.once("ready-to-show", () => {
    // Splash ekranini kapat, ana pencereyi goster
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  // Harici linkleri tarayicida ac
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // PDF indirme islemleri
  mainWindow.webContents.session.on("will-download", (event, item) => {
    const filename = item.getFilename();
    if (filename.endsWith(".pdf")) {
      const downloadsPath = app.getPath("downloads");
      const savePath = path.join(downloadsPath, filename);
      item.setSavePath(savePath);
      item.on("done", (event, state) => {
        if (state === "completed") {
          shell.openPath(savePath);
        }
      });
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ============================================================
//  Uygulama yasam dongusu
// ============================================================
app.whenReady().then(async () => {
  try {
    console.log("MASAL baslatiliyor...");
    console.log("APP_ROOT:", APP_ROOT);
    console.log("OUTPUT_DIR:", OUTPUT_DIR);
    console.log("isDev:", isDev);

    createSplashWindow();
    await startServer();
    console.log("Sunucu hazir, pencere aciliyor...");
    createWindow();
  } catch (err) {
    console.error("Baslama hatasi:", err);
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
    dialog.showErrorBox(
      "MASAL - Baslama Hatasi",
      `Sunucu baslatilamadi.\n\n${err.message}\n\nLutfen .env dosyasini ve API anahtarlarini kontrol edin.`
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on("before-quit", () => {
  if (serverProcess) {
    console.log("Sunucu kapatiliyor...");
    try {
      serverProcess.kill("SIGTERM");
    } catch (e) {
      // Zaten kapanmis olabilir
    }
    serverProcess = null;
  }
});

// Hata yakalama
process.on("uncaughtException", (err) => {
  console.error("Beklenmeyen hata:", err);
});
