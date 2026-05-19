# Context Assembly

Sub-area that builds a **ContextBundle** for an agent run by drawing a budgeted set of slices (memories, linked docs, recent runs, repo state, skill prompts) and persisting an immutable **ContextSnapshot** addressable from the run.

## Language

**ContextSlice**:
One budgeted section of a **ContextBundle** keyed by `ContextSliceKey` (`memories | linkedDocs | recentRuns | repoState | skillPrompts`), carrying rendered content, token count, and **ContextSourceRefs**.
_Avoid_: Section, chunk, block, part.

**ContextSliceKey**:
The enumerated identifier that selects a slice's weight in `CONTEXT_SLICE_WEIGHTS` and its allocation of the **TokenBudget**.
_Avoid_: Slice name, slot, kind.

**TokenBudget**:
The whitespace-token cap on a **ContextBundle** (default `DEFAULT_CONTEXT_TOKEN_BUDGET = 8192`) split across slices by `CONTEXT_SLICE_WEIGHTS`.
_Avoid_: Limit, max tokens, budget.

**ContextSourceRef**:
A typed `{ kind, id, reason, scope }` pointer attached to a **ContextSlice** for provenance back to a task, doc, memory, run, repo, or skill.
_Avoid_: Citation, ref, source, link.

**ContextSnapshot**:
The persisted record of a **ContextBundle** — bundle blob, token count, slice sizes — written once per assemble and addressable by `snapshotId`.
_Avoid_: Saved bundle, archive, history entry.

**ContextPreview**:
A read-only **ContextBundle** plus `scope`, `sourceRefs`, and `warnings` rendered for the UI before a run is invoked; never written as a **ContextSnapshot**.
_Avoid_: Dry run, preview bundle, draft.

**SkillContextBundle**:
A separate bundle of `SKILL.md` sections assembled from skill slugs with proportional character-based truncation; not stored as a **ContextSnapshot**.
_Avoid_: Skill pack, skill bundle (use the full term), skill section.

## Relationships

- A **ContextBundle** has exactly five **ContextSlices**, one per `ContextSliceKey`, summing to its `tokenCount`.
- A **ContextSlice** carries zero or more **ContextSourceRefs**; the bundle's `sourceRefs` is the union plus a `task` self-ref.
- Each `assemble` call produces one **ContextBundle** and writes exactly one **ContextSnapshot**, returning `{ bundle, snapshotId }`.
- A **TokenBudget** distributes across **ContextSlices** by `CONTEXT_SLICE_WEIGHTS` (memories 0.25 · linkedDocs 0.20 · recentRuns 0.35 · repoState 0.10 · skillPrompts 0.10).
- A **ContextPreview** reuses `loadContextBundle` but never persists; `previewContext` returns it for inspection only.
- A **SkillContextBundle** is assembled independently via `assembleSkillContext` and is not a **ContextSlice**.

## Example dialogue

> **Dev:** "If the recent-runs slice would overflow its allocation with transcripts, do we drop the slice?"
> **Domain expert:** "No — we render the same runs without transcripts. The **ContextSlice** stays, just shorter. We only drop **ContextSourceRefs** when the slice clips to empty."
> **Dev:** "And the **ContextSnapshot** records that?"
> **Domain expert:** "Yes — `sliceSizes` on the snapshot records the post-clip token count per slice, so a replay reproduces the same shape."

## Flagged ambiguities

- **"ContextBundle"** — `assemble.ts` defines the assembled five-slice bundle written to a **ContextSnapshot**; `queries.ts` defines a flatter preview bundle (`memories | documents | recentRuns | artifacts | tokenBudget`) used only by `previewContext`. Resolution: the assembled bundle is the canonical durable shape; the preview bundle is a UI projection and should be renamed `ContextPreviewBundle` when next touched.
- **"Scope"** — `ContextSourceRef.scope` uses `project | global | org`, while the preview's `ContextSourceRef.scope` uses only `project | global`. Resolution: align both on `project | global | org` when the preview bundle is reconciled; `org` is required for repo and skill refs.
- **"Token count"** — `estimateContextTokens` (assemble) counts whitespace tokens; `estimateTokens` (preview/skill) divides characters by 4. Resolution: keep both for now (different inputs), but never compare counts across the two estimators.
