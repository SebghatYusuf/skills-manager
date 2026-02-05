import fs from "fs/promises";
import path from "path";
import { app } from "electron";
import { AppSettings } from "../shared/types";

const DEFAULT_SETTINGS: AppSettings = {
  extraRoots: []
};

async function readJsonFile(filePath: string): Promise<Partial<AppSettings>> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as Partial<AppSettings>;
  } catch {
    return {};
  }
}

async function writeJsonFile(filePath: string, data: AppSettings): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmpPath, filePath);
}

export class SettingsStore {
  private settingsPath: string;
  private cache: AppSettings | null = null;

  constructor() {
    this.settingsPath = path.join(app.getPath("userData"), "settings.json");
  }

  async getSettings(): Promise<AppSettings> {
    if (this.cache) {
      return this.cache;
    }
    const parsed = await readJsonFile(this.settingsPath);
    this.cache = { ...DEFAULT_SETTINGS, ...parsed };
    return this.cache;
  }

  async updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    const next = { ...current, ...partial };
    this.cache = next;
    await writeJsonFile(this.settingsPath, next);
    return next;
  }

  getManagedRoot(targetId: string): string {
    return path.join(app.getPath("userData"), "targets", targetId, "skills");
  }
}
