# Repo Files

Sub-area of Integration Hub that exposes a **Repo**'s working-tree contents to read-only browsing surfaces: directory listings, file viewers, syntax-highlighted source, and per-line authorship.

## Language

**RepoFileRow**:
Serialized row of one indexed tree entry (file or directory) for a Repo+branch+path triple.
_Avoid_: TreeRow, Node, Entry.

**RepoFileContentRow**:
Materialized text payload of one **RepoFileRow** with `is_binary` and `encoding`.
_Avoid_: Blob, Source.

**RepoFileBlameRow**:
One line of `git blame` output for a path: line number, commit SHA, author, date, content.
_Avoid_: Annotation, AuthorshipLine.

**FileTreeNode**:
Recursive in-memory tree shape (`{kind: "file" | "dir", ...}`) built from `git ls-tree` for lazy directory rendering.
_Avoid_: DirNode, FsNode.

**MimeCategory**:
The closed render-decision label — `"image" | "text" | "binary"` — derived from MIME plus extension fallback.
_Avoid_: FileType, ContentKind.

**ShikiLang**:
The Shiki language id (`typescript`, `tsx`, `markdown`, …) mapped from a path's extension for client-side highlighting.
_Avoid_: Highlighter, Grammar.

## Relationships

- A **Repo** has many **RepoFileRows** (one per indexed path).
- A **RepoFileRow** of kind `file` has zero or one **RepoFileContentRow** and zero or more **RepoFileBlameRows**.
- Every **RepoFileRow** resolves to exactly one **MimeCategory**; only `text` and `image` categories load a **RepoFileContentRow**.
- A **FileTreeNode** tree is read live from the local **Repo** working tree (git CLI), independent of the indexed **RepoFileRows**.

## Example dialogue

> **Dev:** "Should the file viewer hit `RepoFileContentRow` or `git show` directly?"
> **Domain expert:** "Detail page uses **RepoFileContentRow** so we keep one source of truth and respect **MimeCategory**. The lightweight browse page falls back to live `git show` because it doesn't need blame or binary detection."

## Flagged ambiguities

- **RepoFileRow.kind `directory` vs `dir`** — DB stores `"dir"`; serialized row exposes `"directory"`. Translation happens in `serializeTreeEntry`; never leak `"dir"` across the application boundary.
- **MimeCategory `binary` vs `RepoFileContentRow.is_binary`** — category is the render decision (drives "skip content load"); `is_binary` is the persisted payload flag. They usually agree; on conflict, **MimeCategory** wins for UI gating.
