import type { SkillsApi } from "../preload";

declare global {
  interface Window {
    skillsApi: SkillsApi;
  }
}

export {};
