import { ipcMain } from "electron";
import { DebugLogEntry, InstallProgress, InstallRequest } from "../shared/types";
import { SkillsService } from "./skillsService";

export function registerIpcHandlers(service: SkillsService): void {
  ipcMain.handle("skills:list", async () => service.listSkills());
  ipcMain.handle("skills:targets", async () => service.listTargets());
  ipcMain.handle("skills:toggle", async (_event, args: { skillId: string; targetId: string }) => {
    await service.toggleSkillTarget(args.skillId, args.targetId);
    return true;
  });
  ipcMain.handle("skills:install", async (event, request: InstallRequest) =>
    service.installSkillWithProgress(request, (progress: InstallProgress) => {
      event.sender.send("skills:install:progress", progress);
    })
  );
  ipcMain.handle("skills:popular", async () => service.listPopularSkills());
  ipcMain.handle("skills:search", async (event, query: string) =>
    service.searchSkillsMp(query, (message) => {
      const entry: DebugLogEntry = { message, timestamp: new Date().toISOString() };
      event.sender.send("skills:search:debug", entry);
    })
  );
  ipcMain.handle("skills:delete", async (_event, skillId: string) => service.deleteSkillAll(skillId));
  ipcMain.handle("settings:get", async () => service.getSettings());
  ipcMain.handle("settings:update", async (_event, partial: Record<string, unknown>) => service.updateSettings(partial));
}
