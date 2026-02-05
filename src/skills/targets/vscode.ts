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
  try {
    await fs.rm(toPath, { recursive: true, force: true });
  } catch {
    // ignore cleanup failure
  }
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

async function readSymlinkTarget(linkPath: string): Promise<string | null> {
  try {
    const stat = await fs.lstat(linkPath);
    if (!stat.isSymbolicLink()) {
      return null;
    }
    return await fs.readlink(linkPath);
  } catch {
    return null;
  }
}

export function createVsCodeTarget(options: { managedRoot: string; copilotRoot?: string }): SkillTarget {
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
      if (options.copilotRoot) {
        const linkPath = path.join(options.copilotRoot, path.basename(skill.path));
        const target = await readSymlinkTarget(linkPath);
        return target ? "enabled" : "disabled";
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
      const skillName = path.basename(skill.path);

      if (options.copilotRoot) {
        const linkPath = path.join(options.copilotRoot, skillName);
        if (enabled) {
          await ensureDir(options.copilotRoot);
          await fs.rm(linkPath, { recursive: true, force: true });
          await fs.symlink(path.join(root, skillName), linkPath, "dir");
        } else {
          await fs.rm(linkPath, { recursive: true, force: true });
        }
        return;
      }

      const disabledRoot = getDisabledRoot(root);
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
