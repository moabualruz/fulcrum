# Reviews

Workbench-model assembly and event-sourced session persistence for code-review work over a diff. Owns the in-memory ReviewWorkbench shape plus save/load/annotate session actions; defers domain terms (Annotation, ReviewWorkbench, submission targets) to the parent context.

## Language

**ReviewWorkbenchSession**:
The event-sourced persistence form of a ReviewWorkbench, identified by `reviewId` and revisioned per change.
_Avoid_: Workbench state, review record, session blob.

**ReviewWorkbenchSessionType**:
The session kind tag — `plan`, `uat`, or `code_review` — that scopes how the session is loaded and rendered.
_Avoid_: Review kind, session category.

**SessionRevision**:
The monotonically-increasing integer attached to each save or annotation append for one `reviewId`.
_Avoid_: Version, generation, sequence.

**WorkbenchInput**:
The fully-normalized input record (files, annotations, viewed paths, search state) that `buildReviewWorkbenchModel` consumes to produce a ReviewWorkbenchModel.
_Avoid_: Workbench params, raw input.

**ReviewWorkbenchModel**:
The derived view object — file states, tree stats, annotation groups, suggestions, submission, live log, summary — returned to UI callers.
_Avoid_: Workbench view, render payload.

**FileTreeStats**:
The per-node rollup (annotationCount, searchMatchCount, viewed) computed for every directory and file in the diff tree.
_Avoid_: Tree counts, node summary.

**SubmissionTarget**:
A per-PR grouping of line-scoped fileComments plus a file-scoped body, produced by partitioning Annotations by `prUrl`.
_Avoid_: PR target, review payload.

**OrphanedFindings**:
Annotations excluded from any SubmissionTarget because they are `full-stack` scoped or unmapped across multiple PRs, exported as standalone markdown.
_Avoid_: Stray annotations, leftover comments.

**EditorAnnotation**:
A lightweight `{filePath, lineStart, lineEnd, comment?, selectedText?}` record sourced from the live editor and merged into the current-PR SubmissionTarget.
_Avoid_: Inline note, editor comment.

**LiveLog**:
The render-bounded tail of streaming review output, marked `isLive`, `truncated`, or `isWaiting` for the workbench summary.
_Avoid_: Log buffer, stream output.

## Relationships

- A **ReviewWorkbenchSession** holds one **WorkbenchInput** and emits one **ReviewWorkbenchModel** per save/load/annotate action.
- Each save or annotation append produces a new **SessionRevision** under the same `reviewId`.
- A **ReviewWorkbenchModel** carries one **FileTreeStats** map, many **SubmissionTarget**s, and zero or more **OrphanedFindings** groups.
- An **EditorAnnotation** is attached to the current-PR **SubmissionTarget** only when its `filePath` is in the current diff.
- A **LiveLog** belongs to one **ReviewWorkbenchModel** and reflects a single in-flight review stream.

## Example dialogue

> **Dev:** "When I append an Annotation, does the **SessionRevision** advance even if the model is unchanged?"
> **Domain expert:** "Yes — every save and annotation append writes a new event with `revision + 1`. The **ReviewWorkbenchModel** is rebuilt from the merged **WorkbenchInput** so the UI always sees the latest derived **FileTreeStats** and **SubmissionTarget**s."

## Flagged ambiguities

- **ReviewWorkbenchSession vs ReviewWorkbench** — the parent context's _ReviewWorkbench_ is the interactive surface concept. _ReviewWorkbenchSession_ is the persistence form used by save/load/annotate actions in this sub-area. Same workflow, different lifecycle stage.
- **WorkbenchInput vs ReviewWorkbenchInput** — the public TypeScript symbol is `ReviewWorkbenchInput`; the domain term in this CONTEXT is _WorkbenchInput_ to avoid stuttering with _ReviewWorkbenchModel_. They refer to the same shape.
- **EditorAnnotation vs Annotation** — _Annotation_ (parent context) is the full workbench finding with type/severity/suggestion. _EditorAnnotation_ is a thinner record from the editor that only resolves to an inline PR comment.
- **OrphanedFindings reason `full-stack` vs `unmapped`** — `full-stack` means the Annotation's `diffScope` is explicitly cross-layer. `unmapped` means there are multiple PRs in scope and the Annotation lacks a `prUrl`. Do not conflate.
