# Docs

Document-surface application code: command/query handlers, version pipeline, wikilink sync, frontmatter validation, sanitisation, narration, embeddings, and real-time collaboration providers behind the `Document` entity.

## Language

**Snapshot**:
A full `contentJson` row written to a `DocVersion` on cadence, first save of day, or oversize-delta fallback — anchors `Revision` reconstruction.
_Avoid_: Baseline, checkpoint, full version.

**Delta**:
A ProseMirror Step JSON (or legacy full-value op) stored on a non-snapshot `DocVersion`, replayed forward from the last `Snapshot` to rebuild a `Revision`.
_Avoid_: Diff (reserved for visible HTML diff), patch, op.

**SnapshotCadence**:
The N-versions-between-snapshots interval (`DOC_SNAPSHOT_EVERY`, default 10) that decides whether a save writes a `Snapshot` or a `Delta`.
_Avoid_: Interval, frequency, schedule.

**RestoreOf**:
A pointer on a freshly written `DocVersion` to the source version it reproduces, set when a user restores an older `Revision`.
_Avoid_: Revert source, parent version, base.

**TemplateSeed**:
A built-in, in-memory `DocTemplateRow` per `DocType` used as fallback when no DB template exists for the org/project.
_Avoid_: Default template, preset, stub template.

**Narration**:
An LLM-generated executive summary prepended to eligible `DocType`s (`adr`, `postmortem`, `rfc`) as a quoted `[AI Summary]` block in `bodyMd` plus a `narration-block` node in `contentJson`.
_Avoid_: Summary (overloaded with `ContextSummary`), AI blurb, header.

**ContextSummary**:
A `{ headings, wikilinks, mentions }` triple extracted from `bodyMd` for agent retrieval — distinct from `Narration` (human-facing) and `ContextBundle` (assembled output).
_Avoid_: Summary, outline, index entry.

**Embedding**:
A `real[384]` vector written async to `documents.embedding` by the gated inference sidecar pipeline; OFF when `FULCRUM_FEATURES` lacks `embeddings`.
_Avoid_: Vector, encoding, semantic index.

**CollabProvider**:
A pair of Yjs transports for a `Document` — always-on `y-indexeddb` for offline plus optional `HocuspocusProvider` WebSocket gated behind `real-time-collab-server`.
_Avoid_: Sync server, websocket, realtime.

**SanitizedHtml**:
Output of `sanitizeDocHtml` — an allow-listed tag/attribute subset of rendered `bodyMd` safe for read-only display.
_Avoid_: Clean HTML, rendered doc, escaped html.

## Relationships

- A **Document** save produces exactly one `DocVersion`, which is either a **Snapshot** or a **Delta** decided by **SnapshotCadence** plus the slow-delta fallback.
- A `Revision` reconstructs by loading the nearest preceding **Snapshot** then replaying every intermediate **Delta** forward.
- A restore writes a new `DocVersion` whose **RestoreOf** points at the source `Revision`; it is itself either **Snapshot** or **Delta** under normal cadence.
- A `DocType` resolves a `DocTemplateRow` via `DocTemplateService`; absence falls back to the matching **TemplateSeed**.
- A save on an eligible `DocType` runs `applyNarrationToDoc`, which strips the old **Narration** and prepends a new one to both `bodyMd` and `contentJson`.
- A save fires-and-forgets `triggerEmbedding`, writing an **Embedding** when the feature flag is on; failure logs a warning and leaves prior value intact.
- A save runs `syncDocWikilinks`, which replaces the document's outgoing `DocLink` rows from extracted **Wikilink** slugs and re-resolves their target `Document`s.
- A web/editor session opens one **CollabProvider** result per `docId`; the WS leg activates only when the flag is on.

## Example dialogue

> **Dev:** "If we restore version 3 of a doc that's now on version 12, what gets written?"
> **Domain expert:** "A new `DocVersion` at versionNum 13 with **RestoreOf** pointing at version 3's id. Whether it's a **Snapshot** or **Delta** still follows **SnapshotCadence** — restore doesn't bypass cadence."
> **Dev:** "And reconstructing version 7 later — does it know about the restore?"
> **Domain expert:** "No. Reconstruct walks from the latest **Snapshot** at or before 7 and applies **Delta**s forward. **RestoreOf** is provenance, not a reconstruction edge."

## Flagged ambiguities

- **"Summary"** — overloaded between **Narration** (LLM-generated, user-visible, ADR/RFC/postmortem only) and **ContextSummary** (mechanical headings/wikilinks/mentions extraction for agents). Resolution: never say "summary" unqualified.
- **"Delta"** — covers both the ProseMirror-Step path and a legacy full-value op shape stored in the same column; both reconstruct identically via `applyDelta`. Resolution: prose says **Delta**; storage shape is an implementation detail.
- **"Template"** — `DocTemplateRow` may be a DB row or a built-in **TemplateSeed** with a synthetic `builtin-doc-template-<docType>` id. Resolution: callers treat them identically; only the seed path is immutable.
- **"Diff"** — `diffDocVersionsHtml` produces a visible `<del>/<ins>` HTML payload; this is distinct from a **Delta** (storage step). Resolution: **Diff** is rendered output, **Delta** is stored input.
