import fs from "fs/promises";
import path from "path";
import os from "os";
import TOML from "@iarna/toml";
import { EnablementStatus, SkillRecord, SkillTarget } from "../../shared/types";

interface CodexConfigEntry {
  path?: string;
  enabled?: boolean;
}

interface CodexConfig {
  skills?: {
    config?: CodexConfigEntry[];
  };
}

const CONFIG_DIR = path.join(os.homedir(), ".codex");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.toml");

async function readConfig(): Promise<CodexConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    return (TOML.parse(raw) as CodexConfig) ?? {};
  } catch {
    return {};
  }
}

async function writeConfig(config: CodexConfig): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  const serialized = TOML.stringify(config as TOML.JsonMap);
  await fs.writeFile(CONFIG_PATH, serialized, "utf8");
}

function normalizeSkillPath(skillPath: string): string {
  return path.resolve(skillPath);
}

export function createCodexTarget(options: { workspaceFolders: string[] }): SkillTarget {
  const homeRoot = path.join(os.homedir(), ".codex", "skills");
  const systemRoot = path.join(path.sep, "etc", "codex", "skills");
  const workspaceRoots = options.workspaceFolders.flatMap((folder) => [
    path.join(folder, ".codex", "skills"),
    path.join(folder, "..", ".codex", "skills")
  ]);
  const roots = [homeRoot, systemRoot, ...workspaceRoots];

  return {
    id: "codex",
    label: "Codex",
    priority: 3,
    supportsEnablement: true,
    async getRoots(): Promise<string[]> {
      return roots;
    },
    async getEnablement(skill: SkillRecord): Promise<EnablementStatus> {
      const config = await readConfig();
      const entries = config.skills?.config ?? [];
      const normalized = normalizeSkillPath(skill.path);
      const match = entries.find((entry) => entry.path && normalizeSkillPath(entry.path) === normalized);
      if (!match) {
        return "enabled";
      }
      return match.enabled === false ? "disabled" : "enabled";
    },
    async setEnablement(skill: SkillRecord, enabled: boolean): Promise<void> {
      const config = await readConfig();
      const entries = config.skills?.config ? [...config.skills.config] : [];
      const normalized = normalizeSkillPath(skill.path);
      const filtered = entries.filter((entry) => !entry.path || normalizeSkillPath(entry.path) !== normalized);
      if (!enabled) {
        filtered.push({ path: skill.path, enabled: false });
      }
      config.skills = config.skills ?? {};
      config.skills.config = filtered;
      await writeConfig(config);
    },
    isManagedRoot(root: string): boolean {
      return root === homeRoot;
    }
  } satisfies SkillTarget;
}
