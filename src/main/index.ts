import { app, BrowserWindow } from "electron";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { SettingsStore } from "./settingsStore";
import { SkillsService } from "./skillsService";
import { registerIpcHandlers } from "./ipc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadEnvFile(filePath: string): Promise<void> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) {
        continue;
      }
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key && !(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // ignore missing env file
  }
}

async function createWindow(): Promise<void> {
  const preloadPath = path.join(__dirname, "../preload/index.js");

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#14131A",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_RENDERER_URL;
  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  const cwdEnv = path.join(process.cwd(), ".env");
  loadEnvFile(cwdEnv);
  const appEnv = path.join(app.getAppPath(), ".env");
  if (appEnv !== cwdEnv) {
    loadEnvFile(appEnv);
  }

  const settingsStore = new SettingsStore();
  const service = new SkillsService(settingsStore, []);
  registerIpcHandlers(service);

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
