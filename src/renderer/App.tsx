import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { AppSettings, InstallRequest, InstallResult, SkillEntry, TargetDescriptor, TargetState } from "@shared/types";

const emptySettings: AppSettings = {
  extraRoots: []
};

const targetStatusLabel: Record<TargetState["status"], string> = {
  enabled: "Enabled",
  disabled: "Disabled",
  "not-installed": "Not installed",
  unsupported: "Unsupported"
};

function summarizeTargets(skills: SkillEntry[], targets: SkillTarget[]) {
  return targets.map((target) => {
    const enabledSkills = skills.filter((skill) =>
      skill.targets.some((entry) => entry.targetId === target.id && entry.status === "enabled")
    );
    const metadataTokens = enabledSkills.reduce((sum, skill) => sum + skill.tokens.metadata, 0);
    return {
      target,
      enabledCount: enabledSkills.length,
      metadataTokens
    };
  });
}

export default function App() {
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [targets, setTargets] = useState<TargetDescriptor[]>([]);
  const [settings, setSettings] = useState<AppSettings>(emptySettings);
  const [installSource, setInstallSource] = useState<InstallRequest["source"]>("skills.sh");
  const [installRepo, setInstallRepo] = useState<string>("");
  const [installSkillName, setInstallSkillName] = useState<string>("");
  const [installTargetId, setInstallTargetId] = useState<string>("vscode");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);

  const refresh = useCallback(async () => {
    const [skillsData, targetData, settingsData] = await Promise.all([
      window.skillsApi.listSkills(),
      window.skillsApi.listTargets(),
      window.skillsApi.getSettings()
    ]);
    setSkills(skillsData);
    setTargets(targetData);
    setSettings(settingsData);
    if (settingsData.defaultInstallTarget) {
      setInstallTargetId(settingsData.defaultInstallTarget);
    } else if (targetData[0]) {
      setInstallTargetId(targetData[0].id);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const targetSummaries = useMemo(() => summarizeTargets(skills, targets), [skills, targets]);

  const handleToggle = async (skillId: string, targetId: string) => {
    setBusy(true);
    try {
      await window.skillsApi.toggleSkillTarget(skillId, targetId);
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(message);
    } finally {
      setBusy(false);
    }
  };

  const handleInstall = async () => {
    if (!installRepo.trim()) {
      setStatusMessage("Paste a GitHub repo (owner/name or full URL).");
      return;
    }
    setBusy(true);
    setStatusMessage("");
    const request: InstallRequest = {
      source: installSource,
      repo: installRepo.trim(),
      skillName: installSkillName.trim() || undefined,
      targetId: installTargetId
    };
    const result: InstallResult = await window.skillsApi.installSkill(request);
    setStatusMessage(result.message);
    setBusy(false);
    await refresh();
  };

  const handleSettingsUpdate = async (partial: Partial<AppSettings>) => {
    const next = await window.skillsApi.updateSettings(partial);
    setSettings(next);
  };

  return (
    <div className="app-shell">
      <header className="app-hero">
        <div>
          <p className="eyebrow">Skills Manager</p>
          <h1>One control room for every IDE skill.</h1>
          <p className="subtitle">
            Manage installs, enablement, and context weight across VS Code, OpenCode, Codex, and more.
          </p>
        </div>
        <div className="summary-grid">
          {targetSummaries.map((summary) => (
            <div key={summary.target.id} className="summary-card">
              <p className="summary-title">{summary.target.label}</p>
              <p className="summary-value">{summary.enabledCount} enabled</p>
              <p className="summary-detail">~{summary.metadataTokens} metadata tokens</p>
            </div>
          ))}
        </div>
      </header>

      <section className="content-grid">
        <aside className="panel install-panel">
          <h2>Install a Skill</h2>
          <label className="field">
            <span>Source</span>
            <select value={installSource} onChange={(event) => setInstallSource(event.target.value as InstallRequest["source"])}>
              <option value="skills.sh">skills.sh</option>
              <option value="skillsmp">SkillsMP</option>
            </select>
          </label>
          <label className="field">
            <span>Repo</span>
            <input
              value={installRepo}
              onChange={(event) => setInstallRepo(event.target.value)}
              placeholder="owner/repo or https://github.com/owner/repo"
            />
          </label>
          <label className="field">
            <span>Skill Name (optional)</span>
            <input
              value={installSkillName}
              onChange={(event) => setInstallSkillName(event.target.value)}
              placeholder="Use when a repo contains multiple skills"
            />
          </label>
          <label className="field">
            <span>Target IDE</span>
            <select value={installTargetId} onChange={(event) => setInstallTargetId(event.target.value)}>
              {targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.label}
                </option>
              ))}
            </select>
          </label>
          <button className="primary" onClick={handleInstall} disabled={busy}>
            {busy ? "Working..." : "Install Skill"}
          </button>
          {statusMessage && <p className="status">{statusMessage}</p>}

          <div className="panel-divider" />

          <h3>App Settings</h3>
          <label className="field">
            <span>SkillsMP API Key</span>
            <input
              value={settings.skillsmpApiKey ?? ""}
              onChange={(event) => handleSettingsUpdate({ skillsmpApiKey: event.target.value })}
              placeholder="Optional"
            />
          </label>
          <label className="field">
            <span>Extra Skill Roots</span>
            <textarea
              value={settings.extraRoots.join("\n")}
              onChange={(event) => handleSettingsUpdate({ extraRoots: event.target.value.split(/\r?\n/).filter(Boolean) })}
              placeholder="One path per line"
              rows={4}
            />
          </label>
        </aside>

        <main className="panel skills-panel">
          <div className="panel-header">
            <h2>Skills Catalog</h2>
            <p>{skills.length} detected</p>
          </div>
          <div className="skills-grid">
            {skills.map((skill) => (
              <div key={skill.id} className="skill-card">
                <div className="skill-header">
                  <div>
                    <h3>{skill.name}</h3>
                    <p className="skill-desc">{skill.description || "No description"}</p>
                  </div>
                  <div className="token-pill">
                    <span>Meta ~{skill.tokens.metadata}</span>
                    <span>Full ~{skill.tokens.full}</span>
                  </div>
                </div>
                <p className="skill-path">{skill.path}</p>
                <div className="target-grid">
                  {skill.targets.map((target) => (
                    <button
                      key={`${skill.id}-${target.targetId}`}
                      className={`target-chip ${target.status}`}
                      disabled={busy || target.status === "not-installed" || target.status === "unsupported"}
                      onClick={() => handleToggle(skill.id, target.targetId)}
                    >
                      <div>
                        <span className="chip-title">{target.targetLabel}</span>
                        <span className="chip-status">{targetStatusLabel[target.status]}</span>
                      </div>
                      <span className="chip-action">
                        {target.status === "enabled" ? "Disable" : target.status === "disabled" ? "Enable" : ""}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </main>
      </section>
    </div>
  );
}
