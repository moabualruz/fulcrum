# Docmost + Plannotator vs. Fulcrum: Competitive Parity Audit

*Research date: 2026-05-16. Docmost v0.80.2, Plannotator v0.19.x.*

## Docmost Audit Summary

### Coverage Ratings

| Area | Rating | Notes |
|------|--------|-------|
| Page/Document Management | Partial | DB schema mirrors exist; no CRUD UI, drag-reorder, favorites, archive |
| Rich Editor | Missing | Zero blocks rendered; entire Tiptap/Yjs surface absent |
| Real-Time Collaboration | Missing | No Yjs/Hocuspocus layer; no cursor presence |
| Comments | Partial | Schema only; no inline comment UI |
| Version History | Partial | Schema mirrors; no diff view or restore UI |
| Attachments/Media | Partial | Schema exists; no upload UI |
| Backlinks | Partial (Surplus opportunity) | Fulcrum schema ahead of upstream (Docmost has open issues #132, #1122, #1216) |
| Search | Partial | FTS backend exists; no query/filter UI |
| Spaces/Workspaces | Partial | Schema exists; no space navigation UI |
| Permissions | Partial | Schema exists; no permissions UI |
| Templates | Missing | Upstream also missing (issue #175) — surplus opportunity |
| Import/Export | Missing | Markdown/HTML/Notion import all missing |

### Top 5 Gaps
1. Rich editor UI (zero blocks; Tiptap+Yjs stack needed)
2. Real-time collaboration (no Yjs layer)
3. Version history UI (diff + restore)
4. Drag-reorder in page tree
5. Favorites (shipped upstream v0.80.0)

### Surplus Opportunities
- Backlinks panel — Fulcrum schema already ahead of upstream
- Page templates — neither has it; Fulcrum can ship first

## Plannotator Audit Summary

### Coverage Ratings

| Area | Rating | Notes |
|------|--------|-------|
| Plan Review Editor | Partial | Backend state exists; no diff view, file tree, annotation sidebar |
| Inline Annotations | Partial | Schema exists; no annotation UI |
| Review Feedback Loops | Partial | Backend primitives; no verdict dispatch UI |
| Code Review Export | Missing | No GitHub/GitLab PR integration |
| Planning Sessions | Partial | Session schema; no persistence/sharing UI |
| Review Search | Partial | Search schema exists; both projects incomplete |
| External API/SSE | Missing | No REST /api/diff, /api/feedback, /api/ai/query |
| UAT/Code Review Handoff | Partial | Workflow primitives; no intercept/hook UI |

### Top 5 Gaps
1. Review editor UI (no diff view, file tree, annotation sidebar)
2. External REST API + SSE (/api/diff, /api/feedback, /api/ai/query)
3. Verdict dispatch (Send Feedback / Approve pipeline)
4. GitHub/GitLab PR integration
5. Encrypted session sharing

### Surplus Opportunities
- Conventional comments format — neither ships it; Fulcrum can add
- Blocking vs non-blocking annotation — Fulcrum schema may already encode

## Combined Priority

| Rank | Gap | Source | Impact |
|------|-----|--------|--------|
| 1 | Rich editor UI | Docmost | Very High — blocks entire docs surface |
| 2 | Review editor UI | Plannotator | High — blocks review/annotation surface |
| 3 | Real-time collaboration | Docmost | High — co-editing baseline |
| 4 | External review API/SSE | Plannotator | High — agent integration |
| 5 | Version history UI | Docmost | Medium — diff/restore |
| 6 | GitHub/GitLab PR integration | Plannotator | Medium — code review export |
| 7 | Drag-reorder page tree | Docmost | Medium — UX |
| 8 | Encrypted session sharing | Plannotator | Medium — collaboration |
