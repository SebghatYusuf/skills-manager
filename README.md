# Skills Manager

Install, enable, and manage agent skills across IDEs with one unified desktop app. Skills Manager brings together curated sources (skills.sh and SkillsMP), provides a guided install flow, and lets you toggle skills per-IDE with clear runtime feedback.

![Skills Manager hero](media/app-icon.svg)

## Features
- **Multi‑IDE control**: Install once, enable/disable per IDE.
- **Skills discovery**: Top skills from skills.sh + SkillsMP search.
- **Guided installs**: Live install output and stage tracking.
- **Local + external sources**: GitHub repos, skills.sh, SkillsMP.
- **Per‑IDE status**: Clear enabled/disabled state indicators.
- **Local settings**: Extra roots, SkillsMP API key, Copilot root.
- **Dark mode**: Built‑in light/dark themes.

## Supported IDEs
- VS Code (with optional Copilot skills root symlink)
- OpenCode
- Codex
- Claude Code

> If an IDE target does not support enablement yet, the toggle will show it as `Unsupported`.

## Quick Start (Development)
```bash
corepack enable
yarn install
yarn dev
```

## Configuration
You can configure Skills Manager via the Settings screen or environment variables.

### Environment variables
Create a `.env` based on `.env.example`:
```bash
cp .env.example .env
```

Supported values:
```
SKILLSMP_API_KEY=your_skillsmp_key
```

### Settings
Inside the app:
- **SkillsMP API Key**: Used for higher‑rate access to SkillsMP.
- **Extra Skill Roots**: Additional directories to scan for skills.
- **VS Code Copilot Skills Root**: If set, skills are symlinked for Copilot.

## Installing Skills
1. Search SkillsMP or pick from top lists.
2. Click **Use** to prefill the install form.
3. Choose target IDE and click **Install Skill**.
4. Watch live output while the skill is cloned, scanned, and installed.

## Building for macOS
This repo uses `electron-builder`.

### 1) Generate the macOS icon
```bash
yarn icon:mac
```
This script generates `build/icon.icns` from `media/app-icon.svg`.

### 2) Build
```bash
yarn build
yarn dist:mac
```

Artifacts land in `dist/`.

## Troubleshooting
### SkillsMP search returns no results
- Check `SKILLSMP_API_KEY` is set in `.env`.
- Open **Activity** → **Search Debug** for response logs.

### Git clone fails (repo path)
If a repo URL includes `tree/...`, the app will normalize it to the root repo.  
If a repo still fails to clone, try pasting only `owner/repo`.

### Toggle errors or duplicate records
The app groups skills by name and uses per‑target state.  
If a target path is corrupt, remove the skill via **Delete From All IDEs** and reinstall.

## Project Structure
```
src/
  main/       Electron main process
  preload/    IPC bridge
  renderer/   React UI
  shared/     Types
  skills/     Skill scanners/targets
```

## Scripts
```bash
yarn dev         # run in development
yarn build       # build production bundles
yarn dist:mac    # build macOS installer
yarn icon:mac    # generate macOS icns
```

## License
MIT
