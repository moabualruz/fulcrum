# Platform Primitives

Low-level building blocks shared across platform-core application code: kernel markdown parsing, monotonic identifier minting, and an in-process workspace state store.

## Language

**KernelMarkdown**:
A parsed markdown document split into a typed `frontmatter` map and a raw `body` string.
_Avoid_: front matter doc, md ast, yaml header

**Ulid**:
A Crockford-base32, lexicographically sortable 26-character identifier minted with monotonic per-millisecond ordering.
_Avoid_: uuid, guid, random id, snowflake

**FulcrumStore**:
A vanilla Zustand store holding ephemeral in-process workspace state (currently `activeProjectId`) for the running platform-core surface.
_Avoid_: redux store, global state, session cache

**ActiveProjectId**:
The id of the project currently focused in the running surface, held in **FulcrumStore** and reset to `null` when no project is selected.
_Avoid_: current project, selected workspace, focused id

## Relationships

- A **KernelMarkdown** has exactly one `frontmatter` map and one `body` string; serialization round-trips an empty `frontmatter` to body-only output.
- A **Ulid** minted in the same millisecond as the previous one increments the prior random tail; a new millisecond reseeds the random tail.
- A **FulcrumStore** owns one **ActiveProjectId** at a time.

## Example dialogue

> **Dev:** "Can we use a **Ulid** as the row id for a `FulcrumSkill`?"
> **Domain expert:** "Yes — **Ulid** is the platform-wide monotonic id primitive; it sorts by mint time and is safe across the same-millisecond burst."
> **Dev:** "And the SKILL.md header parsing?"
> **Domain expert:** "Parse it as **KernelMarkdown**; the YAML header becomes `frontmatter`, the rest is `body`. Don't invent a second parser."

## Flagged ambiguities

- "state" was used to mean both **FulcrumStore** (in-process Zustand) and persisted DB rows — resolved: **FulcrumStore** is ephemeral process memory only; durable state belongs to platform-core entities (e.g. **TenantSetting**, **ComponentLedger**) in the parent context.
