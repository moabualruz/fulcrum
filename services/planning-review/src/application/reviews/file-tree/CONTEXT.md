# Reviews: File Tree

Pure tree construction over a flat list of diff files: builds a sorted, depth-stamped, single-child-collapsed hierarchy plus the helpers that map back to file order, ancestor paths, and folder paths.

## Language

**DiffFile**:
A single changed file in the review diff, carrying `path`, optional `oldPath`, `patch`, and `additions`/`deletions` counts.
_Avoid_: Changed file, patch entry, file diff.

**FileTreeNode**:
One node in the rendered hierarchy — either a `file` (with `fileIndex` back into the input array) or a `folder` (with `children` and rolled-up additions/deletions).
_Avoid_: Tree entry, diff node.

**Trie**:
The internal path-segment map used as an intermediate representation before emitting **FileTreeNode**s.
_Avoid_: Path map, prefix tree.

**SingleChildCollapse**:
The pass that fuses any folder whose only child is another folder into a slash-joined name (e.g. `src/app`).
_Avoid_: Path compression, folder merge.

**RootUnwrap**:
The final step that drops a sole top-level folder when all its children are files, hoisting them to depth 0.
_Avoid_: Root strip, top flatten.

**VisualFileOrder**:
The left-to-right sequence of original `fileIndex` values produced by a depth-first walk of the rendered tree.
_Avoid_: Render order, tree order.

**AncestorPaths**:
The list of folder paths between the repo root and a given file path, excluding the file itself.
_Avoid_: Parent paths, breadcrumbs.

## Relationships

- A **DiffFile** array is funneled through a **Trie**, emitted as **FileTreeNode**s, then rewritten by **SingleChildCollapse** and optionally **RootUnwrap**.
- Each `file` **FileTreeNode** carries one `fileIndex` pointing back into the original **DiffFile** array; **VisualFileOrder** is the permutation of those indices.
- A folder **FileTreeNode**'s `additions`/`deletions` equal the sum of its descendants' counts.
- **AncestorPaths** for a file's `path` are a subset of the folder paths returned by walking the rendered tree.

## Example dialogue

> **Dev:** "Why does `src/app/foo.ts` sometimes render as one node `src/app` and sometimes as nested folders?"
> **Domain expert:** "**SingleChildCollapse** fuses a folder with exactly one folder child. As soon as a sibling appears under `src/`, the collapse stops and `src/` and `app/` render as separate **FileTreeNode**s."

## Flagged ambiguities

- **FileTreeNode vs FileTreeStats** — _FileTreeNode_ (this sub-area) is the structural node produced from diff paths. _FileTreeStats_ (parent context) is the per-node rollup of annotations, viewed flags, and search matches layered on top later. Do not conflate.
- **DiffFile vs ReviewTreeDiffFile** — the exported TypeScript symbol is `ReviewTreeDiffFile`; the domain term in this CONTEXT is _DiffFile_ for brevity. Same shape.
- **VisualFileOrder vs input order** — the input **DiffFile** array order is the caller's order; **VisualFileOrder** is the post-sort, post-collapse traversal order. Use **VisualFileOrder** for next/prev navigation, never the raw input index.
