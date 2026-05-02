---
Status: ready-for-agent
Triage: AFK
Pillar: 07-docs-editor-collab
Blocked-by: [05-doc-crud-trpc.md, 12-version-history-engine.md, 07-wikilink-node-backlinks.md]
PRD: .scratch/agent-os-vision/prds/07-docs-editor-collab.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 7 section)
Decisions: [C4, Q-tui-lib]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Confluence-grade docs row)
Docs: []
---

# TUI docs panel — tree + reader + edit mode + backlinks + history + scope toggle

## Parent
PRD: `.scratch/agent-os-vision/prds/07-docs-editor-collab.md` (issues lines P7-44..P7-46)

## What to build
OpenTUI Docs screen (failure gate: ratatui if OpenTUI too immature at TUI-build time):

**Two-pane layout**: left = tree panel (arrow-key nav, `Enter` = open reader, `n` = new doc,
`d` = archive, `g` = scope toggle project↔global, `p` = preview split).
Right = reader pane (renders `body_md` as plaintext with minimal ANSI formatting: `#` =
bold header, `` ` `` = dim code, `**` stripped, wikilinks as `[[slug]]` clickable strings).

**Edit mode**: `e` key on reader → OpenTUI `<TextArea>` pre-filled with `body_md`;
`Ctrl+S` calls `docs.update`; new version written; `Ctrl+F` opens frontmatter YAML popup
(same YAML from `FrontmatterYaml` but plaintext textarea in TUI).

**Panels**: `b` = backlinks panel (list + navigate); `h` = history view (version list, ANSI
jsondiffpatch diff, `r` = restore); `Ctrl+C` / `Esc` = close panel.

## Acceptance criteria
- [ ] Docs screen mounts without error; tree renders from `docs.tree` tRPC response
- [ ] Tree: arrow-key navigate (Up/Down); `Enter` opens reader for selected doc; tree supports 100+ docs without hang
- [ ] `n` key: opens create flow → asks for title + doc_type → calls `docs.create` → new doc appears in tree
- [ ] `d` key: archives selected doc; soft-delete; doc disappears from tree
- [ ] `g` key: scope toggle — switches tree between `scope='project'` and `scope='global'`; tree re-renders
- [ ] Reader pane: renders `body_md` with ANSI formatting; wikilinks displayed as `[[slug]]` (not raw JSON)
- [ ] Edit mode: `e` key opens `<TextArea>` with `body_md`; `Ctrl+S` saves via `docs.update`; version row written
- [ ] Frontmatter popup: `Ctrl+F` shows YAML textarea; `Ctrl+S` saves; Zod error shown as error line in popup
- [ ] Backlinks panel: `b` opens panel with list from `docs.links.listBacklinks`; `Enter` navigates to doc
- [ ] History view: `h` opens version list (version_num, date, author, is_snapshot); select version → ANSI diff; `r` restores
- [ ] Performance: 100+ docs in tree render < 500 ms; reader render of 10 kB body_md < 100 ms
- [ ] Failure gate: if OpenTUI `<TextArea>` component is missing/broken → fallback shows `fulcrum docs edit <slug>` CLI command to user instead of inline editor
- [ ] Tests: Vitest (headless) — tree navigation state machine; `g` toggle changes `scope` param in next `docs.tree` call; `Ctrl+S` calls `docs.update` with correct body_md
- [ ] Web: same data shown in TUI tree and web `/docs` sidebar (verified via parallel test queries)
- [ ] CLI: `fulcrum docs show <slug> --json` output matches data shown in TUI reader

## Blocked by
`05-doc-crud-trpc.md`, `12-version-history-engine.md`, `07-wikilink-node-backlinks.md`

## Notes / Tech-stack hints
- OpenTUI failure gate (per PRD): if component library too immature at TUI-build time → fall back to ratatui (Rust) in `inference/` workspace; document decision in ADR
- ANSI formatting in reader: use `chalk` or manual ANSI codes; avoid full markdown parser in TUI (too heavy)
- `p` preview split: side-by-side edit textarea + rendered preview pane (two OpenTUI `<Box>` components)
