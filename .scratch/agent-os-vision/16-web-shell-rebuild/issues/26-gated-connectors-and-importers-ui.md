---
Status: completed
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [16-web-shell-rebuild/issues/10-project-settings-fields-statuses-views.md, 17-cross-cutting-platform/issues/14-gated-import-csv.md, 17-cross-cutting-platform/issues/15-gated-import-linear-jira-plane.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [Q-cross-cut, C1, C5, D5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (connectors gated)
Docs: https://kit.svelte.dev/docs
---

# GATED: connector UI (Jira, Linear, GitHub Issues) + import/export UI (CSV, Linear, Jira) + skill marketplace

## What to build

Multiple gated Web surfaces. `connector-jira/connector-linear/connector-github-issues`: Settings → Integrations shows a card per connector; flag OFF → card grayed out with "Enable via feature flags" note; flag ON → config form (host/email/token or API key), "Test connection" button, "Sync now" button, sync log table. `import-csv` / `export-csv` / `import-linear` / `import-jira`: Settings → Data → Import/Export section with per-format tabs; flag OFF → tab hidden; flag ON → wizard (file upload / OAuth connect → field mapper → dry-run summary → import). `skill-marketplace`: Settings → Skills → Marketplace tab; flag OFF → tab hidden; flag ON → upstream skill list (fetched from `skills.upstream.list` tRPC), "Install" button per skill. `experiments`: Settings → Experiments page; flag OFF → 404; flag ON → experiment CRUD with variant list and assignment counts chart. Notification channels: `notify-email` / `notify-slack` / `notify-discord` → Settings → Notifications → Channels sub-tabs per flag. `casbin-policies`: Settings → Permissions rule editor.

## Acceptance criteria

- [ ] Each connector: flag OFF → card disabled; flag ON → config form saves; "Sync now" calls `connectors.sync(name)` → sync-log row added.
- [ ] CSV import: flag ON → file upload → column mapper UI → dry-run shows row count → confirm imports tasks.
- [ ] Linear import: flag ON → wizard shows API-key field (pre-filled from `credentials`); mock Linear response → tasks created with correct field mapping.
- [ ] Skill marketplace: flag ON → upstream list renders; "Install" → `skills.install(name)` → skill appears in main Skills list.
- [ ] Notification channels: each flag independently enables its sub-tab; config saves and shows "Verified" badge after test send.
- [ ] `casbin-policies` ON → Settings → Permissions shows rule editor; add rule → `casbin.*` tRPC called.
- [ ] Playwright: toggle `import-csv` ON → file upload tab visible → upload CSV → preflight shows row count.

## Blocked by

- Issue 10 (project settings) — settings layout established.
- Pillar 17 issues 14 (import-csv), 15 (import-linear/jira/plane) — connector tRPC procedures.
