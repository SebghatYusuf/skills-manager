import { app, BrowserWindow, Menu, nativeImage, shell } from "electron";
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

function buildAppMenu(mainWindow: BrowserWindow): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: "Settings…",
          accelerator: "CmdOrCtrl+,",
          click: () => mainWindow.webContents.send("app:navigate", "settings")
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "File",
      submenu: [
        {
          label: "Discover Skills",
          accelerator: "CmdOrCtrl+1",
          click: () => mainWindow.webContents.send("app:navigate", "discover")
        },
        {
          label: "Installed Skills",
          accelerator: "CmdOrCtrl+2",
          click: () => mainWindow.webContents.send("app:navigate", "catalog")
        },
        {
          label: "Activity",
          accelerator: "CmdOrCtrl+3",
          click: () => mainWindow.webContents.send("app:navigate", "activity")
        },
        { type: "separator" },
        { role: "close" }
      ]
    },
    { role: "editMenu" },
    {
      role: "viewMenu",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        {
          label: "SkillsMP API Docs",
          click: () => shell.openExternal("https://skillsmp.com/docs/api")
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function resolveIconPath(): string {
  return path.join(app.getAppPath(), "media/app-icon.svg");
}

async function createWindow(): Promise<BrowserWindow> {
  const preloadPath = path.join(__dirname, "../preload/index.js");
  const iconPath = resolveIconPath();

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#14131A",
    icon: iconPath,
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

  buildAppMenu(mainWindow);

  if (process.platform === "darwin") {
    const dockIcon = nativeImage.createFromPath(iconPath);
    if (!dockIcon.isEmpty()) {
      app.dock.setIcon(dockIcon);
    }
  }

  return mainWindow;
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
