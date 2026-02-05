import fs from "fs/promises";
import path from "path";
import { EnablementStatus, SkillRecord, SkillTarget } from "../../shared/types";

function isUnderRoot(skillPath: string, root: string): boolean {
  const relative = path.relative(root, skillPath);
  return !!relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function getDisabledRoot(root: string): string {
  return path.join(root, ".disabled");
}

async function ensureDir(targetPath: string): Promise<void> {
  await fs.mkdir(targetPath, { recursive: true });
}

async function moveSkill(fromPath: string, toPath: string): Promise<void> {
  await ensureDir(path.dirname(toPath));
  await fs.rename(fromPath, toPath);
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

export function createVsCodeTarget(options: { managedRoot: string }): SkillTarget {
  const roots = [options.managedRoot];

  return {
    id: "vscode",
    label: "VS Code",
    priority: 1,
    supportsEnablement: true,
    async getRoots(): Promise<string[]> {
      return roots;
    },
    async getEnablement(skill: SkillRecord): Promise<EnablementStatus> {
      const root = roots.find((candidate) => isUnderRoot(skill.path, candidate));
      if (!root) {
        return "not-installed";
      }
      const disabledRoot = getDisabledRoot(root);
      if (isUnderRoot(skill.path, disabledRoot)) {
        return "disabled";
      }
      return "enabled";
    },
    async setEnablement(skill: SkillRecord, enabled: boolean): Promise<void> {
      const root = roots.find((candidate) => isUnderRoot(skill.path, candidate) || isUnderRoot(skill.path, getDisabledRoot(candidate)));
      if (!root) {
        throw new Error("Skill is not installed in the VS Code managed root.");
      }
      const disabledRoot = getDisabledRoot(root);
      const skillName = path.basename(skill.path);

      if (enabled) {
        const fromPath = path.join(disabledRoot, skillName);
        const toPath = path.join(root, skillName);
        if (await pathExists(fromPath)) {
          await moveSkill(fromPath, toPath);
        }
      } else {
        const fromPath = path.join(root, skillName);
        const toPath = path.join(disabledRoot, skillName);
        if (await pathExists(fromPath)) {
          await moveSkill(fromPath, toPath);
        }
      }
    },
    isManagedRoot(root: string): boolean {
      return root === options.managedRoot;
    }
  } satisfies SkillTarget;
}
