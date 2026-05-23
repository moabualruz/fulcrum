# Saved Views

Application area that owns the SavedView CRUD surface and the filter-query AST those views serialize into. Sharpens parent `SavedView` vocabulary with the operator/clause/scope terms specific to this compiler.

## Language

**FilterClause**:
A single `{ field, op, value }` predicate over a Task field or `custom_fields.<slug>` jsonb path.
_Avoid_: Condition, predicate, rule, criterion.

**FilterOp**:
One of the nine supported operators: `eq | neq | in | nin | gt | lt | contains | is_empty | is_not_empty`.
_Avoid_: Operator (too generic), comparator, matcher.

**Facets**:
A fixed-key bag of array filters (`kind`, `status`, `priority`, `assignee`, `sprint`, `label`, `repo`) compiled as `$in`/`$contains` shortcuts ahead of free-form FilterClauses.
_Avoid_: Quick filters, chips, tags, dimensions.

**Kind**:
The Facets discriminator selecting search scope across `task | doc | memory | artifact` in unified search; not a Task type.
_Avoid_: Type, category, entity, scope (Scope = ViewScope).

**OrderByClause**:
A `{ field, dir: 'asc' | 'desc' }` tuple; arrays of these define the SavedView sort, distinct from the `sort_by` string column persisted on the row.
_Avoid_: Sort, ordering, rank.

**ViewScope**:
The persisted visibility of a SavedView row: `org | project | private`. Default on create is `project`.
_Avoid_: Visibility, sharing, audience, access.

**IsDefault**:
The at-most-one-per-Project flag on a SavedView row; setting it true demotes any prior default in the same Project in the same transaction.
_Avoid_: Pinned, primary, starred, home view.

**CustomFieldPath**:
A FilterClause `field` prefixed `custom_fields.<slug>`, compiled to jsonb `@>` containment rather than a column comparison.
_Avoid_: Custom column, dotted field, jsonb key.

**TextFallback**:
The `SavedViewQuery.text` fragment, compiled to `title LIKE '%…%'` until full-text search indexes saved-view text natively.
_Avoid_: Search, query string, FTS (FTS is the eventual replacement, not this fallback).

## Relationships

- A **SavedViewQuery** has many **FilterClauses**, one **Facets** bag, and one **TextFallback** string.
- A **FilterClause** carries exactly one **FilterOp** and zero-or-one value; **CustomFieldPath** clauses compile through a separate jsonb branch.
- A **SavedView** row persists one **ViewScope**, one **IsDefault** flag, and a serialized **SavedViewQuery** in its `filters` jsonb.
- **OrderByClauses** are array-shaped on the query AST but stored as a single `sort_by` string column on the row.
- At most one **SavedView** per Project may have **IsDefault** = true; create/update enforce this by demoting siblings.

## Example dialogue

> **Dev:** "If I add a **FilterClause** with `field: 'custom_fields.severity'` and `op: 'in'`, what SQL comes out?"
> **Domain expert:** "It goes through the **CustomFieldPath** branch, not the normal column branch. `in` on jsonb has no native operator, so the compiler expands it to an `$or` of `@>` containments — one per value. If you need real `IN` semantics on a custom field, that's an indexed `->>` path query and we don't have that yet."
> **Dev:** "And a **SavedView** with **ViewScope** `private` and **IsDefault** true — legal?"
> **Domain expert:** "Legal but pointless: the default-demotion runs per Project regardless of scope, so a private default still wins the Project's default slot. If that's confusing, scope it `project`."

## Flagged ambiguities

- **Kind (Facets) vs task type vs ViewScope** — resolved: **Kind** is the search-scope discriminator across task/doc/memory/artifact in unified search. It is not a Task type and not a **ViewScope**.
- **OrderByClause vs `sort_by` column** — resolved: the AST carries an array of **OrderByClauses**; the persisted row stores a single `sort_by` string. Serialization between the two is a saved-views concern, not a SavedView consumer concern.
- **TextFallback vs FTS** — resolved: **TextFallback** is the current `title LIKE` behavior of `SavedViewQuery.text`. Real full-text search will replace it; do not call the current behavior "FTS".
