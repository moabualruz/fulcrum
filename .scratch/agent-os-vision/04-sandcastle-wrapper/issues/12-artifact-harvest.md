---
Status: ready-for-agent
Triage: AFK
Pillar: 04-sandcastle-wrapper
Blocked-by: 11-transcript-diff-capture
---

# Artifact harvest via copyFileOut + edges row

## Parent: PRD `prds/04-sandcastle-wrapper.md`

## What to build (end-to-end)

Implement artifact harvesting in the Symphony `after_run` hook. After agent run completes, match files in the worktree against the project artifact glob (default `dist/**,build/**,*.patch,*.diff`). For each matched file, call `sandbox.copyFileOut()` to extract it from the sandbox to `workspace_root/artifacts/<run_id>/`. Insert an `artifacts` DB row per file and an `edges` row linking `artifact → generated_by → agent_run`. Also insert a `search_documents` row per artifact (filename + content preview) per Q25.

## Acceptance criteria

- [ ] Adapter / profile: `after_run` hook in `sandbox-runner.ts` enumerates artifact glob matches; `sandbox.copyFileOut()` called per match; files land in `workspace_root/artifacts/<run_id>/`.
- [ ] Lifecycle integration: `artifacts` DB row inserted per file with `org_id`, `run_id`, `task_id`, `filename`, `mime` (sniffed), `size_bytes`, `path`; `edges` row inserted with `from_kind='artifact'`, `to_kind='agent_run'`, `kind='generated_by'`.
- [ ] Lifecycle integration: `search_documents` row inserted per artifact (filename + first 500 chars of text content if text MIME) per Q25 / Q27 search indexing requirement.
- [ ] Surfaces parity: `runs.listArtifacts({ runId })` tRPC procedure returns all artifacts; `fulcrum runs <id> logs --json` includes artifact count; web `/runs/<id>` artifacts tab shows download links (wired in web slice 16).
- [ ] Tests: stub agent produces a `build/output.js` file; test asserts artifact row in DB; `edges` row linking artifact to run; `search_documents` row for artifact; empty-glob run produces zero artifact rows.

## Blocked by

11-transcript-diff-capture

## Notes

Artifact glob is a per-project config field; default `'dist/**,build/**,*.patch,*.diff'`. Store glob in `projects` table or `agent_profiles` depending on project-level vs profile-level scoping decision (prefer project-level). MIME sniffing: use file extension lookup table; no new binary dep required.
