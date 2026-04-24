# Adapter Contract

## Adapter Categories

- External project management adapter.
- Memory backend adapter.
- Code tool adapter.
- Semantic search adapter.
- Repo map or repo pack adapter.
- CLI agent adapter.
- Quality gate runner adapter.
- Telemetry or observability adapter.
- Remote model/provider status adapter.
- Packaging/runtime capability adapter.

## Required Adapter Metadata

```json
{
  "adapterId": "adapter_plane",
  "category": "external_pm",
  "name": "Plane",
  "enabled": false,
  "ownershipBoundary": "External item text/status is remote-owned; Fulcrum execution state is local-owned.",
  "networkRequired": true,
  "credentialStatus": "not_configured",
  "privacyNotes": "No data shared unless operator enables sync/writeback.",
  "offlineBehavior": "Existing local mirrors remain usable; sync is disabled.",
  "disablementBehavior": "Local task history is preserved; remote writeback unavailable.",
  "importExportStrategy": "Import selected remote items into local mirrors; preview writebacks before posting.",
  "rebuildStrategy": "Rebuild local mirror projections from SQLite and optional remote refetch when enabled."
}
```

## Required Methods

### `healthCheck(input)`

Returns capability state, blocking status, cause, next action, privacy status, affected workflows, and freshness. Must not leak credentials.

### `describeCapabilities()`

Returns supported operations, optional operations, unavailable operations, local fallback behavior, and policy-gated operations.

### `preview(operation, input)`

Returns expected effects, records affected, external visibility, policy requirements, redaction status, and data shared externally.

### `execute(operation, input, policyDecisionId)`

Runs operation only after required policy decision exists. Returns structured result with provenance and degraded outcomes.

### `disable(reason)`

Disables adapter without deleting Fulcrum-owned local history.

### `exportLocalState(scope)`

Exports adapter-owned Fulcrum records and provenance without secrets.

### `rebuild(scope)`

Rebuilds derived adapter projections or marks source unavailable with next action.

## Cross-Cutting Rules

- Adapters do not write canonical Fulcrum state directly; they call core services.
- Adapters cannot bypass local-only mode.
- Adapter credentials are stored or referenced only through operator-approved local mechanisms.
- Adapter failures are explicit degraded states with affected workflows and next actions.
- Replacing an adapter preserves Fulcrum-owned project, task, run, artifact, policy, context, and provenance history.
- Network adapters are disabled by default and opt-in.
- Local tool adapters respect ignore rules and redaction profiles.

## Domain-Specific Requirements

### External PM Adapter

- Imports remote work items as local task mirrors with separate local IDs and external IDs.
- Tracks sync statuses `never_synced`, `synced`, `local_newer`, `remote_newer`, `conflict`, `failed`, and `disabled`.
- Previews and policy-gates external comments, status changes, and writebacks.

### Memory Adapter

- Supports local markdown/text as baseline.
- Returns source refs, status, backend, rank, reason, and limitations.
- Degrades to local fallback when optional backend is unavailable.

### Code Tool Adapter

- Supports exact and path search through local tools before optional semantic search.
- Labels evidence type and ignored-path behavior.
- Marks stale references after rename, delete, ignored-path changes, or rebuild.

### CLI Agent Adapter

- Records command identity, roles, health, prompt support, MCP support, and project availability.
- Supports deterministic validation agent for deterministic validation.
- Does not require deep vendor integration for supervised run lifecycle.

### Quality Gate Adapter

- Runs project-defined commands with captured timing, outputs, status, and redaction.
- Marks heavy gates explicit or asynchronous.
- Enforces required-gate blocking through core policy/readiness services.

## Recommended Skill Calls

Use [../skill-calls.md](../skill-calls.md) as the full catalog. For adapter
contracts, prioritize [$agent-native-architecture](/home/mkh/.raise/profiles/vanilla/codex/skills/agent-native-architecture/SKILL.md),
[$source-driven-development](/home/mkh/.raise/profiles/vanilla/codex/skills/source-driven-development/SKILL.md),
[$integration-utilization-auditor](/home/mkh/.raise/profiles/vanilla/codex/skills/integration-utilization-auditor/SKILL.md),
[$security-and-hardening](/home/mkh/.raise/profiles/vanilla/codex/skills/security-and-hardening/SKILL.md),
and [$reliability-reviewer](/home/mkh/.raise/profiles/vanilla/codex/skills/reliability-reviewer/SKILL.md).
