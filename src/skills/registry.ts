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
  const scanDirs: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    scanDirs.push(path.join(root, entry.name));
    if (entry.name === ".disabled") {
      const disabledEntries = await fs.readdir(path.join(root, entry.name), { withFileTypes: true });
      for (const disabledEntry of disabledEntries) {
        if (!disabledEntry.isDirectory()) {
          continue;
        }
        scanDirs.push(path.join(root, entry.name, disabledEntry.name));
      }
    }
  }

  for (const dir of scanDirs) {
    const skillFile = path.join(dir, "SKILL.md");
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

interface SkillEntryCandidate {
  record: SkillRecord;
  entries: { path: string; root: string }[];
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

    const skillMap = new Map<string, SkillEntryCandidate>();
    for (const root of rootSet) {
      const skillFiles = await collectSkillFilesFromRoot(root);
      for (const filePath of skillFiles) {
        const skillPath = path.dirname(filePath);
        const record = await loadSkillRecord(filePath);
        const key = record.name.toLowerCase();
        const existing = skillMap.get(key);
        if (!existing) {
          record.sourceRoots.push(root);
          skillMap.set(key, { record, entries: [{ path: skillPath, root }] });
        } else {
          existing.record.sourceRoots.push(root);
          existing.entries.push({ path: skillPath, root });
        }
      }
    }

    const entries: SkillEntry[] = [];
    for (const candidate of skillMap.values()) {
      const record = candidate.record;
      const targets: TargetState[] = [];
      for (const target of this.targets) {
        const roots = this.targetRoots.get(target.id) ?? [];
        const match = candidate.entries.find((entry) => roots.some((root) => isPathUnderRoot(entry.path, root) || entry.path === root));
        const isInstalled = Boolean(match);
        if (!isInstalled) {
          targets.push({
            targetId: target.id,
            targetLabel: target.label,
            status: "not-installed",
            managed: roots.some((root) => target.isManagedRoot(root))
          });
          continue;
        }
        if (!target.supportsEnablement) {
          targets.push({
            targetId: target.id,
            targetLabel: target.label,
            status: "unsupported",
            managed: roots.some((root) => target.isManagedRoot(root)),
            path: match?.path
          });
          continue;
        }
        const status = await target.getEnablement({ ...record, path: match?.path ?? record.path });
        targets.push({
          targetId: target.id,
          targetLabel: target.label,
          status,
          managed: roots.some((root) => target.isManagedRoot(root)),
          path: match?.path
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
    const skillForTarget = current.path ? { ...skill, path: current.path } : skill;
    await target.setEnablement(skillForTarget, nextEnabled);
  }
}
