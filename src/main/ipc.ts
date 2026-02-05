import { ipcMain } from "electron";
import { InstallRequest } from "../shared/types";
import { SkillsService } from "./skillsService";

export function registerIpcHandlers(service: SkillsService): void {
  ipcMain.handle("skills:list", async () => service.listSkills());
  ipcMain.handle("skills:targets", async () => service.listTargets());
  ipcMain.handle("skills:toggle", async (_event, args: { skillId: string; targetId: string }) => {
    await service.toggleSkillTarget(args.skillId, args.targetId);
    return true;
  });
  ipcMain.handle("skills:install", async (_event, request: InstallRequest) => service.installSkill(request));
  ipcMain.handle("settings:get", async () => service.getSettings());
  ipcMain.handle("settings:update", async (_event, partial: Record<string, unknown>) => service.updateSettings(partial));
}
