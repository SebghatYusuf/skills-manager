import path from "path";
import os from "os";
import fs from "fs/promises";
import { EnablementStatus, SkillRecord, SkillTarget } from "../../shared/types";

export function createClaudeTarget(options: { workspaceFolders: string[] }): SkillTarget {
  const homeRoot = path.join(os.homedir(), ".claude", "skills");
  const workspaceRoots = options.workspaceFolders.map((folder) => path.join(folder, ".claude", "skills"));
  const roots = [homeRoot, ...workspaceRoots];

  const getDisabledRoot = (root: string) => path.join(root, ".disabled");

  const isUnderRoot = (skillPath: string, root: string): boolean => {
    const relative = path.relative(root, skillPath);
    return !!relative && !relative.startsWith("..") && !path.isAbsolute(relative);
  };

  const ensureDir = async (targetPath: string): Promise<void> => {
    await fs.mkdir(targetPath, { recursive: true });
  };

  const moveSkill = async (fromPath: string, toPath: string): Promise<void> => {
    await ensureDir(path.dirname(toPath));
    try {
      await fs.rm(toPath, { recursive: true, force: true });
    } catch {
      // ignore cleanup failure
    }
    await fs.rename(fromPath, toPath);
  };

  const pathExists = async (candidate: string): Promise<boolean> => {
    try {
      await fs.access(candidate);
      return true;
    } catch {
      return false;
    }
  };

  return {
    id: "claude",
    label: "Claude Code",
    priority: 9,
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
      const root = roots.find(
        (candidate) =>
          isUnderRoot(skill.path, candidate) || isUnderRoot(skill.path, getDisabledRoot(candidate))
      );
      if (!root) {
        throw new Error("Skill is not installed in the Claude Code root.");
      }
      const skillName = path.basename(skill.path);
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
      return root === homeRoot;
    }
  } satisfies SkillTarget;
}
