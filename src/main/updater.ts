import { app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import type { UpdateInfo, ProgressInfo } from "electron-updater";
import { UpdateStatus } from "../shared/types";

let currentStatus: UpdateStatus = { status: "idle" };

function broadcastStatus(status: UpdateStatus): void {
  currentStatus = status;
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("update:status", status);
  }
}

function extractReleaseName(info: UpdateInfo): string | undefined {
  return info.releaseName || info.version;
}

export function getUpdateStatus(): UpdateStatus {
  return currentStatus;
}

export function registerAutoUpdater(): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    broadcastStatus({ status: "checking" });
  });
  autoUpdater.on("update-available", (info: UpdateInfo) => {
    broadcastStatus({
      status: "available",
      version: info.version,
      releaseName: extractReleaseName(info)
    });
  });
  autoUpdater.on("update-not-available", () => {
    broadcastStatus({ status: "not-available" });
  });
  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    broadcastStatus({
      status: "downloading",
      progress: Math.max(0, Math.min(100, Math.round(progress.percent)))
    });
  });
  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    broadcastStatus({
      status: "downloaded",
      version: info.version,
      releaseName: extractReleaseName(info)
    });
  });
  autoUpdater.on("error", (error) => {
    const message = error instanceof Error ? error.message : String(error);
    broadcastStatus({ status: "error", message });
  });
}

function ensurePackaged(): boolean {
  if (app.isPackaged) {
    return true;
  }
  broadcastStatus({
    status: "error",
    message: "Updates are available only in packaged builds."
  });
  return false;
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!ensurePackaged()) {
    return currentStatus;
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    broadcastStatus({ status: "error", message });
  }
  return currentStatus;
}

export async function downloadUpdate(): Promise<UpdateStatus> {
  if (!ensurePackaged()) {
    return currentStatus;
  }
  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    broadcastStatus({ status: "error", message });
  }
  return currentStatus;
}

export function installUpdate(): void {
  if (!ensurePackaged()) {
    return;
  }
  autoUpdater.quitAndInstall();
}
