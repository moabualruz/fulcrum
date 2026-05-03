---
Status: implemented
Triage: AFK
Pillar: cli-codegen
Blocked-by: [14/issues/02-json-flag-and-watch-generation.md]
PRD: .scratch/agent-os-vision/prds/14-cli-codegen.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 14 section)
Decisions: [Q-distribution, Q29, A1]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Three surfaces, all shipped" row)
Docs: [https://bun.sh/docs/bundler/executables]
---

## Parent

Pillar 14 — CLI (Auto-Codegen from tRPC)

## What to build

`src/index.ts` commander root program registering all generated domain commands + hand-written entrypoints (`tui`, `web`, `init`, `doctor`, `inference`, `backup`, `restore`, `completion`). `bun build --compile src/index.ts --outfile dist/fulcrum` produces single static binary. Binary size check: fail CI if >150 MB; warn at 130 MB. Cross-compile all 5 targets per Q29: macOS arm64, macOS x64, Linux x64, Linux arm64, Windows x64. Windows x64 failure tolerated (warn, not block release). `fulcrum --version` exits 0 with semver; `fulcrum --help` exits 0 listing domains; unknown command exits 1 with suggestion.

- **Web**: `fulcrum web --port 3000` starts SvelteKit server; implementation is Pillar 16's scope.
- **CLI**: `dist/fulcrum` is the deliverable binary.
- **TUI**: `fulcrum tui` hands off to Pillar 15; entrypoint scaffolded here.

## Acceptance criteria

- [ ] `dist/fulcrum --version` exits 0 with semver string on macOS arm64 + Linux x64 in CI.
- [ ] `dist/fulcrum --help` exits 0; lists all 29 domains.
- [ ] `dist/fulcrum unknown-command` exits 1 with "Did you mean?" suggestion.
- [ ] Binary size: `wc -c dist/fulcrum` < 150MB; CI step asserts; warns at 130MB.
- [ ] Cross-compile: CI matrix produces 5 binaries; each `--version` succeeds; Windows x64 failure → warn only.
- [ ] `bun run build:cli` script added to `package.json` producing `dist/fulcrum`.

## Blocked by

- 14/issues/02-json-flag-and-watch-generation.md

## Notes

P14.08–P14.11 maps to this slice. Failure gate: binary >150MB → split `fulcrum-cli` + `fulcrum-web` packages per PRD.
