# Tenancy

Application-layer surface that exposes the identity of the built-in local **Org** used by the bootstrap seed and by callers that need a deterministic tenant id outside a request scope.

## Language

**DefaultOrg**:
The single built-in local-mode **Org** identified by a fixed UUID, name `"Local"`, and slug `"local"`, created by `LocalBootstrapSeed`.
_Avoid_: root org, system org, primary tenant, demo org

## Relationships

- A **DefaultOrg** is created exactly once by **LocalBootstrapSeed** and is the **Org** that owns every record produced before a real tenant exists.
- `DEFAULT_ORG_ID`, `DEFAULT_ORG_NAME`, `DEFAULT_ORG_SLUG` are the canonical identifiers re-exported here for application callers; the seed in `infrastructure/application-database/` remains their source of truth.

## Example dialogue

> **Dev:** "Which org do I attach a **Job** to when no user session is bound yet?"
> **Domain expert:** "The **DefaultOrg** via `DEFAULT_ORG_ID` from `application/tenancy`. Don't hardcode the UUID at call sites and don't reach into the seed module directly."

## Flagged ambiguities

- "default org" vs "system org" vs "root tenant" — resolved: only **DefaultOrg** is used; there is no separate platform-owned tenant above it.
