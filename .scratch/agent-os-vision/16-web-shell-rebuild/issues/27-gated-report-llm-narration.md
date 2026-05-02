---
Status: ready-for-agent
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [16-web-shell-rebuild/issues/08-reports-hub.md, 02-inference-sidecar/issues/07-generate-operation.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [Q5b, C1, D5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (LLM sprint narrative gated)
Docs: https://kit.svelte.dev/docs
---

# GATED: report-llm-narration — LLM sprint narrative in sprint close modal

## What to build

Behind `FULCRUM_FEATURES=report-llm-narration`. When a sprint is closed (sprint close modal in `/projects/[id]/sprints`), if flag ON: modal shows an additional "Generate Narrative" step; calls `reports.generateNarration(sprintId)` tRPC which sends sprint stats (velocity, tasks completed, blocked tasks, cycle time) to the inference sidecar (`generate` operation); returns a paragraph summary; appended as a TipTap block to the sprint's retrospective doc.

Flag OFF: sprint close modal has no LLM step; retro doc is blank (user fills manually).

## Acceptance criteria

- [ ] Flag OFF: sprint close modal shows no LLM section; `reports.generateNarration` not called.
- [ ] Flag ON: sprint close modal shows "Generate AI narrative" step with progress spinner; on completion, narrative paragraph inserted into retro doc as TipTap `paragraph` block.
- [ ] `reports.generateNarration(sprintId)`: assembles sprint stats → calls `inference.generate(prompt)` tRPC → returns text → appends to retro doc.
- [ ] Failure gate: inference sidecar offline → `reports.generateNarration` returns `{error: "sidecar_unavailable"}`; modal shows "Narrative unavailable — sidecar offline" without blocking sprint close.
- [ ] Vitest: `generateNarration` with mocked inference sidecar → returns expected text block; flag OFF → procedure is no-op.

## Blocked by

- Issue 08 (reports hub) — sprint close flow lives here.
- Pillar 2 issue 07 (generate operation) — inference sidecar `generate` call.
