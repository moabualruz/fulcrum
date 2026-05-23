# Custom Fields

Application area that defines, configures, and writes typed per-Project fields on Tasks. Sharpens the parent service's **CustomFieldDef** vocabulary with the storage, addressing, and validation terms specific to this sub-area.

## Language

**Slug**:
The stable, snake_cased identifier derived from a CustomFieldDef name and used as the jsonb key under `Task.customFields`.
_Avoid_: Key, code, name (name is the human label; slug is the addressable key).

**ConfigJson**:
The per-CustomFieldDef jsonb blob holding type-specific settings (e.g. `options`, `min`, `max`) parsed by `CustomFieldConfigSchema`.
_Avoid_: Config, settings, meta, options (options live inside configJson but are not the whole thing).

**Option**:
A single `{ value, ... }` entry inside `configJson.options` that constrains legal values for a `select` or `multi_select` CustomFieldDef.
_Avoid_: Choice, enum, tag.

**FieldValue**:
The validated value stored at `Task.customFields[slug]`, shaped by the CustomFieldDef's `type` and `configJson`.
_Avoid_: Entry, cell, attribute.

**Position**:
The integer sort order of a CustomFieldDef within its Project (`position ASC, name ASC, id ASC`); the canonical column behind the legacy `sort_order` alias.
_Avoid_: Order, rank, index, sortOrder.

**Archived**:
The soft-deletion flag on a CustomFieldDef; archived defs are excluded from list/read paths but their existing FieldValues stay on Tasks.
_Avoid_: Deleted, disabled, hidden.

## Relationships

- A **CustomFieldDef** has one **Slug**, one **ConfigJson**, one **Position**, and zero or more **Options** (only for `select` / `multi_select` types).
- A **Task** stores zero or more **FieldValues**, each addressed by a **Slug** that resolves to exactly one non-**Archived** CustomFieldDef.
- **Required** CustomFieldDefs reject clear operations and reject empty FieldValues on write.

## Example dialogue

> **Dev:** "If I rename a **CustomFieldDef**, does the **Slug** change?"
> **Domain expert:** "No — Slug is derived once at create time and stays stable. Name is the human label; Slug is the jsonb key Tasks already point at. Renaming only touches `name`, never `slug`."
> **Dev:** "And when I delete a select **Option**, what happens to existing **FieldValues** pointing at it?"
> **Domain expert:** "They stay on the Task as-is; validation only runs on write. Next set of that field with the dropped value will fail with `unknown option`."

## Flagged ambiguities

- **Position vs sortOrder** — resolved: the column and canonical term is **Position**. `sortOrder` only appears in the legacy `project-settings.ts` raw-SQL path as an input alias and is mapped to `position` on write.
- **Options as top-level vs inside ConfigJson** — resolved: **Options** always live inside **ConfigJson** under the `options` key. The legacy create/update API accepts a flat `options: string[]` for convenience and serializes it into `configJson.options`.
