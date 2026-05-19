# Skills

Application-layer operations that install, upgrade, uninstall, sync, and reconcile a tenant's **FulcrumSkill** registry — including upstream conflict resolution, lock-file overrides, and the web-facing skill row view.

## Language

**ConflictResolution**:
The chosen outcome for an open **SkillConflict**, one of `keep_local | use_upstream | force | alt_version | skip | upgrade_installed`.
_Avoid_: merge strategy, resolution mode, fix action

**UpstreamConflict**:
The serialized web view of an open **SkillConflict** carrying installed/requested versions, alt-version suggestions, recommended resolution, and a `force_safe` flag.
_Avoid_: conflict payload, conflict snapshot, sync clash

**SkillsLockFile**:
The on-disk `skills.lock` map of `slug → { version, hash, installedAt, enabled_agents }` used to detect sha mismatches outside the database.
_Avoid_: manifest, registry file, pin file

**LockOverride**:
An audited write that replaces a slug's expected sha256 in the **SkillsLockFile** and appends an `Event` with `verb=lock_override`.
_Avoid_: force-unlock, hash reset, manual pin

**SkillRegistryEntry**:
A minimal projection of a **FulcrumSkill** (`slug`, `name`, `source`, `version`, `enabledAgents`) returned by the registry service for listing.
_Avoid_: skill summary, registry row, skill record

**SkillRow**:
The web-actions projection of a **FulcrumSkill** joined with its latest **SkillVersion** and any open **UpstreamConflict**.
_Avoid_: skill view-model, table row, web skill

## Relationships

- A **FulcrumSkill** has at most one open **SkillConflict**; resolving it via a **ConflictResolution** closes it and may update the latest **SkillVersion**'s `hashVerified`.
- An **UpstreamConflict** is derived from the most recent open **SkillConflict** for a slug and is embedded inside a **SkillRow**.
- A **LockOverride** writes to the **SkillsLockFile** and appends an audit **Event** (parent context) — it does not touch any **SkillConflict** row.
- `force` is only a legal **ConflictResolution** when the open conflict's `auditNote` contains `force-safe`.
- `upgrade_installed` short-circuits resolution by bumping the **SkillVersion** patch instead of accepting either side.

## Example dialogue

> **Dev:** "If the web client picks `force` on an **UpstreamConflict**, what enforces safety?"
> **Domain expert:** "`resolveWebSkillConflict` reads the open **SkillConflict** and rejects `force` unless `auditNote` includes `force-safe`. Otherwise the only safe escape is `alt_version` or `skip`."
> **Dev:** "And `overrideSkillLock` — does it close the conflict?"
> **Domain expert:** "No. A **LockOverride** only rewrites the **SkillsLockFile** hash and appends a `lock_override` **Event**; the **SkillConflict** stays in whatever status it was."

## Flagged ambiguities

- "resolution" was used for both the persisted `suggestedResolution` string on **SkillConflict** and the user-chosen **ConflictResolution** input — resolved: the input is a **ConflictResolution**; the column stores the last applied one (prefixed `alt-version:<v>` when applicable).
- "version" overlapped **SkillVersion** (db row) and the **UpstreamConflict** `installed_version` / `requested_version` strings derived from hashes — resolved: the latter are display-only labels, not entity references.
