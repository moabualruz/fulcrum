# Admin

Owner/admin-only application surface inside identity-access for org-scoped operational concerns: database backup/restore, error log review, theme settings, and feature-flag administration including rollout cohorts.

## Language

**AdminAppContext**:
The per-call envelope carrying `orgId`, `userId`, optional `EntityManager`, and DI container used by every admin operation.
_Avoid_: AuthApplicationContext, request context.

**BackupDump**:
A versioned snapshot (`fulcrum.db-dump.v1`) of every public table's columns, column types, and rows, serialized as base64 JSON.
_Avoid_: Export, dump file, snapshot.

**ErrorLogRecord**:
A captured client error with environment metadata (`os`, `arch`, `bunVersion`, `fulcrumVersion`), recent CLI command or tRPC procedure, message, stack, and structured context, scoped to one **Org**.
_Avoid_: Exception, crash report, log entry.

**ThemeSetting**:
A typed `(key, value, defaultValue)` triple for an allow-listed `theme.*` key (e.g. `theme.accent`, `theme.radius`) stored per `(orgId, userId)`.
_Avoid_: Preference, UI config, style override.

**LegacyThemeSettings**:
The pre-token theme shape (HSL accent triple, font enum, color scheme, compact mode, animation speed, preset) stored under `theme.web.*` keys, kept for surfaces that have not migrated to **ThemeSetting**.
_Avoid_: Old theme, web theme.

**FlagRollout**:
A per-**Org** row holding `rolloutPercent` and `cohortRules` (with an `orgOverrides` map) layered on top of the base **FeatureFlag** to drive gradual or per-org enable/disable decisions.
_Avoid_: Experiment, gate, segment.

**OrgOverride**:
A boolean entry in **FlagRollout**.`cohortRules.orgOverrides` that forces a specific **Org**'s outcome for a flag regardless of `rolloutPercent`.
_Avoid_: Exception, allowlist entry.

## Relationships

- An **AdminAppContext** scopes every operation here to one **Org** and one acting **User**; mutating calls require that **User** to have an `owner` or `admin` **OrgMember** role.
- A **BackupDump** spans every public table — it is service-agnostic even though produced from identity-access's admin surface.
- An **ErrorLogRecord** belongs to one **Org** and optionally one **User**; listing and clearing are always org-scoped.
- A **ThemeSetting** is keyed by `(orgId, userId, key)`; **LegacyThemeSettings** share the same store under `theme.web.*` keys.
- A **FlagRollout** belongs to one **Org** and one **FeatureFlag**; **OrgOverride** entries inside it can pin individual **Orgs** on or off.
- Cross-org writes are rejected: flag scope writes outside `ctx.orgId`, or targeting **Users** outside the active **Org**, raise `AppForbiddenError`.

## Example dialogue

> **Dev:** "If an admin sets `rolloutPercent: 50` and also flips an **OrgOverride** to `true` for the same **Org**, which wins?"
> **Domain expert:** "The **OrgOverride** wins — `evaluateFeatureFlag` reads `cohortRules.orgOverrides` first and returns its boolean; `rolloutPercent` only applies when there is no override for that **Org**."
> **Dev:** "And restoring a **BackupDump** — does it wipe rows first?"
> **Domain expert:** "No. `restoreBackupDump` upserts on `id` for every table that has an `id` column; tables without `id` are skipped. It is additive, not destructive."

## Flagged ambiguities

- **ThemeSetting vs LegacyThemeSettings** — both live in the same repository keyed by `theme.*`. New code must use **ThemeSetting** (token keys like `theme.accent`); **LegacyThemeSettings** under `theme.web.*` is read/written only for surfaces still on the old shape and will be removed once migrated.
- **FlagRollout home** — the **FeatureFlag** row lives in identity-access, but **FlagRollout** lives in `platform-core` (`FeatureFlagRollout`). This admin surface writes both via the local **AdminAppContext**'s `EntityManager`; do not move rollout ownership into identity-access.
- **BackupDump scope** — the dump covers every public table, not just identity-access tables. Despite the location of this code, treat **BackupDump** as a platform-wide artifact authored from the admin surface.
