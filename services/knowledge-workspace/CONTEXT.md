# Knowledge Workspace

Bounded service for human- and agent-authored knowledge: hierarchical **Documents** with rich content, durable **Memories** captured from work, and a unified **Search Index** that fans out across docs, memories, tasks, runs, and artifacts.

## Language

### Document surface

**Document**:
A versioned, hierarchical knowledge artifact with a title, frontmatter, body content, and a `DocType` (spec, adr, wiki, runbook, meeting, postmortem, rfc, note, scratch).
_Avoid_: Page (reserved for tree nodes), Note (reserved for `DocType: note`), Article, File, Wiki.

**DocType**:
The enumerated kind of a **Document** that selects its `Frontmatter` schema and template seed.
_Avoid_: Category, template, content type.

**Frontmatter**:
A typed, Zod-validated key/value block at the head of a **Document**, schema-selected by `DocType`.
_Avoid_: Metadata, header, properties, front matter.

**PageTree**:
The ordered hierarchy of **Documents** rooted in a `SpaceId`, built from `parentPageId` and fractional `position` keys.
_Avoid_: Sidebar tree, doc tree, navigation, sitemap.

**Revision**:
An immutable snapshot of a **Document**'s body and frontmatter persisted on save, addressable for diff and restore.
_Avoid_: Version (the DTO type is `DocVersion`, but the domain concept is Revision), history entry, change.

**Wikilink**:
A `[[slug]]`-style reference embedded in a **Document**'s content that resolves to another **Document** and produces a `Backlink`.
_Avoid_: Internal link, cross-ref, mention (mentions target users).

**Backlink**:
A directional edge between two **Documents** materialized from a `Wikilink`, queried as `incoming` or `outgoing` and filtered by page permissions.
_Avoid_: Inbound link, reverse link, related doc.

**Comment**:
A reply-one-level-deep thread anchored to a **Document**, optionally tied to a Yjs relative-position selection for inline placement.
_Avoid_: Annotation, note (overloaded), discussion.

### Memory surface

**Memory**:
A small, typed, importance-ranked fact captured from agent runs or human edits — note, decision, blocker, file_ref, section_anchor, link, or fact — scoped to org and optionally project.
_Avoid_: Note (overloaded with `DocType: note`), fact (one `MemoryKind`, not the umbrella), memo, snippet.

**MemoryKind**:
The enumerated category of a **Memory** that drives extraction heuristics and retrieval boosts.
_Avoid_: Type (overloaded with `DocType`), category, tag.

**Importance**:
A `low | medium | high` ranking on a **Memory** that biases hybrid retrieval scoring.
_Avoid_: Priority, weight, rank.

**SourceRef**:
A typed pointer on a **Memory** to its origin — task, doc, agent_run, or artifact — used for provenance and back-navigation.
_Avoid_: Origin, parent, source.

**ContextBundle**:
An assembled set of **Memories** and **Document** excerpts returned to an agent run before invocation.
_Avoid_: Prompt context, retrieval pack, briefing.

### Search surface

**SearchHit**:
A unified result row carrying `source_kind`, score, provenance, and `linkedCounts` across docs, runs, memories, artifacts, and audit entries.
_Avoid_: Result, match, row.

**Indexer**:
A per-source-kind component (`document`, `memory`, `task`, `run`, `artifact`, `sprint`, `repo`) that emits indexable records into the **SearchIndex**.
_Avoid_: Crawler, ingester, builder.

**Scope**:
The org/project boundary applied to a search: `current` (active project), `all` (every project in org), or `global` (org-wide non-project).
_Avoid_: Filter, namespace, visibility.

**SavedSearch**:
A named, persisted **SearchParams** tuple (`q`, `kinds`, `dateFrom`, `dateTo`) re-runnable from the UI.
_Avoid_: Bookmark, query, filter preset.

## Relationships

- A **Document** belongs to exactly one `SpaceId` and has zero or one parent **Document** (forming the **PageTree**).
- A **Document** has many **Revisions**, many **Comments**, and many **Wikilinks**; **Wikilinks** materialize as **Backlinks** in the opposite direction.
- A **Document**'s `DocType` selects exactly one **Frontmatter** schema from `FrontmatterSchemaMap`.
- A **Comment** has zero or one parent **Comment** (replies are flat — no reply-to-reply).
- A **Memory** belongs to one org, optionally one project, has one **MemoryKind**, one **Importance**, and zero or one **SourceRef**.
- A **ContextBundle** aggregates many **Memories** plus excerpts from many **Documents** for one agent run.
- The **SearchIndex** ingests from many **Indexers**; each **Indexer** owns one `source_kind` and emits **SearchHits** scoped by org/project.
- A **SavedSearch** belongs to one org and replays one **SearchParams** tuple.

## Example dialogue

> **Dev:** "When an agent run finishes and we extract a 'decided X over Y' line, is that a **Memory** or do we write a new **Document**?"
> **Domain expert:** "A **Memory** of kind `decision`, with the run as its **SourceRef**. We only write a **Document** when a human curates it — typically an ADR. The decision Memory may later be cited from that ADR via a **Wikilink**."
> **Dev:** "And the **PageTree** shows both?"
> **Domain expert:** "No — the **PageTree** is **Documents** only. Memories surface through search, retrieval, and the **ContextBundle**; they never appear as tree nodes."

## Flagged ambiguities

- **"Page" vs "Document"** — `FulcrumDocTreePage` and `parentPageId` use "page" historically, but the domain concept is **Document**; "page" is reserved for **PageTree** nodes (the same Document viewed as a tree entry). Code keeps `pageId` for tree/comment plumbing; new APIs and docs say **Document**.
- **"Note"** — overloaded between `DocType: note` (a curated **Document** kind) and a `MemoryKind: note` (a captured **Memory**). Resolution: a Note **Document** is human-authored long-form; a Note **Memory** is a short captured fact. They are distinct entities.
- **"Type"** — `DocType` and `MemoryKind` are both "type-like" enums. Resolution: never say "type" unqualified; always `DocType` or `MemoryKind`.
- **"Version" vs "Revision"** — the persisted DTO is `DocVersion` but the conceptual entity is **Revision**. Resolution: keep `DocVersion` in code; use **Revision** in prose and ADRs.
- **"Link"** — covers **Wikilink** (doc→doc, slug-resolved), `LinkKind: mention` (doc→user), `task_ref`/`run_ref` (doc→external entity), and **Memory** `SourceRef` (memory→origin). Resolution: never say "link" alone; always name the variant.
- **"Scope"** — appears in `Scope` enum (`project | global` on Documents/Memories) and **Search** `Scope` (`current | all | global`). Resolution: qualify as "doc scope" or "search scope" when both could apply.
