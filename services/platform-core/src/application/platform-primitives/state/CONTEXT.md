# Platform Primitives: State

In-process state container construction for the running platform-core surface. Defers all durable concepts to the parent context.

## Language

**FulcrumStoreFactory**:
A function that constructs a fresh **FulcrumStore** (parent term) initialized with `activeProjectId = null`.
_Avoid_: store builder, store provider, store init

## Relationships

- A **FulcrumStoreFactory** invocation produces exactly one **FulcrumStore** (defined in the parent context).

## Example dialogue

> **Dev:** "How do I get a **FulcrumStore** for a new surface boot?"
> **Domain expert:** "Call the **FulcrumStoreFactory** once at boot; never share an instance across surfaces."

## Flagged ambiguities

- None specific to this sub-area; durable vs ephemeral state ambiguity is resolved in the parent context.
