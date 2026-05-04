---
Status: completed
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [16-web-shell-rebuild/issues/01-v0-teardown-and-sveltekit-scaffold.md, 17-cross-cutting-platform/issues/03-backup-restore-trpc.md, 17-cross-cutting-platform/issues/07-feature-flag-rollout-trpc.md, 17-cross-cutting-platform/issues/09-json-import-export-trpc.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [Q-cross-cut, D5, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (row: "Schema for future SaaS without rewrite")
Docs: https://kit.svelte.dev/docs
---

# Settings — /settings/secrets, /settings/backups, /settings/feature-flags, /settings/data, /settings/errors, /settings/telemetry

## What to build

Six settings routes consuming Pillar 17 tRPC procedures. `/settings/secrets`: credential list (name, provider, last-used, archived toggle), add-secret Sheet (name + value masked, never echoed), rotate, archive, delete. `/settings/backups`: "Create Backup" button → polling job → download link; backup history list; restore upload form → preflight summary modal → confirm. `/settings/feature-flags`: flag table with name, enabled toggle, rollout-% slider, cohort-rules JSON editor, last-updated; each row links to flag docs. `/settings/data`: Export JSON button (all/per-entity-kind selector) → download; Import JSON upload + preflight row-count summary. `/settings/errors`: crash log (paginated, DESC); per-row expandable stack trace + context JSON; "Clear before date" action. `/settings/telemetry`: opt-in toggle + "Purge local telemetry" button with row count badge.

Cuts through: `credentials.list` tRPC → masked list rendered → "Add" → Sheet → `credentials.set` → list updates; `backup.create` → polling → download link resolves.

## Acceptance criteria

- [ ] Secrets: add → value never visible in DOM (verified by Playwright `page.content()` assertion); masked display; rotate updates `last_used_at`; delete removes row.
- [ ] Backup: create → job polls → download link appears within 30s; restore upload → preflight modal shows entity counts + collisions; confirm → toast "Restore complete".
- [ ] Feature flags: toggle ON → `flags.set` called → refresh shows `enabled=true`; rollout slider 50% → saved → `rollout_percent=50` in DB.
- [ ] Data: export download → valid JSON file; import upload → preflight summary; confirm → task count matches.
- [ ] Errors: crash entry shows OS/version/stack trace on expand; "Clear all before" → rows deleted.
- [ ] Telemetry: opt-in toggle persists; purge → row count shows 0.
- [ ] Playwright: full backup create + restore cycle; secrets add + delete.
- [ ] CLI: all these features also covered by CLI slices in Pillar 17.

## Blocked by

- Issue 01 (scaffold) — settings layout needed.
- Pillar 17 issues 03, 07, 09 (backup tRPC, flags tRPC, import/export tRPC).
