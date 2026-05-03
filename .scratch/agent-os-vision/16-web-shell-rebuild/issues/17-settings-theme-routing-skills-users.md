---
Status: implemented
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [16-web-shell-rebuild/issues/02-theme-keybindings-errorbound-featuregate.md, 17-cross-cutting-platform/issues/04-theme-trpc-and-composable.md, 05-router-and-skills/issues/05-skills-web-ui.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [Q-cross-cut, Q20, Q-permissions, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (row: "Multi-user / accounts / collaboration")
Docs: https://kit.svelte.dev/docs
---

# Settings — /settings/theme, /settings/routing, /settings/skills, /settings/users

## What to build

Four settings routes. `/settings/theme`: org + user CSS-var pickers (HSL accent wheel, radius slider, font-family select, font-size-scale, spacing, animation-speed, compact mode toggle, dark/light/auto selector), preset selector, live preview panel, "Reset to defaults". `/settings/routing`: routing rules CRUD table + rule tester form (enter task title + type → "simulate" button → shows matched agent or no-match). `/settings/skills`: skill list (name, version, source, lock status, conflict indicator), "Update" button per skill, conflict resolution UI (upstream vs local diff). `/settings/users`: member list (avatar + name + role badge), invite button (email + role → invitation link), role picker, remove member.

Cuts through: `theme.update(key, value)` tRPC → handler resolves `ThemeService` from `ctx.container` → CSS var updates in `:root` live preview → save persists through `TenantSettingsRepository`.

## Acceptance criteria

- [ ] Theme: accent HEX change → live preview updates `:root` CSS var without save; save → reloads page with new var; reset → defaults restored.
- [ ] Compact mode: toggle → `--spacing-unit` shrinks; animation-speed `off` → `prefers-reduced-motion` respected.
- [ ] Routing: create rule (priority, conditions JSON, agent) → `router.rules.create` → list updates; tester → enter task → simulate → matched agent badge shown.
- [ ] Skills: list shows installed skills with SHA lock; "Update" → diff modal → confirm → `skills.update` called; conflict row shows upstream vs local diff; "Keep Local" writes to `skills.lock.json`.
- [ ] Users: invite form → `org.members.invite` → invitation email row appears; role picker → `org.members.updateRole`; remove → `org.members.remove`.
- [ ] Playwright: add routing rule, simulate task → see matched agent; update skill with no conflict → success.
- [ ] CLI: `fulcrum router rule list --json`; `fulcrum skills list --json`; `fulcrum org members list --json`.
- [ ] TUI: routing rules screen + skills screen (Pillar 15).

## Blocked by

- Issue 02 (theme engine) — `useTheme()` composable wired.
- Pillar 17 issue 04 (theme tRPC) — `theme.*` procedures.
- Pillar 5 issue 05 (skills web UI) — `skills.*` tRPC.
