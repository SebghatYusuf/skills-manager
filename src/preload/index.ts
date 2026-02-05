import { contextBridge, ipcRenderer } from "electron";
import { AppSettings, InstallRequest, InstallResult, SkillEntry, TargetDescriptor } from "../shared/types";

const api = {
  listSkills: (): Promise<SkillEntry[]> => ipcRenderer.invoke("skills:list"),
  listTargets: (): Promise<TargetDescriptor[]> => ipcRenderer.invoke("skills:targets"),
  toggleSkillTarget: (skillId: string, targetId: string): Promise<boolean> =>
    ipcRenderer.invoke("skills:toggle", { skillId, targetId }),
  installSkill: (request: InstallRequest): Promise<InstallResult> => ipcRenderer.invoke("skills:install", request),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:get"),
  updateSettings: (partial: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke("settings:update", partial)
};

contextBridge.exposeInMainWorld("skillsApi", api);

export type SkillsApi = typeof api;
