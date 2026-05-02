# Docs & Editor Tools-Fit Report
_Stack: Bun + SvelteKit 2 + shadcn-svelte + PGlite + Tailwind v4 | Date: 2026-05-01_

---

## 1. Self-Hostable Wiki / Docs Platforms

| Name | License | Lang/Runtime | Last Release | Stars | Slice | Fit % | Notes |
|------|---------|--------------|--------------|-------|-------|-------|-------|
| **Outline** | BSL 1.1 ⚠️ | Node/React | Active 2025 | ~37k | Full wiki platform | 20% | BSL prohibits building a "Document Service"; needs OAuth OIDC + S3 — no local file storage; cannot embed. Learn-from only. |
| **Wiki.js** | MIT | Node/Vue | v3 stalled | ~26k | Full wiki | 15% | MIT clean; v3 DB-backed; Vue stack; heavy; no embeddable components; learn from data model |
| **BookStack** | MIT | PHP/Laravel | Active 2025 | ~16k | Full wiki | 10% | PHP — incompatible stack entirely; hierarchy model (shelves→books→chapters→pages) worth borrowing as schema pattern |
| **Logseq** | AGPL-3.0 ⚠️ | Clojure+JS | Active 2025 | ~42k | Graph PKM | 30% | AGPL viral; block-based data model + wikilinks/backlinks valuable; data layer not embeddable; study pattern only |
| **Trilium / TriliumNext** | AGPL-3.0 ⚠️ | Node | Active 2026 | ~28k total | Tree notes + backlinks | 25% | AGPL; rich attribute/relation model for agent-OS use; not embeddable; study note-tree schema |
| **AppFlowy** | MIT | Rust+Flutter | Active 2026 | ~67k | All-in-one workspace | 35% | MIT; no JS SDK to embed; collab layer (Yrs = Yjs port in Rust) worth noting; Flutter-first |
| **AFFiNE** | MIT | Node/React | Active 2026 | ~60k | Notion+Miro clone | 45% | MIT; closest to vision; block editor (BlockSuite) is separate package; React-only; exportable patterns |
| **HedgeDoc** | AGPL-3.0 ⚠️ | Node | Active 2025 | ~6k | Collab markdown pad | 20% | AGPL; markdown-only; no hierarchy; good for scratchpad concept |
| **Notea** | MIT | Node | Stale ~2022 | ~2k | Simple markdown | 5% | Abandoned; ignore |
| **MdBook** | MPL-2.0 | Rust | Active 2025 | ~19k | Static book gen | 10% | Presentation/static only; no edit; not relevant |
| **Docusaurus** | MIT | Node/React | Active 2026 | ~57k | Docs site gen | 5% | Presentation only; not relevant for editing layer |

**Verdict:** None fits >75% out-of-box. Build custom; borrow schema patterns from BookStack (hierarchy), Logseq (block+wikilink), AFFiNE's BlockSuite (block editor architecture).

---

## 2. Block Editors

| Name | License | Lang | Last Release | Stars | Svelte Support | Fit % | Notes |
|------|---------|------|--------------|-------|----------------|-------|-------|
| **TipTap v2** | MIT (core) | TS/framework-agnostic | Active 2026 | ~30k | Official Svelte guide + `svelte-tiptap` 3.0.1 + Tipex (Svelte 5 runes) | **92%** | Headless; ProseMirror-based; 10 formerly-Pro extensions now MIT-open-sourced (May 2026); collab via Hocuspocus (MIT); platform features (AI, version history, cloud docs) require paid Tiptap Cloud — but OSS core + own backend covers everything |
| **Milkdown** | MIT | TS | Active 2025 | ~9k | Official Svelte recipe | 75% | Plugin-driven WYSIWYG markdown; ProseMirror; lighter than TipTap; fewer Notion-style block features; 2nd fallback |
| **Lexical (+ svelte-lexical)** | MIT | TS | Active 2026 | 23k (core) + 570 (svelte-lexical) | `svelte-lexical` v0.6.4 Feb 2026 | 65% | Meta-backed; excellent reliability; Svelte port community-maintained; fewer extensions than TipTap ecosystem; 3rd fallback |
| **BlockNote** | MPL-2.0 core / GPL-3.0 XL ⚠️ | TS/React | Active 2026 | ~9.6k | React only — no Svelte support | 15% | Would need React island; XL packages (AI, multi-col, export) GPL; license friction; skip |
| **Editor.js** | Apache-2.0 | TS/Vanilla | v2.31.6 Apr 2026 | 31.7k | Vanilla JS — can mount in Svelte | 55% | Block-based JSON output; no ProseMirror; fewer rich-text features; no collab story; lower ceiling |
| **Quill** | BSD-3 | JS | Stale 2022 | ~43k | Vanilla — can mount | 25% | Old; Delta format; limited inline node types; stale; skip |
| **Slate** | MIT | TS/React | Active 2025 | ~30k | React only; Svelte port (svelte-slate) very thin | 20% | React-first; plugin API complex; community Svelte port unmaintained |
| **Plate** | MIT | TS/React | Active 2026 | ~12k | React-only | 10% | Built on Slate+React; React-only; skip |
| **Toast UI Editor** | MIT | TS | Stale 2022 | ~16k | Vanilla + wrapper | 20% | Markdown-centric; WYSIWYG limited; stale; skip |

**Winner: TipTap v2** — MIT core, official Svelte docs, Svelte 5 runes wrappers exist (Tipex, svelte-tiptap 3.0.1, Edra/ShadEditor), ProseMirror foundation, Hocuspocus collab, 92% fit.

---

## 3. Markdown Rendering / Sanitization

| Name | License | Stars | Notes | Fit % |
|------|---------|-------|-------|-------|
| **remark + unified** | MIT | ~8k remark | Pipeline: `remark-parse → mdast → remark-stringify`; plugins for GFM, frontmatter, math; renders to React/Svelte via `remark-rehype` + `rehype-svelte` | 85% |
| **micromark** | MIT | ~2k | Low-level tokenizer underpinning remark; use directly if need streaming or custom tokens | 70% |
| **marked** | MIT | ~33k | Fast; less extensible than unified; current stack usage | 50% |
| **markdown-it** | MIT | ~19k | Fast; good plugin ecosystem; simpler than unified pipeline | 60% |
| **DOMPurify** | MIT/Apache-2 | ~14k | Sanitize HTML output; keep alongside any renderer | 90% |
| **shiki** | MIT | ~11k | Syntax highlighting via TextMate grammars; runs in browser; replaces Prism/highlight.js | 88% |

**Pick:** `remark + unified + shiki + DOMPurify` for render-only views. TipTap handles the editing surface.

---

## 4. Wikilinks / Backlinks / Knowledge Graph

| Approach | License | Notes | Fit % |
|----------|---------|-------|-------|
| **Custom PGlite schema** (`links` table with `from_doc_id`, `to_slug`, `to_doc_id nullable`) | Own | Parse `[[wikilinks]]` at save time via remark plugin; store edges; query backlinks via SQL join | **90%** |
| **foam-bind patterns** | MIT | Foam is VSCode extension; no embeddable library; study bidirectional link resolution algorithm | 40% |
| **Logseq data layer patterns** | AGPL | Study graph-based query model; not embeddable | 30% |
| **Obsidian Bases** | Proprietary | Closed source; pattern-only inspiration | 0% |
| **vis-network / d3-force** | MIT / BSD | Render knowledge graph visually from PGlite edge data | 80% |

**Verdict:** Build own wikilink layer. Remark plugin (`[[…]]` → mdast node) + PGlite `doc_links` table + vis-network graph view. ~200 lines total.

---

## 5. Real-Time Collaboration

| Name | License | Stars | Runtime | Notes | Fit % |
|------|---------|-------|---------|-------|-------|
| **Yjs** | MIT | ~18k | Browser/Node/Bun | De-facto standard; integrates with TipTap via `@tiptap/extension-collaboration`; CRDT | **90%** |
| **Hocuspocus** | MIT | ~2.5k | Node/Bun/Deno/CF Workers | Yjs WebSocket backend by TipTap team; v4.0.0 released 2026; PGlite persistence adapter possible | **88%** |
| **Y-WebRTC** | MIT | ~3k | Browser P2P | Serverless collab via WebRTC signaling; good for offline-first local-only mode | 75% |
| **Loro** | MIT | ~5.3k | Rust+WASM | Newer CRDT; rich-text support; v1.10.5 Jan 2026; Lexical binding exists; lower ecosystem maturity | 50% |
| **Automerge** | MIT | ~17k | Rust+WASM | Automerge 3 with 10× memory reduction; Ink & Switch backing; less TipTap integration | 45% |
| **Liveblocks** | Commercial | N/A | Hosted SaaS | No self-host; skip | 0% |

**Pick:** Yjs (CRDT layer) + Hocuspocus (WebSocket server, runs in Bun). Y-WebRTC for local/offline P2P fallback.

---

## 6. Document Storage / Versioning

| Tool | License | Stars | Notes | Fit % |
|------|---------|-------|-------|-------|
| **jsondiffpatch** | MIT | ~5k | Diff/patch JSON block documents; LCS array diffing; HTML delta visualizer; ESM only | **85%** |
| **PGlite snapshots** | MIT | — | Store full doc snapshot per save + delta as jsondiffpatch output in `doc_versions` table | **90%** |
| **mdast-util-from-markdown** | MIT | ~1k | Parse stored markdown back to AST for diffing at AST level | 70% |
| **deep-diff** | MIT | ~3k | Alternative to jsondiffpatch; less featureful | 50% |

**Pick:** PGlite `doc_versions(id, doc_id, version_num, snapshot jsonb, delta jsonb, created_at)` + jsondiffpatch for delta generation.

---

## 7. Comments / Threads / Mentions

| Approach | License | Notes | Fit % |
|----------|---------|-------|-------|
| **Custom on Yjs + TipTap thread extension** | MIT (TipTap OSS) | TipTap comment extension was Pro; now open-sourced (May 2026); marks text range, stores thread ID in Yjs; query threads from PGlite | **85%** |
| **Liveblocks Comments** | Commercial | Hosted; no self-host | 0% |
| **Custom PGlite `comments` table** | Own | Anchor: `(doc_id, block_id, char_offset, length)`; threads → replies; mentions → `@agent` / `@user` FK | **90%** |

**Pick:** Build own comment/thread schema in PGlite; use TipTap's newly-open-sourced comment annotation marks for UI anchoring.

---

## 8. File Attachments / Media

| Approach | License | Notes | Fit % |
|----------|---------|-------|-------|
| **Local filesystem via Bun `Bun.file()`** | MIT (Bun) | Serve static files; store path in PGlite `attachments` table; no S3 dependency for personal use | **90%** |
| **MinIO (S3-compatible)** | AGPL-3.0 ⚠️ | Self-hosted S3; required if multi-user deployment; AGPL flag for server-side | 60% |
| **TipTap Image/File nodes** | MIT | Custom `NodeView` for file attachments; image resize handles; drag-drop | **88%** |
| **Upload via Bun HTTP server** | MIT | `POST /api/upload` → Bun streams to `./attachments/{doc_id}/`; UUID filename | **90%** |

**Pick:** Bun local FS + TipTap custom media nodes. Add MinIO path if deployment goes multi-user.

---

## 9. Math / Diagrams / Embeds

| Tool | License | Stars | Svelte | Notes | Fit % |
|------|---------|-------|--------|-------|-------|
| **KaTeX** | MIT | ~18k | Vanilla | Math rendering; TipTap KaTeX extension available; fast vs MathJax | **90%** |
| **Mermaid** | MIT | ~73k | Vanilla | Flowcharts, sequences, Gantt from text; TipTap Mermaid node via code fence + render | **88%** |
| **Excalidraw** | MIT | ~90k | React (svelte-excalidraw-wrapper exists) | Sketches; embed as React island in SvelteKit; MIT clean | **75%** |
| **tldraw** | Custom ⚠️ | ~40k | React | Production requires paid license key; skip for now; keep as fallback | 30% |
| **Sandpack** | Apache-2.0 | ~5k | React island | Code sandbox embeds; React-only; iframe option | 55% |

**Pick:** KaTeX + Mermaid (both via TipTap custom nodes). Excalidraw via React island for sketch blocks.

---

## 10. Search

| Tool | License | Stars | Runtime | Notes | Fit % |
|------|---------|-------|---------|-------|-------|
| **PGlite FTS (tsvector/tsquery)** | MIT (PGlite) | ~10k | In-browser WASM | Already in stack; covers full-text; BM25 via `pg_textsearch` extension TBD in PGlite roadmap; works offline | **80%** |
| **Orama** | Apache-2.0 | ~9k | Browser/Edge | In-process; full-text + vector + hybrid; <2kb; no server needed; excellent for offline-first | **88%** |
| **Meilisearch** | MIT | ~50k | Server | Fast; typo-tolerant; requires separate process; overkill for personal | 55% |
| **Typesense** | GPL-3.0 ⚠️ | ~22k | Server | GPL flag; requires server; skip | 20% |
| **Pagefind** | MIT | ~4k | Static/build-time | Build-time indexing; wrong model for dynamic docs | 20% |

**Pick primary:** Orama (Apache-2.0, in-browser, no server) for interactive search. PGlite FTS as structured query layer. Meilisearch if deployment grows to team-scale.

---

## 11. Doc Taxonomy / Hierarchy

| Pattern | Notes | Fit % |
|---------|-------|-------|
| **Adjacency list** (`parent_id` FK on `docs`) | Simple; easy CRUD; recursive CTEs in PGlite for breadcrumbs/subtrees; standard Postgres pattern | **85%** |
| **Materialized path** (`path text` like `/proj/a/b`) | Fast prefix queries; complex on moves; good for read-heavy | 65% |
| **Nested set** (lft/rgt integers) | Fastest tree reads; painful writes; avoid | 30% |
| **Closure table** | Best for arbitrary depth queries; 2 tables; moderate complexity | 70% |

**Pick:** Adjacency list + recursive CTE in PGlite. Add closure table if query complexity grows.

---

## Recommended Architecture

### Layer Map

```
[User / AI Agent]
       │
       ▼
[SvelteKit 2 Route]
       │
       ├─── Editor Surface: TipTap v2 (MIT)
       │         ├── svelte-tiptap 3.0.1 OR Tipex (Svelte 5 runes)
       │         ├── Extensions: StarterKit, Collaboration, Comment (MIT),
       │         │              KaTeX, Mermaid, Image, File, Wikilink (custom)
       │         └── Collab: Yjs document bound to TipTap
       │
       ├─── CRDT/Collab: Yjs + Hocuspocus (Bun WebSocket server)
       │         └── Y-WebRTC fallback (P2P offline)
       │
       ├─── Render (read-only views): remark + unified + shiki + DOMPurify
       │
       ├─── Search: Orama (in-process) + PGlite FTS
       │
       ├─── Storage: PGlite
       │         ├── docs(id, slug, title, content jsonb, parent_id, project_id, doc_type, created_at, updated_at)
       │         ├── doc_versions(id, doc_id, version_num, snapshot jsonb, delta jsonb, author_id, created_at)
       │         ├── doc_links(from_id, to_slug, to_id nullable, link_type)  ← wikilinks graph
       │         ├── comments(id, doc_id, block_id, range jsonb, thread_id, body text, author_id, mentions jsonb)
       │         └── attachments(id, doc_id, filename, mime_type, path text, size int)
       │
       └─── File serve: Bun.file() static handler
```

### Specific Picks Per Layer

| Layer | Pick | License | Failure Gate |
|-------|------|---------|--------------|
| Block editor | TipTap v2 + svelte-tiptap / Tipex | MIT | Svelte 5 runes compat issue → use Tipex; TipTap abandons Svelte → Milkdown (MIT, 2nd) → svelte-lexical (MIT, 3rd) |
| CRDT | Yjs | MIT | Yjs corruption bug → Automerge 3 (MIT); P2P only → Y-WebRTC |
| Collab server | Hocuspocus v4 (Bun) | MIT | Hocuspocus unmaintained → custom Bun WebSocket + y-websocket protocol directly |
| Markdown render | remark + unified | MIT | unified pipeline complexity → markdown-it (MIT, simpler, 2nd) |
| Syntax hl | shiki | MIT | shiki WASM size > budget → Prism (MIT, 2nd) |
| Search | Orama | Apache-2.0 | Orama index size > 50MB RAM → Meilisearch sidecar (MIT, 2nd); PGlite FTS always available as fallback |
| Versioning | PGlite snapshots + jsondiffpatch | MIT | jsondiffpatch too slow on large docs → store full snapshots only; add GC policy |
| Math | KaTeX | MIT | KaTeX missing glyph → MathJax (Apache, slower, 2nd) |
| Diagrams | Mermaid | MIT | Mermaid CVE recurrence → sandboxed iframe render |
| Sketch embed | Excalidraw (React island) | MIT | tldraw (custom license, paid prod key) → skip; draw.io web embed → 3rd |
| Storage | PGlite | MIT | PGlite WASM size / OPFS limits → SQLite via `sql.js` (MIT, 2nd) |
| Hierarchy | Adjacency list + recursive CTE | — | Move to closure table if >10k nodes |

---

## Must-Write-Ourselves Gaps (Agent-OS Specific)

These are not covered by any existing library and require custom implementation:

1. **Wikilink TipTap extension** — Custom `NodeView` that parses `[[Page Title]]`, resolves via PGlite slug lookup, renders as linked chip; on-save extracts all wikilinks → upserts `doc_links` rows. ~300 lines.

2. **`@agent` mention extension** — TipTap mention node extended to distinguish `@agent:<agent_id>` vs `@user:<id>`; stores in comment `mentions jsonb`; triggers agent notification hook. ~150 lines.

3. **Agent-context extraction hooks** — On doc save: extract headings + wikilinks + mentions → produce a `doc_context` summary (for agent memory layer); store as `docs.context_summary text`; feed to embedding pipeline. ~200 lines.

4. **Task/run backlink injection** — When an agent run or task references a doc slug, write a `doc_links` row of type `run_reference`; doc shows "Referenced by 3 runs" in sidebar. ~100 lines PGlite schema + Bun event handler.

5. **Version timeline UI** — Browse `doc_versions`, reconstruct doc at any version via jsondiffpatch `unpatch`, show diff visual. No off-shelf Svelte component exists for this. ~400 lines.

6. **Doc-type system** — `doc_type` enum (`runbook`, `spec`, `adr`, `scratch`, `wiki`) drives different editor toolbar configs, required fields, and routing. Registry pattern in SvelteKit. ~200 lines.

7. **Per-project doc tree with drag-drop reorder** — Adjacency list CRUD + Svelte drag-drop for sidebar tree; no complete Svelte tree-with-DB-persistence component exists. ~300 lines.

8. **Offline-first sync via Y-WebRTC** — When Hocuspocus unreachable, switch to WebRTC peer signaling; merge on reconnect. ~150 lines glue code.

Total estimated custom code: **~1,800 lines** across 8 modules.

---

## License Flags Summary

| Tool | License | Action |
|------|---------|--------|
| Outline | BSL 1.1 | Do not use; study patterns only |
| Logseq | AGPL-3.0 | Do not embed; study patterns only |
| TriliumNext | AGPL-3.0 | Do not embed |
| HedgeDoc | AGPL-3.0 | Do not embed |
| MinIO | AGPL-3.0 | Server-side only; AGPL applies if distributed |
| Typesense | GPL-3.0 | Skip; use Orama or Meilisearch |
| tldraw | Custom | Production requires paid key; use Excalidraw (MIT) instead |
| BlockNote XL | GPL-3.0 | XL packages only; core MPL-2.0 OK but React-only anyway |

All primary picks (TipTap, Yjs, Hocuspocus, Orama, remark, shiki, KaTeX, Mermaid, Excalidraw, jsondiffpatch, PGlite) are MIT or Apache-2.0. Clean stack.
