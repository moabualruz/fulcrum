# Fulcrum rule index

Fulcrum installs this file once under `~/.fulcrum/rules/AGENTS.md`. Agent rule files must import it or point to it. Do not paste this body into every agent file.

## Install contract

- Agents with native `@` import support load this file by import.
- Agents without native import support receive a small loader that forces a read of this file before planning, editing, or running commands.
- Detailed rules live in linked markdown files next to this file. Read them only when their trigger applies.
- User content outside `<!-- BEGIN/END FULCRUM RULES -->` markers in agent files is preserved.

## Must read first

Before suggesting commands, editing files, or running tools in any project, read available project guidance:

- `AGENTS.md`
- `CLAUDE.md`
- `justfile`
- `.mise.toml` or `.tool-versions`
- `.envrc`
- `pyproject.toml`
- `package.json`

Project guidance wins over defaults in this file and linked situational rules.

## Always-on rules

- Use machine-readable CLI output when available: `--json`, `--format json`, `-o json`, then parse with `jq` or `yq`.
- Do not dump large raw output into chat. Use indexed, batched, or sandboxed processing and return the answer or artifact path.
- Do not write to `~/.agents/`. Use each agent's native skill or rules directory.
- Preserve user content outside Fulcrum sentinels.
- Ask before destructive actions: recursive delete, hard reset, force push, git clean, database drop or truncate, infrastructure destroy, production delete.
- Verify before claiming done: run the project runner, lint, typecheck, tests, build, or a targeted smoke check.
- Keep code names based on responsibility, domain, behavior, or value. Do not name code after plan phase, provenance, status, or inspiration source.
- Prefer editing existing modules over adding overlapping utilities.
- Comment why a non-obvious choice exists. Do not comment what the next line already says.

## Situational reads

When a trigger applies, read the linked file before acting. If this file is installed at `~/.fulcrum/rules/AGENTS.md`, resolve links under `~/.fulcrum/rules/`.

- Project discovery, runners, package managers, environment setup: `situational/project-discovery.md`
- Search, data tools, HTTP, browser, database, performance, and process handling: `situational/tooling.md`
- Git workflow, diffs, commits, verification, and security scans: `situational/git-quality-security.md`
- Architecture, naming, test scope, and persistence or server stack choices: `situational/architecture-and-code.md`
- Context-mode routing, subagents, output style, and long-session context control: `situational/orchestration-and-context.md`

## Vendor rule note

Fulcrum owns only the small loader block in each agent's primary rules file. Vendor hooks, plugins, settings, and skills stay in their native locations.
