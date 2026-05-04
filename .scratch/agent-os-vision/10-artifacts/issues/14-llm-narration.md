---
Status: completed
ImplRuntime: claude
Triage: AFK
Pillar: artifacts
Blocked-by: [03-harvest-pipeline.md, 06-trpc-procedures.md]
PRD: .scratch/agent-os-vision/prds/10-artifacts.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 10 section)
Decisions: [C1, Q34, D5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Artifacts row)
Docs: []
---

# Gated: report-llm-narration — post-harvest inference sidecar call + metadata_json.narration write

## Parent
PRD: `.scratch/agent-os-vision/prds/10-artifacts.md` (Gated features: report-llm-narration; issues 10-18)

## What to build
Post-harvest hook in `src/artifacts/narration.ts`: when `FULCRUM_FEATURES=report-llm-narration` ON and inference sidecar running, call sidecar with artifact filename + first 2000 chars of content; write plain-language description/summary into `artifacts.metadata_json.narration`. Triggered as a graphile-worker follow-on job `artifact.narrate` after `artifact.harvest` completes. Web artifact detail page shows narration when present. Flag OFF → zero inference calls, no narration field, no error.

## Acceptance criteria
- [x] Schema migration: no new columns; `artifacts.metadata_json` is `jsonb NOT NULL DEFAULT '{}'`; narration written as `metadata_json.narration: string`.
- [x] tRPC procedure / module: `artifacts.get` includes `metadata_json.narration` when present; `artifacts.list` does not include narration (performance).
- [ ] Web surface: `/artifacts/<id>` detail page shows "Summary" card with narration text when `metadata_json.narration` set; card absent when not set.
- [ ] CLI command: `fulcrum artifacts show <id> --json` includes `metadata_json.narration` field when set.
- [ ] TUI screen: Artifacts detail overlay shows narration line when present.
- [x] Tests: flag ON + sidecar mock → `metadata_json.narration` populated with non-empty string; flag OFF → zero inference sidecar calls, `narration` field absent; sidecar timeout (>5s) → graceful skip (no narration, no job failure); RED→GREEN.

## Blocked by
- `03-harvest-pipeline.md` — harvest must complete before narration job enqueued.
- `06-trpc-procedures.md` — `artifacts.get` reads `metadata_json`.
- Pillar 2 (Inference sidecar) — must be running; mock in tests.

## Notes / Tech-stack hints
- `artifact.narrate` graphile-worker job: payload `{ artifactId: string }`; enqueued by `artifact.harvest` job completion via `addJob`.
- Sidecar timeout: 5s; if timeout → job succeeds (no retry) with no narration written; emit `events` row `verb='artifact.narration.skipped'`.
- Narration prompt: "Describe this file in 1–2 sentences for a developer reading an audit log. File: <filename>. Content: <first2000chars>".
- Per C1: flag OFF default; both paths (with/without narration) tested.
