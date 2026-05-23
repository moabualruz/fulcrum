# Doc Links

Persistence helpers that materialize **Wikilink** edges between **Documents** as rows in the `doc_links` table and answer **Backlink** queries against schema variants.

## Language

**DocLinkRow**:
A single row in the `doc_links` table recording one directed edge from a source **Document** to a target **Document** with a link kind.
_Avoid_: Edge record, link entry, join row.

**UpsertDocLinkInput**:
The input tuple (`orgId`, `sourceDocId`, `targetDocId`, `linkType`) used to insert a **DocLinkRow** idempotently per org.
_Avoid_: Link payload, create link DTO.

**DocLinkColumns**:
The resolved physical column names (`from_doc_id`/`source_doc_id`, `to_doc_id`/`target_doc_id`, `link_kind`/`link_type`, optional `to_slug`) for the live `doc_links` schema variant.
_Avoid_: Column map, schema shape.

## Relationships

- An **UpsertDocLinkInput** produces at most one **DocLinkRow** per (`orgId`, source, target, linkType) tuple.
- A **DocLinkRow** is the persisted form of one **Wikilink** and is read back as one **Backlink** when queried in the reverse direction.
- **DocLinkColumns** is resolved once per call from `information_schema` and parameterizes every **DocLinkRow** read and write.

## Example dialogue

> **Dev:** "Why do we look up **DocLinkColumns** before every upsert instead of hard-coding `from_doc_id`?"
> **Domain expert:** "Older migrations shipped `source_doc_id`/`target_doc_id`/`link_type`; newer ones use `from_doc_id`/`to_doc_id`/`link_kind` plus `to_slug`. Resolving columns from `information_schema` lets one query path serve both schemas until the migration converges."

## Flagged ambiguities

- **"linkType" vs "link_kind"** — the input field is `linkType` and the legacy column is `link_type`, but the current column is `link_kind`. Resolution: keep `linkType` in TypeScript; `resolveDocLinkColumns` maps it to whichever physical column exists.
- **"source/target" vs "from/to"** — application code says `sourceDocId`/`targetDocId`; the newer schema uses `from_doc_id`/`to_doc_id`. Resolution: application terms stay source/target; column names are resolved per-call.
