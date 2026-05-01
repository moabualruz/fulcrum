---
Status: ready-for-agent
Triage: AFK
Pillar: cli-codegen
Blocked-by: [14/issues/01-codegen-scaffold.md]
PRD: .scratch/agent-os-vision/prds/14-cli-codegen.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 14 section)
Decisions: [Q-cli-shape, Q-distribution]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Three surfaces, all shipped" row)
Docs: []
---

## Parent

Pillar 14 — CLI (Auto-Codegen from tRPC)

## What to build

Completion script emitter integrated into codegen pipeline. Codegen emits `src/cli/generated/completions.sh` (bash), `completions.zsh`, `completions.fish` covering all domain/verb/flag combinations. Dynamic completions for resource IDs: tRPC `list` calls (e.g. `projects.list`) resolve at completion time. Binary entrypoint: `fulcrum completion bash|zsh|fish` emits the completion script to stdout; user sources it. Completion scripts included in `--help` installation instructions.

- **Web**: not applicable.
- **CLI**: `fulcrum completion bash` → non-empty script; `source <(fulcrum completion zsh)` works in zsh.
- **TUI**: TUI has its own keybind help (`?`); not applicable.

## Acceptance criteria

- [ ] `bun run codegen` emits `completions.sh`, `completions.zsh`, `completions.fish`; all non-empty.
- [ ] Bash completion: all 29 domain names present; all verbs for `tasks` domain present.
- [ ] Zsh completion: same coverage.
- [ ] Fish completion: same coverage.
- [ ] `fulcrum completion bash` runtime command emits same script as codegen-emitted file (deterministic).
- [ ] Doctor check `completion-scripts`: `fulcrum completion bash` non-empty + zsh + fish; CI passes.

## Blocked by

- 14/issues/01-codegen-scaffold.md

## Notes

P14.05 maps to this slice. Dynamic ID completions require an in-process tRPC call; graceful degradation if DB unavailable (skip dynamic completions).
