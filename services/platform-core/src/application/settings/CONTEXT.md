# Settings

Application-layer surface that exposes admin operations over the platform-core tenant configuration, secrets, feature flags, error log, telemetry, and import/export. Sharpens parent vocabulary inside the `/settings` admin pane.

## Language

**SettingsBackup**:
A point-in-time JSON dump of the org's exportable entities produced by `createSettingsBackup`.
_Avoid_: snapshot, dump, archive

**BackupSummary**:
A history row (`id`, `status`, `size_bytes`, `path`, `created_at`, `completed_at`) persisted under the `settings.backups.history` **TenantSetting** key.
_Avoid_: backup metadata, manifest entry

**ImportManifest**:
A `fulcrum.json-export.v1` envelope of org rows accepted by restore/import flows.
_Avoid_: payload, dataset, dump file

**SettingsDataExport**:
A subsetted manifest filtered by **SettingsEntityKind** (`projects | tasks | credentials | feature_flags | tenant_settings`).
_Avoid_: partial backup, selective dump

**SettingsFeatureFlag**:
A `FeatureFlag` row joined with its **FeatureFlagRollout** (rollout percent + cohort rules) presented as one admin DTO.
_Avoid_: toggle, gate, switch

**SettingsSecret**:
A platform `Credential` row (org+user-scoped name, provider, archived flag) surfaced in the secrets pane, distinct from **ConnectorCredential** managed via `createCredential`.
_Avoid_: api key, token, password

**SettingsError**:
An `ErrorLog` row rendered for the admin error inbox with `message`, `stack_trace`, `context`, `os`, `version`, `occurred_at`.
_Avoid_: crash report, exception, incident

**TelemetryOptIn**:
The boolean **TenantSetting** at key `telemetry.opt_in` toggled by `toggleSettingsTelemetryOptIn`.
_Avoid_: analytics flag, tracking toggle

## Relationships

- A **SettingsBackup** appends one **BackupSummary** to the history list capped at 50.
- A **SettingsDataExport** is derived from an **ImportManifest** by intersecting **SettingsEntityKind** selectors.
- A **SettingsFeatureFlag** projects one `FeatureFlag` plus zero-or-one **FeatureFlagRollout**; toggling the flag does not mutate the rollout.
- A **SettingsSecret** belongs to one (**Org**, **User**) pair; **ConnectorCredential** belongs to (**Org**, project) and is created via a separate command.
- A **TelemetryOptIn** flip does not purge **TelemetryEvent** rows; `purgeSettingsTelemetry` is the explicit removal command.

## Example dialogue

> **Dev:** "Does `createSettingsBackup` write the same row shape as `addSettingsSecret` for credentials?"
> **Domain expert:** "No — a **SettingsSecret** is a platform `Credential` (org+user+name). The backup serializes the **ConnectorCredential** set via `createExportManifest`. Two different entities, two different commands."
> **Dev:** "And `setTenantSetting` writes a **TenantSetting**?"
> **Domain expert:** "In this surface it writes a `FeatureFlag` row keyed by `flag = key`. The JSON-valued **TenantSetting** path is reserved for backup history and telemetry opt-in via `upsertTenantJsonSetting`."

## Flagged ambiguities

- "credential" overlapped **SettingsSecret** (platform `Credential`, user-owned) and **ConnectorCredential** (integration-hub, project-owned) — resolved: two entities, two commands (`addSettingsSecret` vs `createCredential`); do not collapse.
- "tenant setting" overlapped boolean `FeatureFlag` storage (via `setTenantSetting`) and JSON-valued **TenantSetting** rows (via `upsertTenantJsonSetting`) — resolved: the key namespace decides; `settings.backups.history` and `telemetry.opt_in` are JSON-valued, everything else is flag-shaped.
