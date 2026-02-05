import fs from "fs/promises";
import path from "path";
import { loadSkillRecord } from "./parser";
import { SkillEntry, SkillRecord, SkillTarget, TargetState } from "../shared/types";

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

function isPathUnderRoot(skillPath: string, root: string): boolean {
  const relative = path.relative(root, skillPath);
  return !!relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function collectSkillFilesFromRoot(root: string): Promise<string[]> {
  const skillFiles: string[] = [];
  if (!(await pathExists(root))) {
    return skillFiles;
  }

  const directSkill = path.join(root, "SKILL.md");
  if (await pathExists(directSkill)) {
    skillFiles.push(directSkill);
    return skillFiles;
  }

  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const skillFile = path.join(root, entry.name, "SKILL.md");
    if (await pathExists(skillFile)) {
      skillFiles.push(skillFile);
    }
  }

  return skillFiles;
}

interface RegistryOptions {
  extraRoots: string[];
  targets: SkillTarget[];
}

export class SkillRegistry {
  private targets: SkillTarget[] = [];
  private targetRoots: Map<string, string[]> = new Map();

  constructor(private options: RegistryOptions) {
    this.targets = options.targets.slice().sort((a, b) => a.priority - b.priority);
  }

  async refreshTargets(): Promise<void> {
    this.targetRoots.clear();
    for (const target of this.targets) {
      const roots = await target.getRoots();
      this.targetRoots.set(target.id, roots);
    }
  }

  getTargets(): SkillTarget[] {
    return this.targets;
  }

  getTargetRoots(): Map<string, string[]> {
    return this.targetRoots;
  }

  async listSkills(): Promise<SkillEntry[]> {
    await this.refreshTargets();
    const rootSet = new Set<string>();
    for (const roots of this.targetRoots.values()) {
      roots.forEach((root) => rootSet.add(root));
    }
    this.options.extraRoots.forEach((root) => rootSet.add(root));

    const skillMap = new Map<string, SkillRecord>();
    for (const root of rootSet) {
      const skillFiles = await collectSkillFilesFromRoot(root);
      for (const filePath of skillFiles) {
        const skillPath = path.dirname(filePath);
        if (!skillMap.has(skillPath)) {
          const record = await loadSkillRecord(filePath);
          record.sourceRoots.push(root);
          skillMap.set(skillPath, record);
        } else {
          const record = skillMap.get(skillPath);
          if (record) {
            record.sourceRoots.push(root);
          }
        }
      }
    }

    const entries: SkillEntry[] = [];
    for (const record of skillMap.values()) {
      const targets: TargetState[] = [];
      for (const target of this.targets) {
        const roots = this.targetRoots.get(target.id) ?? [];
        const isInstalled = roots.some((root) => isPathUnderRoot(record.path, root) || record.path === root);
        if (!isInstalled) {
          targets.push({
            targetId: target.id,
            targetLabel: target.label,
            status: "not-installed",
            managed: roots.some((root) => target.isManagedRoot(root)),
          });
          continue;
        }
        if (!target.supportsEnablement) {
          targets.push({
            targetId: target.id,
            targetLabel: target.label,
            status: "unsupported",
            managed: roots.some((root) => target.isManagedRoot(root)),
          });
          continue;
        }
        const status = await target.getEnablement(record);
        targets.push({
          targetId: target.id,
          targetLabel: target.label,
          status,
          managed: roots.some((root) => target.isManagedRoot(root)),
        });
      }
      entries.push({ ...record, targets });
    }

    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  async toggleSkillTarget(skill: SkillEntry, targetId: string): Promise<void> {
    const target = this.targets.find((item) => item.id === targetId);
    if (!target) {
      throw new Error(`Unknown target ${targetId}`);
    }
    if (!target.supportsEnablement) {
      throw new Error(`${target.label} does not support enablement yet.`);
    }
    const current = skill.targets.find((item) => item.targetId === targetId);
    if (!current || current.status === "not-installed") {
      throw new Error(`${target.label} does not have this skill installed.`);
    }

    const nextEnabled = current.status !== "enabled";
    await target.setEnablement(skill, nextEnabled);
  }
}
