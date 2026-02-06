import { spawn } from "child_process";
import { app } from "electron";
import fs from "fs/promises";
import path from "path";
import {
  AppSettings,
  DeleteResult,
  InstallProgress,
  InstallRequest,
  InstallResult,
  PopularSkill,
  PopularSkillsResult,
  SkillEntry,
  SkillTarget,
  SkillsMpSearchResult,
  TargetDescriptor
} from "../shared/types";
import { parseSkillFile } from "../skills/parser";
import { SkillRegistry } from "../skills/registry";
import { createClaudeTarget } from "../skills/targets/claude";
import { createCodexTarget } from "../skills/targets/codex";
import { createOpencodeTarget } from "../skills/targets/opencode";
import { createVsCodeTarget } from "../skills/targets/vscode";
import { SettingsStore } from "./settingsStore";

interface SkillCandidate {
  dir: string;
  name: string;
}

function normalizeRepo(repo: string): string {
  const trimmed = repo.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      if (url.hostname === "github.com") {
        const parts = url.pathname.split("/").filter(Boolean);
        if (parts.length >= 2) {
          const owner = parts[0];
          const name = parts[1].replace(/\.git$/, "");
          return `https://github.com/${owner}/${name}.git`;
        }
      }
    } catch {
      // fall through
    }
    return trimmed;
  }
  if (trimmed.startsWith("git@")) {
    return trimmed;
  }
  return `https://github.com/${trimmed}.git`;
}

async function runCommand(
  command: string,
  args: string[],
  cwd?: string,
  onOutput?: (line: string) => void
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const handleChunk = (chunk: Buffer, source: "stdout" | "stderr") => {
      const text = chunk.toString("utf8");
      const lines = text.split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        onOutput?.(`[${source}] ${line}`);
      }
    };

    child.stdout?.on("data", (chunk: Buffer) => handleChunk(chunk, "stdout"));
    child.stderr?.on("data", (chunk: Buffer) => handleChunk(chunk, "stderr"));

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

async function findSkillDirs(root: string, onLog?: (message: string) => void): Promise<SkillCandidate[]> {
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
        try {
          const parsed = await parseSkillFile(fullPath);
          results.push({ dir: path.dirname(fullPath), name: parsed.name });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          onLog?.(`Failed to parse ${fullPath}: ${message}`);
        }
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

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function fetchText(url: string, headers?: Record<string, string>): Promise<string> {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function fetchJsonWithError<T>(
  url: string,
  headers?: Record<string, string>
): Promise<{ data: T | null; error?: string }> {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    let errorMessage = `${response.status} ${response.statusText}`;
    try {
      const raw = await response.text();
      if (raw) {
        const parsed = JSON.parse(raw) as { error?: { code?: string; message?: string } };
        if (parsed?.error?.message) {
          errorMessage = parsed.error.code
            ? `${parsed.error.code}: ${parsed.error.message}`
            : parsed.error.message;
        }
      }
    } catch {
      // keep default error message
    }
    return { data: null, error: errorMessage };
  }
  try {
    const parsed = (await response.json()) as T;
    return { data: parsed };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { data: null, error: `Invalid JSON response: ${message}` };
  }
}

function parseSkillsShTop(html: string): PopularSkill[] {
  const results: PopularSkill[] = [];
  const seen = new Set<string>();

  const anchorRegex = /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
  let match: RegExpExecArray | null = null;
  while ((match = anchorRegex.exec(html)) !== null) {
    const text = match[2].trim().replace(/\s+/g, " ");
    const parts = text.split(" ");
    if (parts.length >= 3 && /^\d+$/.test(parts[0])) {
      const name = parts[1];
      const repo = parts[2];
      const installs = parts[3];
      const key = `${repo}:${name}`;
      if (!seen.has(key)) {
        results.push({ name, repo, installs, source: "skills.sh" });
        seen.add(key);
      }
    }
  }

  if (results.length >= 5) {
    return results.slice(0, 5);
  }

  const urlRegex = /href="(?:https:\/\/skills\.sh|\/)([^\/\s"]+)\/([^\/\s"]+)\/([^\/\s"]+)"/g;
  while ((match = urlRegex.exec(html)) !== null) {
    const owner = match[1];
    const repo = match[2];
    const skill = match[3];
    if (!owner || !repo || !skill) {
      continue;
    }
    const key = `${owner}/${repo}:${skill}`;
    if (!seen.has(key)) {
      results.push({
        name: skill,
        repo: `${owner}/${repo}`,
        source: "skills.sh"
      });
      seen.add(key);
    }
    if (results.length >= 5) {
      break;
    }
  }

  return results.slice(0, 5);
}

function normalizeSkillsMpSkill(entry: Record<string, unknown>): PopularSkill | null {
  const github = (entry as { github?: Record<string, unknown> }).github;
  const rawName = (entry.name || entry.title || entry.skill || entry.slug) as string | undefined;
  const rawRepo =
    (entry.repo ||
      entry.repository ||
      entry.repoUrl ||
      entry.repoURL ||
      entry.githubUrl ||
      entry.githubURL ||
      entry.url ||
      entry.githubRepo ||
      entry.full_name ||
      entry.fullName ||
      github?.repo ||
      github?.full_name ||
      github?.fullName) as string | undefined;
  const name = rawName ?? (typeof rawRepo === "string" ? rawRepo.split("/").pop() : undefined);
  if (!name) {
    return null;
  }
  const repo = rawRepo ? normalizeRepo(rawRepo) : "";
  const stars =
    typeof entry.stars === "number"
      ? entry.stars
      : typeof entry.stars === "string"
        ? Number(entry.stars)
        : undefined;
  const installs =
    typeof entry.installs === "number"
      ? entry.installs
      : typeof entry.installs === "string"
        ? Number(entry.installs)
        : undefined;
  const installsLabel =
    typeof stars === "number"
      ? `${stars} stars`
      : typeof installs === "number"
        ? `${installs} installs`
        : undefined;
  return {
    name,
    repo,
    installs: installsLabel,
    source: "skillsmp"
  };
}

function extractSkillsList(payload: Record<string, unknown>): Record<string, unknown>[] | null {
  const direct = payload.data || payload.skills || payload.results || payload;
  if (Array.isArray(direct)) {
    return direct as Record<string, unknown>[];
  }
  if (direct && typeof direct === "object") {
    const nested =
      (direct as Record<string, unknown>).items ||
      (direct as Record<string, unknown>).results ||
      (direct as Record<string, unknown>).skills ||
      (direct as Record<string, unknown>).data;
    if (Array.isArray(nested)) {
      return nested as Record<string, unknown>[];
    }
  }
  return null;
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

  private buildTargets(settings?: AppSettings): SkillTarget[] {
    return [
      createVsCodeTarget({
        managedRoot: this.settingsStore.getManagedRoot("vscode"),
        copilotRoot: settings?.vscodeCopilotRoot
      }),
      createOpencodeTarget({ workspaceFolders: this.workspaceFolders }),
      createCodexTarget({ workspaceFolders: this.workspaceFolders }),
      createClaudeTarget({ workspaceFolders: this.workspaceFolders })
    ];
  }

  async refreshRegistry(): Promise<void> {
    const settings = await this.settingsStore.getSettings();
    this.targets = this.buildTargets(settings);
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
    const targetState = skill.targets.find((item) => item.targetId === targetId);
    if (targetState?.status === "not-installed") {
      const target = this.targets.find((item) => item.id === targetId);
      if (!target) {
        throw new Error("Target not found");
      }
      const roots = await target.getRoots();
      const managedRoot = roots.find((root) => target.isManagedRoot(root)) ?? roots[0];
      if (!managedRoot) {
        throw new Error("No managed root available for this target.");
      }
      const destination = path.join(managedRoot, path.basename(skill.path));
      if (!(await pathExists(destination))) {
        await copyDir(skill.path, destination);
      }
      await target.setEnablement({ ...skill, path: destination }, true);
      return;
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
    return this.installSkillWithProgress(request);
  }

  async installSkillWithProgress(
    request: InstallRequest,
    onProgress?: (progress: InstallProgress) => void
  ): Promise<InstallResult> {
    const emit = (stage: InstallProgress["stage"], message: string) => {
      onProgress?.({ stage, message });
    };

    emit("start", "Starting install");
    const settings = await this.settingsStore.getSettings();
    const targetId = request.targetId ?? settings.defaultInstallTarget ?? "vscode";
    const targetRoots = await this.targets.find((item) => item.id === targetId)?.getRoots();
    const targetRoot = targetRoots?.[0];
    if (!targetRoot) {
      emit("error", `Unknown target ${targetId}`);
      return { status: "error", message: `Unknown target ${targetId}` };
    }

    const repoUrl = normalizeRepo(request.repo);
    const tempBase = path.join(app.getPath("temp"), "skills-manager-");
    const checkoutDir = await fs.mkdtemp(tempBase);

    try {
      emit("clone", "Cloning repository");
      await runCommand("git", ["clone", "--depth", "1", repoUrl, checkoutDir], undefined, (line) => {
        emit("output", line);
      });
      emit("scan", "Scanning for skills");
      const skillDirs = await findSkillDirs(checkoutDir, (message) => emit("output", message));
      if (skillDirs.length === 0) {
        emit("error", "No SKILL.md files found in the repository.");
        return { status: "error", message: "No SKILL.md files found in the repository." };
      }
      const filtered = request.skillName
        ? skillDirs.filter((candidate) => candidate.name.toLowerCase() === request.skillName?.toLowerCase())
        : skillDirs;
      const toInstall = filtered.length > 0 ? filtered : skillDirs;

      emit("copy", `Copying ${toInstall.length} skill(s) into target`);
      for (const candidate of toInstall) {
        const destination = path.join(targetRoot, path.basename(candidate.dir));
        if (await pathExists(destination)) {
          emit("error", `Skill already exists at ${destination}`);
          return { status: "error", message: `Skill already exists at ${destination}` };
        }
        await copyDir(candidate.dir, destination);
      }
      if (targetId === "vscode" && settings.vscodeCopilotRoot) {
        for (const candidate of toInstall) {
          const skillName = path.basename(candidate.dir);
          const sourcePath = path.join(targetRoot, skillName);
          const linkPath = path.join(settings.vscodeCopilotRoot, skillName);
          await fs.mkdir(settings.vscodeCopilotRoot, { recursive: true });
          try {
            await fs.rm(linkPath, { recursive: true, force: true });
          } catch {
            // ignore link cleanup failure
          }
          await copyDir(sourcePath, linkPath);
        }
      }
      emit("done", `Installed ${toInstall.length} skill(s) into ${targetRoot}.`);
      return { status: "ok", message: `Installed ${toInstall.length} skill(s) into ${targetRoot}.` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emit("error", message);
      return { status: "error", message };
    } finally {
      emit("cleanup", "Cleaning up");
      await fs.rm(checkoutDir, { recursive: true, force: true });
    }
  }

  async listPopularSkills(): Promise<PopularSkillsResult> {
    const warnings: PopularSkillsResult["warnings"] = {};
    const settings = await this.settingsStore.getSettings();
    const skills: PopularSkill[] = [];

    try {
      const html = await fetchText("https://skills.sh/");
      const topSkills = parseSkillsShTop(html);
      if (topSkills.length === 0) {
        warnings["skills.sh"] = "No skills found on skills.sh.";
      }
      skills.push(...topSkills);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings["skills.sh"] = message;
    }

    const headers: Record<string, string> = {};
    const apiKey = process.env.SKILLSMP_API_KEY ?? settings.skillsmpApiKey;
    if (!apiKey) {
      warnings.skillsmp = "Missing SkillsMP API key. Set SKILLSMP_API_KEY or add one in settings.";
    } else {
      headers.Authorization = `Bearer ${apiKey}`;
      headers.Accept = "application/json";
    }

    const skillsMpQueries = ["agent", "automation", "developer"];
    const skillsMpUrls = skillsMpQueries.map(
      (query) => `https://skillsmp.com/api/v1/skills/search?q=${encodeURIComponent(query)}&limit=5&sortBy=stars`
    );

    let skillsMpLoaded = false;
    let skillsMpError: string | undefined;
    if (!apiKey) {
      return { skills, warnings };
    }
    for (const url of skillsMpUrls) {
      try {
        const { data, error } = await fetchJsonWithError<Record<string, unknown>>(url, headers);
        if (error) {
          skillsMpError = error;
          continue;
        }
        if (!data) {
          continue;
        }
        if (data.success === false && typeof data.error === "object") {
          const err = data.error as { code?: string; message?: string };
          skillsMpError = err.code ? `${err.code}: ${err.message ?? "Request failed"}` : err.message ?? "Request failed";
          continue;
        }
        const list = extractSkillsList(data);
        if (!list) {
          if (!skillsMpError) {
            skillsMpError = `Unexpected response shape. Keys: ${Object.keys(data).slice(0, 6).join(", ")}`;
          }
          continue;
        }
        const normalized = list
          .map((entry) => normalizeSkillsMpSkill(entry))
          .filter((entry): entry is PopularSkill => Boolean(entry));
        if (normalized.length === 0) {
          if (!skillsMpError) {
            skillsMpError = "No skills returned by SkillsMP. Try a different search query.";
          }
          continue;
        }
        skills.push(...normalized.slice(0, 5));
        skillsMpLoaded = true;
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        skillsMpError = message;
      }
    }

    if (!skillsMpLoaded) {
      warnings.skillsmp = skillsMpError
        ? `Unable to load SkillsMP. ${skillsMpError}`
        : "Unable to load SkillsMP. Check connectivity or add an API key in settings to expand access.";
    }

    return { skills, warnings };
  }

  async deleteSkillAll(skillId: string): Promise<DeleteResult> {
    await this.refreshRegistry();
    const skills = await this.registry.listSkills();
    const skill = skills.find((item) => item.id === skillId);
    if (!skill) {
      return { status: "error", message: "Skill not found." };
    }

    const settings = await this.settingsStore.getSettings();
    const skillName = path.basename(skill.path);

    for (const target of this.targets) {
      const roots = await target.getRoots();
      for (const root of roots) {
        const activePath = path.join(root, skillName);
        const disabledPath = path.join(root, ".disabled", skillName);
        if (await pathExists(activePath)) {
          await fs.rm(activePath, { recursive: true, force: true });
        }
        if (await pathExists(disabledPath)) {
          await fs.rm(disabledPath, { recursive: true, force: true });
        }
      }
    }

    if (settings.vscodeCopilotRoot) {
      const linkPath = path.join(settings.vscodeCopilotRoot, skillName);
      await fs.rm(linkPath, { recursive: true, force: true });
    }

    return { status: "ok", message: `Deleted ${skill.name} from all IDE roots.` };
  }

  async searchSkillsMp(query: string, onDebug?: (message: string) => void): Promise<SkillsMpSearchResult> {
    const debug = (message: string) => {
      onDebug?.(message);
      console.info(`[skillsmp] ${message}`);
    };
    const trimmed = query.trim();
    if (!trimmed) {
      debug("Search aborted: empty query.");
      return { skills: [], warning: "Enter a search term to query SkillsMP." };
    }
    const settings = await this.settingsStore.getSettings();
    const apiKey = process.env.SKILLSMP_API_KEY ?? settings.skillsmpApiKey;
    if (!apiKey) {
      debug("Search aborted: missing API key.");
      return { skills: [], warning: "Missing SkillsMP API key. Set SKILLSMP_API_KEY or add one in settings." };
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json"
    };
    const url = `https://skillsmp.com/api/v1/skills/search?q=${encodeURIComponent(trimmed)}&limit=20&sortBy=stars`;
    debug(`Requesting ${url}`);
    const { data, error } = await fetchJsonWithError<Record<string, unknown>>(url, headers);
    if (error || !data) {
      debug(`Request failed: ${error ?? "empty response"}`);
      return { skills: [], warning: error ?? "Unable to load SkillsMP results." };
    }
    debug(`Response keys: ${Object.keys(data).slice(0, 8).join(", ") || "none"}`);
    debug(`Response preview: ${JSON.stringify(data).slice(0, 1200)}`);
    const list = extractSkillsList(data);
    if (!list) {
      debug("Unexpected response shape (list is not an array).");
      return { skills: [], warning: "Unexpected SkillsMP response." };
    }
    const normalized = list
      .map((entry) => normalizeSkillsMpSkill(entry))
      .filter((entry): entry is PopularSkill => Boolean(entry))
      .slice(0, 20);
    debug(`Parsed ${normalized.length} skills from response.`);
    return { skills: normalized };
  }
}
