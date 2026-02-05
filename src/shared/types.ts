export type EnablementStatus = "enabled" | "disabled" | "not-installed" | "unsupported";

export interface TokenEstimate {
  metadata: number;
  full: number;
}

export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  path: string;
  sourceRoots: string[];
  tokens: TokenEstimate;
}

export interface TargetState {
  targetId: string;
  targetLabel: string;
  status: EnablementStatus;
  managed: boolean;
}

export interface SkillEntry extends SkillRecord {
  targets: TargetState[];
}

export interface TargetDescriptor {
  id: string;
  label: string;
  priority: number;
  supportsEnablement: boolean;
}

export interface SkillTarget extends TargetDescriptor {
  id: string;
  label: string;
  priority: number;
  supportsEnablement: boolean;
  getRoots(): Promise<string[]>;
  getEnablement(skill: SkillRecord): Promise<EnablementStatus>;
  setEnablement(skill: SkillRecord, enabled: boolean): Promise<void>;
  isManagedRoot(root: string): boolean;
}

export interface InstallRequest {
  source: "skills.sh" | "skillsmp";
  repo: string;
  skillName?: string;
  targetId?: string;
}

export interface InstallResult {
  status: "ok" | "error";
  message: string;
}

export interface AppSettings {
  skillsmpApiKey?: string;
  extraRoots: string[];
  opencodeConfigPath?: string;
  defaultInstallTarget?: string;
}
