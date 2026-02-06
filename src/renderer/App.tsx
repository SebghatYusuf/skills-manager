import React, { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AppSettings,
  DebugLogEntry,
  DeleteResult,
  InstallProgress,
  InstallRequest,
  InstallResult,
  PopularSkill,
  PopularSkillsResult,
  SkillsMpSearchResult,
  SkillEntry,
  TargetDescriptor,
  TargetState
} from "@shared/types";

const emptySettings: AppSettings = {
  extraRoots: []
};

const emptyPopular: PopularSkillsResult = {
  skills: [],
  warnings: {}
};

const targetStatusLabel: Record<TargetState["status"], string> = {
  enabled: "Enabled",
  disabled: "Disabled",
  "not-installed": "Not installed",
  unsupported: "Unsupported"
};

const stripGithubRepo = (repo?: string): string => {
  if (!repo) {
    return "Repo not provided";
  }
  return repo.replace(/^https?:\/\/github\.com\//, "");
};

const ideMetaById: Record<
  string,
  { short: string; className: string; iconLight: string; iconDark?: string; alt: string }
> = {
  vscode: {
    short: "VS",
    className: "ide-vscode",
    iconLight: "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/visual-studio-code.svg",
    alt: "Visual Studio Code"
  },
  opencode: {
    short: "OC",
    className: "ide-opencode",
    iconLight: "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/opencode-light.svg",
    iconDark: "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/opencode-dark.svg",
    alt: "OpenCode"
  },
  codex: {
    short: "CX",
    className: "ide-codex",
    iconDark: "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/openai-light.svg",
    iconLight: "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/openai.svg",
    alt: "Codex"
  },
  claude: {
    short: "CC",
    className: "ide-claude",
    iconLight: "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/claude-ai.svg",
    alt: "Claude"
  }
};

function summarizeTargets(skills: SkillEntry[], targets: TargetDescriptor[]) {
  return targets.map((target) => {
    const enabledSkills = skills.filter((skill) =>
      skill.targets.some((entry) => entry.targetId === target.id && entry.status === "enabled")
    );
    const metadataTokens = enabledSkills.reduce((sum, skill) => sum + skill.tokens.metadata, 0);
    const fullTokens = enabledSkills.reduce((sum, skill) => sum + skill.tokens.full, 0);
    return {
      target,
      enabledCount: enabledSkills.length,
      metadataTokens,
      fullTokens
    };
  });
}

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [targets, setTargets] = useState<TargetDescriptor[]>([]);
  const [settings, setSettings] = useState<AppSettings>(emptySettings);
  const [popularSkills, setPopularSkills] = useState<PopularSkillsResult>(emptyPopular);
  const [popularLoading, setPopularLoading] = useState<boolean>(false);
  const [installSource, setInstallSource] = useState<InstallRequest["source"]>("skills.sh");
  const [installRepo, setInstallRepo] = useState<string>("");
  const [installSkillName, setInstallSkillName] = useState<string>("");
  const [installTargetId, setInstallTargetId] = useState<string>("vscode");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [installLog, setInstallLog] = useState<InstallProgress[]>([]);
  const [installStage, setInstallStage] = useState<InstallProgress["stage"] | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"discover" | "catalog" | "activity" | "settings">("discover");
  const [activeSkill, setActiveSkill] = useState<SkillEntry | null>(null);
  const [skillsMpQuery, setSkillsMpQuery] = useState<string>("");
  const [skillsMpResults, setSkillsMpResults] = useState<SkillsMpSearchResult>({ skills: [] });
  const [skillsMpLoading, setSkillsMpLoading] = useState<boolean>(false);
  const [debugLog, setDebugLog] = useState<DebugLogEntry[]>([]);
  const [skillQuery, setSkillQuery] = useState<string>("");
  const [skillFilter, setSkillFilter] = useState<"all" | "enabled" | "disabled" | "not-installed">("all");
  const [ideFilter, setIdeFilter] = useState<string>("all");
  const [ideStatusFilter, setIdeStatusFilter] = useState<"any" | "enabled" | "disabled" | "not-installed">("any");

  useEffect(() => {
    const saved = window.localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
      return;
    }
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    setTheme(prefersDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("theme", theme);
  }, [theme]);

  const refresh = useCallback(async () => {
    const [skillsData, targetData, settingsData] = await Promise.all([
      window.skillsApi.listSkills(),
      window.skillsApi.listTargets(),
      window.skillsApi.getSettings()
    ]);
    setSkills(skillsData);
    setActiveSkill((prev) => {
      if (!prev) {
        return prev;
      }
      return skillsData.find((skill) => skill.id === prev.id) ?? null;
    });
    setTargets(targetData);
    setSettings(settingsData);
    if (settingsData.defaultInstallTarget) {
      setInstallTargetId(settingsData.defaultInstallTarget);
    } else if (targetData[0]) {
      setInstallTargetId(targetData[0].id);
    }
  }, []);

  const loadPopular = useCallback(async () => {
    setPopularLoading(true);
    try {
      const result = await window.skillsApi.listPopularSkills();
      setPopularSkills(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPopularSkills({ skills: [], warnings: { "skills.sh": message, skillsmp: message } });
    } finally {
      setPopularLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    loadPopular();
  }, [refresh, loadPopular]);

  useEffect(() => {
    const unsubscribe = window.skillsApi.onInstallProgress((progress) => {
      setInstallStage(progress.stage);
      setInstallLog((prev) => [...prev.slice(-60), progress]);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = window.skillsApi.onSearchDebug((entry) => {
      setDebugLog((prev) => [...prev.slice(-80), entry]);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = window.skillsApi.onAppNavigate((tab) => {
      setActiveTab(tab);
    });
    return () => unsubscribe();
  }, []);

  const targetSummaries = useMemo(() => summarizeTargets(skills, targets), [skills, targets]);
  const popularBySource = useMemo(() => {
    return {
      "skills.sh": popularSkills.skills.filter((skill) => skill.source === "skills.sh").slice(0, 5),
      skillsmp: popularSkills.skills.filter((skill) => skill.source === "skillsmp").slice(0, 5)
    };
  }, [popularSkills]);
  const installedSkillNames = useMemo(
    () => new Set(skills.map((skill) => skill.name.toLowerCase())),
    [skills]
  );

  const filteredSkills = useMemo(() => {
    const query = skillQuery.trim().toLowerCase();
    return skills.filter((skill) => {
      const matchesQuery =
        !query ||
        skill.name.toLowerCase().includes(query) ||
        (skill.description || "").toLowerCase().includes(query);
      if (!matchesQuery) {
        return false;
      }
      if (skillFilter === "all") {
        // continue to IDE filter checks
      } else {
        const matchesAny = skill.targets.some((target) => target.status === skillFilter);
        if (!matchesAny) {
          return false;
        }
      }
      if (ideFilter !== "all") {
        const target = skill.targets.find((entry) => entry.targetId === ideFilter);
        if (!target) {
          return false;
        }
        if (ideStatusFilter !== "any") {
          return target.status === ideStatusFilter;
        }
      }
      return true;
    });
  }, [skills, skillQuery, skillFilter, ideFilter, ideStatusFilter]);

  const isInstalledPopular = (skill: PopularSkill) => installedSkillNames.has(skill.name.toLowerCase());
  const resolveIdeMeta = (targetId: string) =>
    ideMetaById[targetId] ?? {
      short: targetId.slice(0, 2).toUpperCase(),
      className: "ide-generic",
      iconLight: "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/code.svg",
      alt: targetId
    };

  const handleSelectPopular = (skill: PopularSkill) => {
    if (!skill.repo) {
      setStatusMessage("This skill source does not include a repo link. Try another option or paste a repo manually.");
      return;
    }
    setInstallSource(skill.source);
    setInstallRepo(skill.repo);
    setInstallSkillName(skill.name);
    setStatusMessage(`Ready to install ${skill.name}. Review the target IDE and click Install Skill.`);
  };

  const handleQuickInstall = async (skill: PopularSkill) => {
    if (!skill.repo) {
      setStatusMessage("This skill source does not include a repo link. Try another option or paste a repo manually.");
      return;
    }
    if (isInstalledPopular(skill)) {
      setStatusMessage(`${skill.name} is already installed.`);
      return;
    }
    setInstallLog([]);
    setInstallStage("start");
    setBusy(true);
    setStatusMessage("");
    try {
      const request: InstallRequest = {
        source: skill.source,
        repo: skill.repo,
        skillName: skill.name,
        targetId: installTargetId
      };
      const result = await window.skillsApi.installSkill(request);
      setStatusMessage(result.message);
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(message);
    } finally {
      setBusy(false);
    }
  };

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
    setInstallLog([]);
    setInstallStage("start");
    setBusy(true);
    setStatusMessage("");
    const request: InstallRequest = {
      source: installSource,
      repo: installRepo.trim(),
      skillName: installSkillName.trim() || undefined,
      targetId: installTargetId
    };
    try {
      const result: InstallResult = await window.skillsApi.installSkill(request);
      setStatusMessage(result.message);
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(message);
    } finally {
      setBusy(false);
    }
  };

  const handleSettingsUpdate = async (partial: Partial<AppSettings>) => {
    const next = await window.skillsApi.updateSettings(partial);
    setSettings(next);
    if (Object.prototype.hasOwnProperty.call(partial, "skillsmpApiKey")) {
      await loadPopular();
    }
  };

  const handleDeleteSkill = async (skill: SkillEntry) => {
    const confirmDelete = window.confirm(`Delete ${skill.name} from all IDEs? This cannot be undone.`);
    if (!confirmDelete) {
      return;
    }
    setBusy(true);
    setStatusMessage("");
    try {
      const result: DeleteResult = await window.skillsApi.deleteSkill(skill.id);
      setStatusMessage(result.message);
      setActiveSkill(null);
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(message);
    } finally {
      setBusy(false);
    }
  };

  const runSkillsMpSearch = async () => {
    setSkillsMpLoading(true);
    setDebugLog((prev) => [
      ...prev,
      { message: `Search requested: ${skillsMpQuery.trim() || "(empty)"}`, timestamp: new Date().toISOString() }
    ]);
    try {
      const result = await window.skillsApi.searchSkillsMp(skillsMpQuery);
      setSkillsMpResults(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSkillsMpResults({ skills: [], warning: message });
    } finally {
      setSkillsMpLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-dot" />
            <div>
              <p className="brand-title">Skills Manager</p>
              <p className="brand-subtitle">IDE skill control center</p>
            </div>
          </div>
          <nav className="tabs" role="tablist">
            {(["discover", "catalog", "activity", "settings"] as const).map((tab) => (
              <button
                key={tab}
                className={activeTab === tab ? "tab active" : "tab"}
                onClick={() => setActiveTab(tab)}
                role="tab"
                aria-selected={activeTab === tab}
              >
                {tab[0].toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
          <div className="topbar-actions">
            <button
              className="theme-toggle"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle dark mode"
            >
              <span className="theme-track">
                <span className="theme-icon sun" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.6" />
                    <path
                      d="M12 2.6v2.2M12 19.2v2.2M4.8 4.8l1.6 1.6M17.6 17.6l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.8 19.2l1.6-1.6M17.6 6.4l1.6-1.6"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="theme-icon moon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path
                      d="M20 14.5a7.8 7.8 0 0 1-9.5-9.5 8.2 8.2 0 1 0 9.5 9.5Z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="theme-thumb" />
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        <div className="main-inner">
          <section className="hero">
            <div className="hero-copy">
              <h1>Control room for every IDE skill.</h1>
              <p className="subtitle">Install, enable, and monitor skills across VS Code, OpenCode, Codex, and more.</p>
            </div>
            <div className="metrics">
              {targetSummaries.map((summary) => (
                <div key={summary.target.id} className="metric-card">
                  <div className="metric-label">{summary.target.label}</div>
                  <div className="metric-value">{summary.enabledCount} enabled</div>
                  <div className="metric-meta">~{summary.metadataTokens} metadata</div>
                  <div className="metric-meta">~{summary.fullTokens} total</div>
                </div>
              ))}
            </div>
          </section>

          {statusMessage && <div className="status-banner">{statusMessage}</div>}

          {activeTab === "discover" && (
            <section className="layout-2col">
              <div className="stack">
                <div className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>SkillsMP Search</h2>
                      <p>Find new skills instantly</p>
                    </div>
                  </div>
                  <div className="search-row">
                    <input
                      value={skillsMpQuery}
                      onChange={(event) => setSkillsMpQuery(event.target.value)}
                      placeholder="Search SkillsMP (e.g. logging, kubernetes)"
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          runSkillsMpSearch();
                        }
                      }}
                    />
                    <button className="primary compact" onClick={runSkillsMpSearch} disabled={skillsMpLoading}>
                      {skillsMpLoading ? "Searching..." : "Search"}
                    </button>
                  </div>
                  {skillsMpResults.warning && <p className="muted">{skillsMpResults.warning}</p>}
                  {skillsMpResults.skills.length > 0 && (
                    <div className="results">
                      {skillsMpResults.skills.map((skill) => (
                        <div key={`search-${skill.name}-${skill.repo}`} className="list-row">
                          <div>
                            <p className="row-title">{skill.name}</p>
                            <p className="row-sub">{stripGithubRepo(skill.repo)}</p>
                          </div>
                          <div className="row-actions">
                            {isInstalledPopular(skill) ? (
                              <span className="pill">Installed</span>
                            ) : (
                              <>
                                <button className="ghost" onClick={() => handleSelectPopular(skill)} disabled={busy || !skill.repo}>
                                  Use
                                </button>
                                <button
                                  className="primary compact"
                                  onClick={() => handleQuickInstall(skill)}
                                  disabled={busy || !skill.repo}
                                >
                                  Install
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>Popular Sources</h2>
                      <p>Top lists by source</p>
                    </div>
                  </div>
                  <div className="source-grid">
                    <div className="source-card">
                      <div className="source-header">
                        <div>
                          <h3>skills.sh</h3>
                          <p>Top 5 by installs</p>
                        </div>
                        {popularLoading && <span className="pill">Loading</span>}
                      </div>
                      <div className="source-list">
                        {popularBySource["skills.sh"].map((skill) => (
                          <div key={`${skill.source}-${skill.name}`} className="list-row">
                            <div>
                              <p className="row-title">{skill.name}</p>
                              <p className="row-sub">{stripGithubRepo(skill.repo)}</p>
                            </div>
                            <div className="row-actions">
                              {skill.installs && <span className="pill">{skill.installs}</span>}
                              {isInstalledPopular(skill) ? (
                                <span className="pill">Installed</span>
                              ) : (
                                <>
                                  <button className="ghost" onClick={() => handleSelectPopular(skill)} disabled={busy}>
                                    Use
                                  </button>
                                  <button className="primary compact" onClick={() => handleQuickInstall(skill)} disabled={busy}>
                                    Install
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                        {!popularBySource["skills.sh"].length && (
                          <p className="muted">{popularSkills.warnings["skills.sh"] ?? "No skills loaded yet."}</p>
                        )}
                      </div>
                    </div>

                    <div className="source-card">
                      <div className="source-header">
                        <div>
                          <h3>SkillsMP</h3>
                          <p>Top 5 by stars</p>
                        </div>
                        {popularLoading && <span className="pill">Loading</span>}
                      </div>
                      <div className="source-list">
                        {popularBySource.skillsmp.map((skill) => (
                          <div key={`${skill.source}-${skill.name}`} className="list-row">
                            <div>
                              <p className="row-title">{skill.name}</p>
                              <p className="row-sub">{stripGithubRepo(skill.repo)}</p>
                            </div>
                            <div className="row-actions">
                              {skill.installs && <span className="pill">{skill.installs}</span>}
                              {isInstalledPopular(skill) ? (
                                <span className="pill">Installed</span>
                              ) : (
                                <>
                                  <button className="ghost" onClick={() => handleSelectPopular(skill)} disabled={busy || !skill.repo}>
                                    Use
                                  </button>
                                  <button
                                    className="primary compact"
                                    onClick={() => handleQuickInstall(skill)}
                                    disabled={busy || !skill.repo}
                                  >
                                    Install
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                        {!popularBySource.skillsmp.length && (
                          <p className="muted">{popularSkills.warnings.skillsmp ?? "No skills loaded yet."}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="stack">
                <div className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>Install from GitHub</h2>
                      <p>Direct repo installs</p>
                    </div>
                  </div>
                  <label className="field">
                    <span>Source</span>
                    <select
                      value={installSource}
                      onChange={(event) => setInstallSource(event.target.value as InstallRequest["source"])}
                    >
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
                    <span className="field-help">Example: vercel-labs/agent-skills</span>
                  </label>
                  <label className="field">
                    <span>Skill Name (optional)</span>
                    <input
                      value={installSkillName}
                      onChange={(event) => setInstallSkillName(event.target.value)}
                      placeholder="Use when a repo contains multiple skills"
                    />
                    <span className="field-help">Only needed when a repo contains multiple SKILL.md files.</span>
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
                  <div className="inline-console">
                    <div className="inline-console-header">
                      <span>Install Output</span>
                      <span className="pill">{installStage ?? "idle"}</span>
                    </div>
                    <div className="inline-console-body">
                      {installLog.length === 0 && <p className="muted">No activity yet.</p>}
                      {installLog.map((entry, index) => (
                        <div key={`${entry.stage}-${index}`} className="inline-console-line">
                          <span className="console-badge">{entry.stage}</span>
                          <span className="console-text">{entry.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === "catalog" && (
            <section className="stack">
              <div className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Installed Skills</h2>
                    <p>{filteredSkills.length} shown</p>
                  </div>
                </div>
                <div className="catalog-toolbar">
                  <input
                    value={skillQuery}
                    onChange={(event) => setSkillQuery(event.target.value)}
                    placeholder="Search installed skills"
                  />
                  <div className="filter-group">
                    {(["all", "enabled", "disabled", "not-installed"] as const).map((filter) => (
                      <button
                        key={filter}
                        className={skillFilter === filter ? "filter-pill active" : "filter-pill"}
                        onClick={() => setSkillFilter(filter)}
                      >
                        {filter === "not-installed" ? "Not installed" : filter[0].toUpperCase() + filter.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="catalog-toolbar ide-filters">
                  <label className="field inline-field">
                    <span>IDE</span>
                    <select value={ideFilter} onChange={(event) => setIdeFilter(event.target.value)}>
                      <option value="all">All IDEs</option>
                      {targets.map((target) => (
                        <option key={target.id} value={target.id}>
                          {target.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="filter-group">
                    {(["any", "enabled", "disabled", "not-installed"] as const).map((filter) => (
                      <button
                        key={filter}
                        className={ideStatusFilter === filter ? "filter-pill active" : "filter-pill"}
                        onClick={() => setIdeStatusFilter(filter)}
                        disabled={ideFilter === "all"}
                      >
                        {filter === "any"
                          ? "Any status"
                          : filter === "not-installed"
                            ? "Not installed"
                            : filter[0].toUpperCase() + filter.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="skills-list">
                  {filteredSkills.map((skill) => (
                    <button
                      key={skill.id}
                      className={activeSkill?.id === skill.id ? "skill-row selected" : "skill-row"}
                      onClick={() => setActiveSkill(skill)}
                    >
                      <div>
                        <p className="row-title">{skill.name}</p>
                        <p className="row-sub">{skill.description || "No description"}</p>
                        <div className="ide-strip">
                          {skill.targets.map((target) => {
                            const meta = resolveIdeMeta(target.targetId);
                            const iconSrc = theme === "dark" && meta.iconDark ? meta.iconDark : meta.iconLight;
                            return (
                              <span key={`${skill.id}-${target.targetId}`} className={`ide-pill ${target.status}`}>
                                <span className={`ide-badge ${meta.className}`}>
                                  <img className="ide-logo" src={iconSrc} alt={meta.alt} />
                                </span>
                                <span>{target.targetLabel}</span>
                              </span>
                            );
                          })}
                        </div>
                        <p className="row-path">{skill.path}</p>
                      </div>
                      <div className="row-actions">
                        <span className="pill">Meta ~{skill.tokens.metadata}</span>
                        <span className="pill">Total ~{skill.tokens.full}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {activeTab === "activity" && (
            <section className="layout-2col">
              <div className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Install Activity</h2>
                    <p>Live execution output</p>
                  </div>
                </div>
                <div className="console-window">
                  {installLog.length === 0 && <p className="muted">No activity yet.</p>}
                  {installLog.map((entry, index) => (
                    <div key={`${entry.stage}-${index}`} className="console-line">
                      <span className="console-badge">{entry.stage}</span>
                      <span className="console-text">{entry.message}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Search Debug</h2>
                    <p>SkillsMP diagnostics</p>
                  </div>
                </div>
                <div className="console-window compact">
                  {debugLog.length === 0 && <p className="muted">No search activity yet.</p>}
                  {debugLog.map((entry, index) => (
                    <div key={`${entry.timestamp}-${index}`} className="console-line">
                      <span className="console-badge">log</span>
                      <span className="console-text">
                        [{new Date(entry.timestamp).toLocaleTimeString()}] {entry.message}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {activeTab === "settings" && (
            <section className="stack">
              <div className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Settings</h2>
                    <p>Configure sources & roots</p>
                  </div>
                </div>
                <label className="field">
                  <span>SkillsMP API Key</span>
                  <input
                    value={settings.skillsmpApiKey ?? ""}
                    onChange={(event) => handleSettingsUpdate({ skillsmpApiKey: event.target.value })}
                    placeholder="Optional"
                  />
                  <span className="field-help">Optional. Uses `SKILLSMP_API_KEY` env var if set.</span>
                </label>
                <label className="field">
                  <span>Extra Skill Roots</span>
                  <textarea
                    value={settings.extraRoots.join("\n")}
                    onChange={(event) =>
                      handleSettingsUpdate({ extraRoots: event.target.value.split(/\r?\n/).filter(Boolean) })
                    }
                    placeholder="One path per line"
                    rows={4}
                  />
                </label>
                <label className="field">
                  <span>VS Code Copilot Skills Root</span>
                  <input
                    value={settings.vscodeCopilotRoot ?? ""}
                    onChange={(event) => handleSettingsUpdate({ vscodeCopilotRoot: event.target.value })}
                    placeholder="Optional path (e.g. /Users/you/.copilot/skills)"
                  />
                  <span className="field-help">If set, installs will symlink into this folder for Copilot.</span>
                </label>
              </div>
            </section>
          )}
        </div>
      </main>

      {activeSkill && (
        <div className="modal-backdrop" onClick={() => setActiveSkill(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>{activeSkill.name}</h3>
                <p className="muted">{activeSkill.description || "No description"}</p>
              </div>
              <button className="ghost" onClick={() => setActiveSkill(null)}>
                Close
              </button>
            </div>
            <div className="modal-body">
              <p className="row-path">{activeSkill.path}</p>
              <div className="toggle-list">
                {activeSkill.targets.map((target) => {
                  const meta = resolveIdeMeta(target.targetId);
                  const iconSrc = theme === "dark" && meta.iconDark ? meta.iconDark : meta.iconLight;
                  const disabled = busy || target.status === "unsupported";
                  return (
                    <div key={`${activeSkill.id}-${target.targetId}`} className={`switch-row ${target.status}`}>
                      <div className="switch-left">
                        <span className={`ide-badge ${meta.className}`}>
                          <img className="ide-logo" src={iconSrc} alt={meta.alt} />
                        </span>
                        <div>
                          <span className="chip-title">{target.targetLabel}</span>
                          <span className="chip-status">{targetStatusLabel[target.status]}</span>
                        </div>
                      </div>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={target.status === "enabled"}
                          disabled={disabled}
                          onChange={() => handleToggle(activeSkill.id, target.targetId)}
                        />
                        <span className="slider" />
                      </label>
                    </div>
                  );
                })}
              </div>
              <button className="danger" onClick={() => handleDeleteSkill(activeSkill)} disabled={busy}>
                Delete From All IDEs
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
