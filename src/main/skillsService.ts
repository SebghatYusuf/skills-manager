import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { app } from "electron";
import { SkillRegistry } from "../skills/registry";
import { parseSkillFile } from "../skills/parser";
import { createCodexTarget } from "../skills/targets/codex";
import { createOpencodeTarget } from "../skills/targets/opencode";
import { createClaudeTarget } from "../skills/targets/claude";
import { createVsCodeTarget } from "../skills/targets/vscode";
import { AppSettings, InstallRequest, InstallResult, SkillEntry, SkillTarget, TargetDescriptor } from "../shared/types";
import { SettingsStore } from "./settingsStore";

interface SkillCandidate {
  dir: string;
  name: string;
}

function normalizeRepo(repo: string): string {
  const trimmed = repo.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("git@")) {
    return trimmed;
  }
  return `https://github.com/${trimmed}.git`;
}

async function runCommand(command: string, args: string[], cwd?: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
      }
    });
  });
}

async function findSkillDirs(root: string): Promise<SkillCandidate[]> {
  const results: SkillCandidate[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase() === "skill.md") {
        const parsed = await parseSkillFile(fullPath);
        results.push({ dir: path.dirname(fullPath), name: parsed.name });
      }
    }
  }

  await walk(root);
  return results;
}

async function copyDir(source: string, destination: string): Promise<void> {
  await fs.mkdir(destination, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

export class SkillsService {
  private registry: SkillRegistry;
  private targets: SkillTarget[];

  constructor(private settingsStore: SettingsStore, private workspaceFolders: string[]) {
    this.targets = this.buildTargets();
    this.registry = new SkillRegistry({
      extraRoots: [],
      targets: this.targets
    });
  }

  private buildTargets(): SkillTarget[] {
    return [
      createVsCodeTarget({ managedRoot: this.settingsStore.getManagedRoot("vscode") }),
      createOpencodeTarget({ workspaceFolders: this.workspaceFolders }),
      createCodexTarget({ workspaceFolders: this.workspaceFolders }),
      createClaudeTarget({ workspaceFolders: this.workspaceFolders })
    ];
  }

  async refreshRegistry(): Promise<void> {
    const settings = await this.settingsStore.getSettings();
    this.targets = this.buildTargets();
    this.registry = new SkillRegistry({
      extraRoots: settings.extraRoots,
      targets: this.targets
    });
  }

  listTargets(): TargetDescriptor[] {
    return this.targets
      .map((target) => ({
        id: target.id,
        label: target.label,
        priority: target.priority,
        supportsEnablement: target.supportsEnablement
      }))
      .sort((a, b) => a.priority - b.priority);
  }

  async listSkills(): Promise<SkillEntry[]> {
    await this.refreshRegistry();
    return this.registry.listSkills();
  }

  async toggleSkillTarget(skillId: string, targetId: string): Promise<void> {
    await this.refreshRegistry();
    const skills = await this.registry.listSkills();
    const skill = skills.find((item) => item.id === skillId);
    if (!skill) {
      throw new Error("Skill not found");
    }
    await this.registry.toggleSkillTarget(skill, targetId);
  }

  async getSettings(): Promise<AppSettings> {
    return this.settingsStore.getSettings();
  }

  async updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    const next = await this.settingsStore.updateSettings(partial);
    await this.refreshRegistry();
    return next;
  }

  async installSkill(request: InstallRequest): Promise<InstallResult> {
    const settings = await this.settingsStore.getSettings();
    const targetId = request.targetId ?? settings.defaultInstallTarget ?? "vscode";
    const targetRoots = await this.targets.find((item) => item.id === targetId)?.getRoots();
    const targetRoot = targetRoots?.[0];
    if (!targetRoot) {
      return { status: "error", message: `Unknown target ${targetId}` };
    }

    const repoUrl = normalizeRepo(request.repo);
    const tempBase = path.join(app.getPath("temp"), "skills-manager-");
    const checkoutDir = await fs.mkdtemp(tempBase);

    try {
      await runCommand("git", ["clone", "--depth", "1", repoUrl, checkoutDir]);
      const skillDirs = await findSkillDirs(checkoutDir);
      if (skillDirs.length === 0) {
        return { status: "error", message: "No SKILL.md files found in the repository." };
      }
      const filtered = request.skillName
        ? skillDirs.filter((candidate) => candidate.name.toLowerCase() === request.skillName?.toLowerCase())
        : skillDirs;
      const toInstall = filtered.length > 0 ? filtered : skillDirs;

      for (const candidate of toInstall) {
        const destination = path.join(targetRoot, path.basename(candidate.dir));
        await copyDir(candidate.dir, destination);
      }
      return { status: "ok", message: `Installed ${toInstall.length} skill(s) into ${targetRoot}.` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { status: "error", message };
    } finally {
      await fs.rm(checkoutDir, { recursive: true, force: true });
    }
  }
}
