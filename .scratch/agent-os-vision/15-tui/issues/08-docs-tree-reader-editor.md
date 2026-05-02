---
Status: ready-for-agent
Triage: AFK
Pillar: tui
Blocked-by: [15/issues/04-dashboard-and-projects.md]
PRD: .scratch/agent-os-vision/prds/15-tui.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 15 section)
Decisions: [C4, Q11, Q13, Q14, Q28]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Confluence-grade docs" row)
Docs: []
---

## Parent

Pillar 15 — TUI (OpenTUI, Full Feature Parity)

## What to build

Docs tree browser (project + global trees side-by-side; `←`/`→` tree/content split; expand/collapse with `←`/`→`; `n` new doc; `Enter` opens reader), Doc reader (plain-text render via remark → strip-ansi safe; headings, lists, code blocks, inline code — all ANSI-safe; no DOM), Doc editor (full-pane plain-text editor + YAML frontmatter form above separator; `Ctrl+S` save → `docs.update` tRPC; load round-trips without data loss), Doc history screen (version list `doc_versions`; `Enter` opens unified diff view via `diff` npm package).

Note: TipTap block editor cannot run in terminal. TUI uses plain-text fallback; full-fidelity editing remains web-only (C5 carve-out owned by Pillar 7).

- **Web**: `/docs`, `/projects/[id]/docs`, `/docs/[id]/edit`, `/docs/[id]/history` web routes.
- **CLI**: `fulcrum docs list --json`, `fulcrum docs update <id> --json`.
- **TUI**: primary surface.

## Acceptance criteria

- [ ] Doc tree: project + global trees render; expand/collapse correct; `n` creates doc with type picker (9 types from `doc_type` enum).
- [ ] Reader: headings render as bold ANSI; code blocks in code colour; wikilinks shown as `[[target]]` plain.
- [ ] Editor: `Ctrl+S` saves; reload from DB round-trips without data loss; YAML frontmatter section above `---` separator.
- [ ] Doc history: version list shows `version_num`, `created_at`, `author`; `Enter` opens unified diff (added lines green, removed red).
- [ ] After TUI doc create, web doc tree shows new doc; CLI `fulcrum docs list --json` reflects.
- [ ] FakeTTY snapshot for doc reader (strip-ansi).

## Blocked by

- 15/issues/04-dashboard-and-projects.md

## Notes

T15-38–T15-41 maps to this slice.
