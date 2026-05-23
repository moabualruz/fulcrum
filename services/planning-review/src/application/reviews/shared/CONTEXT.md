# Reviews: Shared

Cross-cutting primitives reused by review workbench actions: code-path detection in markdown, external annotation ingest/streaming, feedback template rendering, conventional review export, and diff-aware search indexing. Parent context owns workbench/session vocabulary; this sub-area only names the helpers themselves.

## Language

**CodeFilePath**:
A repository-relative path with a recognized code/config extension or known build-file basename, optionally suffixed with `:line` or `:line-line`.
_Avoid_: File ref, source link.

**CandidateCodePath**:
A `CodeFilePath` extracted from prose markdown via the renderer-matching precedence (fenced blocks stripped, URL ranges win, backtick spans collected, strict bare-prose paths deduped).
_Avoid_: Detected link, path hit.

**ExternalAnnotationEvent**:
The discriminated mutation envelope (`snapshot` / `add` / `remove` / `clear` / `update`) emitted to SSE subscribers when an `AnnotationStore` mutates.
_Avoid_: Annotation message, store delta.

**AnnotationStore**:
The in-memory, versioned collection of `StorableAnnotation`s with `add` / `remove` / `clearBySource` / `update` / `clearAll` / `onMutation` and a monotonic `version`.
_Avoid_: Annotation list, registry.

**PlanAnnotation**:
The plan-review ingest shape — block-offset note with type `DELETION` | `COMMENT` | `GLOBAL_COMMENT` — produced by `transformPlanInput`.
_Avoid_: Plan note, plan comment.

**ReviewAnnotation**:
The code-review ingest shape — `filePath` + `lineStart`/`lineEnd` + `side` + type/scope — produced by `transformReviewInput`.
_Avoid_: Review comment input, line note.

**ReviewFeedbackTemplate**:
A scoped (`workspace` | `planning` | `uat` | `code-review`), kinded (`missing-criteria`, `stale-context`, `prototype-mismatch`, `test-gap`, `code-risk`) body skeleton with named fields, rendered into a `RenderedReviewFeedbackTemplate`.
_Avoid_: Snippet, canned response.

**ConventionalLabel**:
The Conventional-Comments label (`praise`, `nitpick`, `suggestion`, `issue`, `todo`, `question`, `thought`, `chore`, `note`, `typo`, `polish`, …) prefixed onto an exported annotation body.
_Avoid_: Tag, marker.

**ConventionalDecoration**:
The Conventional-Comments severity decorator — `blocking`, `non-blocking`, or `if-minor` — appended in parens after the label.
_Avoid_: Severity tag, modifier.

**FeedbackDiffContext**:
The `{mode, base?, worktreePath?}` envelope describing which diff a review export was authored against (e.g. `uncommitted`, `staged`, `merge-base`, `jj-line`, `branch`).
_Avoid_: Diff scope, range descriptor.

**PullRequestMetadata**:
The platform-agnostic PR/MR descriptor (`platform`, `host`, `owner`, `repo`, `number`, `title`, `author`, `baseBranch`, `headBranch`, `baseSha`, `headSha`, `url`) headers exported feedback.
_Avoid_: PR info, repo meta.

**SearchableLine**:
A single diff line normalized for search — `filePath`, `side` (`addition` | `deletion` | `context`), `lineNumber`, optional `altLineNumber`, raw `text`, lowercased `normalizedText`.
_Avoid_: Diff row, indexed line.

**ReviewSearchMatch**:
One substring hit inside a `SearchableLine` with `matchStart`/`matchEnd` offsets and a context-padded `snippet`.
_Avoid_: Search hit, query result.

**ReviewSearchFileGroup**:
The per-file rollup of `ReviewSearchMatch`es preserving original diff `fileIndex`.
_Avoid_: File matches, grouped result.

## Relationships

- An **AnnotationStore** mutation emits one **ExternalAnnotationEvent** to every `onMutation` listener.
- `transformPlanInput` produces **PlanAnnotation**s; `transformReviewInput` produces **ReviewAnnotation**s — each stored in its own **AnnotationStore**.
- A **ReviewFeedbackTemplate**, populated with field values, renders one `RenderedReviewFeedbackTemplate` text used to seed an Annotation body.
- `exportReviewFeedback` consumes parent-context Annotations plus optional **PullRequestMetadata** and **FeedbackDiffContext**, applying **ConventionalLabel** + **ConventionalDecoration** prefixes per annotation.
- `buildSearchIndex` over diff files yields **SearchableLine**s; `findMatchesInIndex` returns **ReviewSearchMatch**es; `groupReviewSearchMatches` folds them into **ReviewSearchFileGroup**s.
- A **CandidateCodePath** is a **CodeFilePath** that passed renderer-precedence extraction from markdown.

## Example dialogue

> **Dev:** "When I POST to the review-annotations endpoint, what becomes a **ReviewAnnotation** versus a **PlanAnnotation**?"
> **Domain expert:** "`transformReviewInput` makes **ReviewAnnotation**s (needs `filePath`, `lineStart`, `lineEnd`, `side`, type in `comment|suggestion|concern`). `transformPlanInput` makes **PlanAnnotation**s (block-offset, type in `DELETION|COMMENT|GLOBAL_COMMENT`). Each goes to a separate **AnnotationStore**, and every mutation fans out as an **ExternalAnnotationEvent** over SSE."

## Flagged ambiguities

- **ReviewAnnotation (ingest) vs CodeReviewAnnotation (export) vs Annotation (parent)** — `ReviewAnnotation` is the validated wire-input shape from `transformReviewInput`. `CodeReviewAnnotation` is the richer export-time shape (with `conventionalLabel`, `decorations`, `prUrl`, `diffScope`) consumed by `exportReviewFeedback`. Parent _Annotation_ is the workbench-resident form. Same conceptual finding, three lifecycle shapes.
- **PlanAnnotation type vs ReviewAnnotation type** — `PlanAnnotation.type` uses uppercase constants (`DELETION`, `COMMENT`, `GLOBAL_COMMENT`). `ReviewAnnotation.type` uses lowercase (`comment`, `suggestion`, `concern`). The casing is intentional and not interchangeable.
- **ReviewFeedbackTemplate kind vs ConventionalLabel** — `kind` (`missing-criteria`, `code-risk`, …) classifies the template's purpose. `ConventionalLabel` (`nitpick`, `issue`, …) classifies a rendered annotation's tone. Templates do not set labels.
- **CodeFilePath vs CandidateCodePath** — `isCodeFilePath` validates a single string; `extractCandidateCodePaths` walks markdown with URL/backtick/fenced-block precedence and only returns strict (slash-containing) paths.
- **`SearchableLine.lineNumber` for deletions** — for `side: "deletion"` this is the **old**-side line number; for `side: "addition"` it is the **new**-side line number; for `side: "context"` it is the new-side number with `altLineNumber` carrying the old-side number. Do not assume one numbering scheme.
