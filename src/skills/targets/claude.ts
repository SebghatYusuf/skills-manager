import path from "path";
import os from "os";
import { EnablementStatus, SkillRecord, SkillTarget } from "../../shared/types";

export function createClaudeTarget(options: { workspaceFolders: string[] }): SkillTarget {
  const homeRoot = path.join(os.homedir(), ".claude", "skills");
  const workspaceRoots = options.workspaceFolders.map((folder) => path.join(folder, ".claude", "skills"));
  const roots = [homeRoot, ...workspaceRoots];

  return {
    id: "claude",
    label: "Claude Code",
    priority: 9,
    supportsEnablement: false,
    async getRoots(): Promise<string[]> {
      return roots;
    },
    async getEnablement(_skill: SkillRecord): Promise<EnablementStatus> {
      return "unsupported";
    },
    async setEnablement(): Promise<void> {
      throw new Error("Enablement for Claude Code skills is not supported yet.");
    },
    isManagedRoot(root: string): boolean {
      return root === homeRoot;
    }
  } satisfies SkillTarget;
}
