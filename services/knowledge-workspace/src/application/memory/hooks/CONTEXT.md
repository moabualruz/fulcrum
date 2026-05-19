# Memory Hooks

Sub-area of **Memory** that owns the lifecycle entry points which feed and consume **Memories**: pre-run context assembly, post-run heuristic capture, and doc-save extraction passes.

## Language

**ContextBundleArtifact**:
The JSON file at `.fulcrum/context.json` (overridable via `FULCRUM_CONTEXT_BUNDLE_PATH`) that **BeforeRunContextHook** writes for the agent runtime to read.
_Avoid_: Context file, bundle dump, run prep file.

**EmptyErrorBundle**:
The fallback **ContextBundle** shape `{ taskId, slices: [], tokenCount: 0, error }` emitted when **ContextAssembler** throws so the runtime always observes a readable file.
_Avoid_: Error fallback, empty context, null bundle.

**AfterDocSaveMemoryHook**:
The doc-save hook that runs three extraction passes (frontmatter keys, heading-section bullets, wikilinks) and writes deduplicated **Memories** plus a `MemoryLink` of `targetKind: "doc"`.
_Avoid_: Doc indexer, save hook, markdown extractor.

**FrontmatterPass**:
Extraction pass 1: maps recognized frontmatter keys (`decisions`, `blockers`, `links`, `status`, `tags`) to one **Memory** per scalar or array value.
_Avoid_: YAML pass, header pass.

**HeadingSectionPass**:
Extraction pass 2: walks `##`/`###` headings (`Decisions`, `Blockers`, `Action Items`) and emits one **Memory** per bullet line until the next heading.
_Avoid_: Section walker, bullet scrape.

**WikilinkPass**:
Extraction pass 3: collects `[[target]]` occurrences anywhere in the body and emits one `kind: "link"` **Memory** per match.
_Avoid_: Backlink pass, ref scrape.

**HighImportanceKinds**:
The fixed set `{ decision, blocker }` whose extracted **Memories** are stamped `importance: "high"`; all other tracked kinds default to `medium`.
_Avoid_: Priority kinds, important set.

## Relationships

- A **BeforeRunContextHook** invocation produces exactly one **ContextBundleArtifact**, either a real **ContextBundle** or an **EmptyErrorBundle**.
- An **AfterRunMemoryHook** invocation requires `ctx.orgId` and creates zero-or-more **Memories** plus one **MemoryLink** of `targetKind: "agent_run"` per new **Memory**.
- An **AfterDocSaveMemoryHook** invocation runs **FrontmatterPass**, **HeadingSectionPass**, and **WikilinkPass** in order and creates one **MemoryLink** of `targetKind: "doc"` per resulting **Memory**.
- **FrontmatterPass** and **HeadingSectionPass** stamp `importance: "high"` only when the produced kind is in **HighImportanceKinds**; **WikilinkPass** always stamps `medium`.

## Example dialogue

> **Dev:** "If frontmatter has `decisions: [A]` and the body also has `## Decisions\n- A`, do we end up with two **Memories**?"
> **Domain expert:** "No. **FrontmatterPass** and **HeadingSectionPass** both run, but the find-or-create on `(org, projectId, kind, body, source='heuristic')` collapses them to one row. The **MemoryLink** is also idempotent on `(memory, targetKind: 'doc', targetId)`."
> **Dev:** "And if **ContextAssembler** throws inside **BeforeRunContextHook**?"
> **Domain expert:** "We log a warning and still write an **EmptyErrorBundle** to `.fulcrum/context.json` — the runtime never sees a missing file."

## Flagged ambiguities

- **"Hook"** — three hooks live here with different signatures and triggers (run start, run end, doc save). Resolution: never say "the hook" in this area without a qualifier; name **BeforeRunContextHook**, **AfterRunMemoryHook**, or **AfterDocSaveMemoryHook** explicitly.
- **"Pass"** — only **AfterDocSaveMemoryHook** has named passes (**FrontmatterPass**, **HeadingSectionPass**, **WikilinkPass**); **AfterRunMemoryHook** delegates to **HeuristicExtractor** as a single step. Resolution: "pass" is a doc-save-only term; do not apply it to the run hook.
- **"sourceRef"** — **AfterRunMemoryHook** merges `{ run_id, ...candidate.sourceRef }` into the **Memory**'s `sourceRef`; **AfterDocSaveMemoryHook** writes `sourceRef: {}` and relies on the **MemoryLink** for provenance. Resolution: both are valid; the run hook embeds provenance in the row, the doc hook externalizes it to the link.
