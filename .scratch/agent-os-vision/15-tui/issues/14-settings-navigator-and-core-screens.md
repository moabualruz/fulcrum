---
Status: completed
ImplRuntime: claude
Triage: AFK
Pillar: tui
Blocked-by: [15/issues/04-dashboard-and-projects.md]
PRD: .scratch/agent-os-vision/prds/15-tui.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 15 section)
Decisions: [C4, Q28, Q-cross-cut]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Three surfaces, all shipped" row)
Docs: []
---

## Parent

Pillar 15 — TUI (OpenTUI, Full Feature Parity)

## What to build

Settings navigator (tab group: all settings screens reachable; breadcrumb correct), and core settings screens: Routing rules (CRUD list, `c` create, rule JSON preview, `e` edit), Skills (list, `u` update → `skills.sync`, `c` shows conflicts list), Custom fields (CRUD per project: add/remove/reorder fields), Saved views (CRUD: create/edit/delete named views; set as default), Feature flags screen (toggle list → `flags.set` tRPC; state reflected immediately), Users + invites screen (member list; `i` invite email form; role picker overlay), Auth screen (passkey prompt + password fallback; session written to session file).

- **Web**: `/settings/*` web routes.
- **CLI**: `fulcrum flags set --json`, `fulcrum skills list --json`, `fulcrum routing rules list --json`, `fulcrum auth whoami --json`.
- **TUI**: primary surface for all settings screens.

## Acceptance criteria

- [ ] Settings navigator: all 15 settings screens reachable via `Tab`/arrow; breadcrumb shows current screen path.
- [ ] Routing rules: `c` create opens JSON editor overlay; saved rule appears in list; `e` edit updates rule.
- [ ] Skills: list shows installed skills; `u` triggers `skills.sync`; `c` shows conflicts with resolution options.
- [ ] Custom fields: `a` add field with type picker (8 types); `d` delete; `r` reorder via up/down.
- [ ] Feature flags: toggle → `flags.set on/off`; list reflects new state; web flags state matches.
- [ ] Users: member list; `i` opens invite email form; invite created in DB; role picker changes member role.
- [ ] Auth: passkey prompt renders; password fallback available; session written; TUI StatusBar shows new user.
- [ ] After TUI flags toggle, CLI `fulcrum flags list --json` reflects new state; web flags page matches.

## Blocked by

- 15/issues/04-dashboard-and-projects.md

## Notes

T15-56–T15-67 maps to this slice (split between Settings navigator + most settings screens).
