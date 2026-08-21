# pi-dev-config

Personal configuration for [pi](https://github.com/earendil-works/pi), tracked from `~/.pi/agent`.

## Contents

| Path | Purpose |
|------|---------|
| `AGENTS.md` | Global agent instructions |
| `settings.json.example` | Provider, model, and theme settings (real file is git-ignored) |
| `extensions/` | Global extensions loaded for every project |
| `themes/` | Custom themes |

Credentials (`auth.json`), machine state (`trust.json`, `models-store.json`, `sessions/`), and
vendored binaries (`bin/`) are git-ignored.

## Extensions

- `pr-session-name.ts` — names the session `branch: first prompt`, then `#123 <PR title>` once
  `gh pr create` succeeds; also renders the name above the editor in the theme accent color.
- `markdown-links.ts` — rewrites inline links so the URL is what gets link styling.
- `session-state.ts` — writes session state for the worktree dashboard.
- `usage-log.ts` — logs token usage.

## Install

```bash
git clone https://github.com/jazeee/pi-dev-config.git ~/.pi/agent
```
