---
Status: completed
ImplCommit: 13d67cb2
ImplRuntime: codex
Triage: AFK
Pillar: 07-docs-editor-collab
Blocked-by: [05-doc-crud-trpc.md, 06-slash-menu-core-marks-blocks.md]
PRD: .scratch/agent-os-vision/prds/07-docs-editor-collab.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 7 section)
Decisions: [C1, Q5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Confluence-grade docs row)
Docs: []
---

# Gated: report-llm-narration — auto exec-summary block on ADR / postmortem / RFC save

## Parent
PRD: `.scratch/agent-os-vision/prds/07-docs-editor-collab.md` (issues lines P7-49; gated features table)

## What to build
Feature-flagged (`FULCRUM_FEATURES=report-llm-narration`) LLM summary pipeline. When OFF:
no sidecar call, no summary block. When ON: after saving a doc with `doc_type IN ('adr',
'postmortem', 'rfc')`, `src/docs/llm-narrator.ts` sends `body_md` to the inference sidecar
for a 2-paragraph executive summary. The summary is prepended as a **read-only** TipTap
block (`type:'narration-block'`, `attrs:{readonly:true}`) into `content_json` + prepended
as a `> [AI summary]\n\n` blockquote in `body_md`. `report-llm-narration` backend is
overridable per `FULCRUM_FEATURES=report-llm-narration:<backend>` (embedded default,
openai-compatible supported).

## Acceptance criteria
- [ ] `FULCRUM_FEATURES=report-llm-narration` OFF: no sidecar call on ADR/postmortem/RFC save; no summary block in `content_json`
- [ ] Flag ON: save ADR doc → sidecar called with `body_md`; 2-para summary returned; prepended as read-only `narration-block` node in `content_json`
- [ ] `narration-block` TipTap node: marked `attrs:{readonly:true}`; user cannot edit or delete it via keyboard; displayed with distinct background color (e.g. info blue)
- [ ] `body_md` equivalent: summary prepended as `> [AI Summary]\n\n<para1>\n\n<para2>\n\n---\n\n`
- [ ] Non-ADR/postmortem/RFC docs: no sidecar call even when flag is ON
- [ ] Failed sidecar call: `docs.update` still succeeds; no `narration-block` inserted; warning logged
- [ ] Backend override: `FULCRUM_FEATURES=report-llm-narration:openai-compatible` routes sidecar call to configured OpenAI-compatible URL
- [ ] Re-save: if `narration-block` already present, replace it (not append); only one summary block per doc
- [ ] Tests: flag OFF — no sidecar import in OFF code path
- [ ] Tests: flag ON, mock sidecar returns fixed 2-para text → assert `narration-block` node at top of `content_json`; `body_md` starts with blockquote
- [ ] Tests: re-save — mock returns updated summary; assert old block replaced, not duplicated
- [ ] Tests: non-eligible doc_type (wiki) — no sidecar call
- [ ] Web: `narration-block` renders in editor with read-only styling (no cursor, no selection handles); present in read view
- [ ] CLI: `fulcrum docs show <slug> --json` `body_md` starts with blockquote summary for flagged doc_types
- [ ] TUI: reader shows blockquote summary at top; no edit of summary block possible

## Blocked by
`05-doc-crud-trpc.md`, `06-slash-menu-core-marks-blocks.md`

## Notes / Tech-stack hints
- `narration-block` custom TipTap node: extend `Node.create({name:'narration-block', atom:true, selectable:false})`; renders as a styled aside in the NodeView
- Inference sidecar prompt: system = "Generate a 2-paragraph executive summary of the following document. Be concise. Do not add new information."; user = body_md
- Backend selection uses same inference client abstraction from Pillar 2 (`src/inference/client.ts`)
