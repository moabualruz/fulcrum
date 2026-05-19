# Artifacts

Sub-area vocabulary for the application-layer commands and queries that catalog **Artifact** rows and walk them through their lifecycle. Sharpens the parent `workflow-coordination` glossary with sub-area-only terms.

## Language

**LifecycleState**:
The `metadataJson.lifecycleState` value on an **Artifact** — one of `created`, `pending_review`, `accepted`, `rejected`, `linked`, `promoted`, `archived`, `expired`.
_Avoid_: status, phase, stage.

**RunArtifact**:
An **Artifact** addressed via its owning `runId` (the `linkRunArtifactToDoc`, `promoteRunArtifactToMemory`, `archiveRunArtifact` commands operate on this projection).
_Avoid_: run output, run file.

**ArtifactRow**:
The flat read-model row returned by `listArtifactRows` / `getArtifactDetail`, with `kind`, `body_path`, `sha256`, `size`, `archived` resolved across legacy column variants.
_Avoid_: artifact record, row DTO.

**ArtifactDetail**:
An **ArtifactRow** enriched with `content` (when text mime), `downloadHref`, and `retentionDaysRemaining`.
_Avoid_: full artifact, expanded artifact.

**ColumnShim**:
The runtime `information_schema` probe that picks the live column name (`body_path` vs `path`, `sha256` vs `checksum_sha256`, `size` vs `size_bytes`) for **ArtifactRow** projection.
_Avoid_: column map, schema adapter.

## Relationships

- An **Artifact** carries exactly one **LifecycleState** in `metadataJson`; every command mutation stamps `lifecycleChangedAt`.
- A **RunArtifact** is an **Artifact** with a non-null `runId`; lifecycle commands (`link`, `promote`, `archive`) require both `runId` and `artifactId`.
- `listArtifactRows` and `getArtifactDetail` produce **ArtifactRows** via the **ColumnShim**; `getArtifactDetail` then enriches one into an **ArtifactDetail**.
- An **ArtifactDetail** with `mime` starting `text/` resolves `content` by reading the on-disk `body_path` through `assertArtifactPathInRoot`.

## Example dialogue

> **Dev:** "When `linkRunArtifactToDocForWeb` runs, what changes on the **Artifact**?"
> **Domain expert:** "Its **LifecycleState** flips to `linked`, `metadataJson.linkedDocId` is set, and `lifecycleChangedAt` is stamped. The row is still the same **RunArtifact** — we only patch `metadata_json` via the **ColumnShim**-aware update."

## Flagged ambiguities

- "Artifact" vs "ArtifactRow" vs "ArtifactDto" — resolved: domain **Artifact** is the entity; **ArtifactRow** is the SQL read-model; `ArtifactDto` is the serialized TypeORM entity returned by `serializeArtifact`. They are not interchangeable.
- "archived" — column flag and **LifecycleState** value share the name; the column is the boolean of record, the **LifecycleState** mirror is informational.
