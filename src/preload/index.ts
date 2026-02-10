import { contextBridge, ipcRenderer } from "electron";
import {
  AppSettings,
  DebugLogEntry,
  InstallProgress,
  InstallRequest,
  InstallResult,
  DeleteResult,
  PopularSkillsResult,
  SkillsMpSearchResult,
  SkillEntry,
  TargetDescriptor,
  UpdateStatus
} from "../shared/types";

const api = {
  listSkills: (): Promise<SkillEntry[]> => ipcRenderer.invoke("skills:list"),
  listTargets: (): Promise<TargetDescriptor[]> => ipcRenderer.invoke("skills:targets"),
  toggleSkillTarget: (skillId: string, targetId: string): Promise<boolean> =>
    ipcRenderer.invoke("skills:toggle", { skillId, targetId }),
  installSkill: (request: InstallRequest): Promise<InstallResult> => ipcRenderer.invoke("skills:install", request),
  listPopularSkills: (): Promise<PopularSkillsResult> => ipcRenderer.invoke("skills:popular"),
  searchSkillsMp: (query: string): Promise<SkillsMpSearchResult> => ipcRenderer.invoke("skills:search", query),
  deleteSkill: (skillId: string): Promise<DeleteResult> => ipcRenderer.invoke("skills:delete", skillId),
  onSearchDebug: (handler: (entry: DebugLogEntry) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, entry: DebugLogEntry) => {
      handler(entry);
    };
    ipcRenderer.on("skills:search:debug", listener);
    return () => {
      ipcRenderer.removeListener("skills:search:debug", listener);
    };
  },
  onInstallProgress: (handler: (progress: InstallProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: InstallProgress) => {
      handler(progress);
    };
    ipcRenderer.on("skills:install:progress", listener);
    return () => {
      ipcRenderer.removeListener("skills:install:progress", listener);
    };
  },
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:get"),
  updateSettings: (partial: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke("settings:update", partial),
  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke("update:status"),
  checkForUpdates: (): Promise<UpdateStatus> => ipcRenderer.invoke("update:check"),
  downloadUpdate: (): Promise<UpdateStatus> => ipcRenderer.invoke("update:download"),
  installUpdate: (): Promise<boolean> => ipcRenderer.invoke("update:install"),
  onUpdateStatus: (handler: (status: UpdateStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => {
      handler(status);
    };
    ipcRenderer.on("update:status", listener);
    return () => {
      ipcRenderer.removeListener("update:status", listener);
    };
  },
  onAppNavigate: (handler: (tab: "discover" | "catalog" | "activity" | "settings") => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, tab: "discover" | "catalog" | "activity" | "settings") => {
      handler(tab);
    };
    ipcRenderer.on("app:navigate", listener);
    return () => {
      ipcRenderer.removeListener("app:navigate", listener);
    };
  }
};

contextBridge.exposeInMainWorld("skillsApi", api);

export type SkillsApi = typeof api;
