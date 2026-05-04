---
Status: completed
Triage: AFK
Pillar: 07-docs-editor-collab
Blocked-by: [05-doc-crud-trpc.md]
PRD: .scratch/agent-os-vision/prds/07-docs-editor-collab.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 7 section)
Decisions: [Q11, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Confluence-grade docs row)
Docs: [https://github.com/isaacHagoel/svelte-dnd-action]
---

# Doc tree CRUD — DocTree.svelte + DnD reorder + breadcrumbs + scope toggle (per-project/global)

## Parent
PRD: `.scratch/agent-os-vision/prds/07-docs-editor-collab.md` (issues lines P7-11, P7-38)

## What to build
`DocTree.svelte` — two-pane sidebar component rendering the `docs.tree` tRPC result.
Tree nodes show doc_type icon + color badge. `svelte-dnd-action` enables drag-drop
reorder within and across parents; on drop → `docs.move` tRPC with new `parent_id` +
`sort_position`. Right-click context menu: create child / rename / move / archive / delete.
Breadcrumbs bar above the tree recomputed via recursive CTE on `parent_id`
(returned by `docs.get`). Scope toggle `g` key or UI button switches tree between
`scope='project'` and `scope='global'`. Both trees live in sidebar simultaneously on
`/docs` hub page (two accordions).

## Acceptance criteria
- [ ] `DocTree.svelte` renders nested tree from `docs.tree` result with correct parent-child nesting
- [ ] Each node shows correct doc_type icon + color badge (spec=purple, adr=red, wiki=blue, etc.)
- [ ] Drag-drop reorder: drag node within same parent → `sort_position` updated via `docs.move`; sibling order persists after reload
- [ ] Drag-drop reparent: drag node onto another node → `parent_id` updated; breadcrumbs recomputed
- [ ] Context menu: create child opens new-doc wizard with `parent_id` pre-set; rename calls `docs.update`; archive calls `docs.delete` soft; hard delete confirms then calls `docs.delete` hard
- [ ] Breadcrumbs: correct ancestor chain shown above doc content; each crumb clickable → navigate
- [ ] Scope toggle (`g` key): switches tree between `scope='project'` and `scope='global'`; UI state persists in URL param
- [ ] `/docs` hub: shows both project-scoped tree and global tree as side-by-side or accordion panels
- [ ] Tree renders 500 nodes with no perceptible lag (virtualised list if needed)
- [ ] `svelte-dnd-action` failure gate: if Svelte 5 runes break DnD handlers → swap to `pragmatic-drag-and-drop` (Apache-2.0); document in ADR
- [ ] Tests: `docs.move` called on drop; moved node appears under new parent in next `docs.tree` response
- [ ] Tests: sort_position of dropped node is between the two adjacent siblings (midpoint check)
- [ ] Web: tree sidebar visible at `/docs`, `/docs/global`, `/projects/<id>/docs`; responsive collapse on narrow viewports
- [ ] CLI: `fulcrum docs tree --project <id> --json` returns nested structure with correct `children[]` arrays
- [ ] TUI: tree pane arrow-key navigable; `g` toggles scope; `Enter` opens reader; `n` opens create flow

## Blocked by
`05-doc-crud-trpc.md`

## Notes / Tech-stack hints
- Fractional indexing: midpoint = `(a + b) / 2`; rebalance triggers `docs.rebalance` (sequential integers) when gap < `2^-53`
- Tree virtualisation: if 500+ nodes cause render lag, use `svelte-virtual-list` around tree nodes
- svelte-dnd-action failure gate per PRD: pragmatic-drag-and-drop (Apache-2.0)
