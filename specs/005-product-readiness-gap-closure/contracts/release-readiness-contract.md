# Release Readiness Contract

## CLI

```bash
fulcrum release validate --evidence <dir> --json
fulcrum release validate --local-only --evidence <dir> --json
```

## Required Evidence Sections

- compliance matrix
- install/package/start
- setup/doctor
- SQLite canonical state restart
- CLI/API/cockpit/TUI/MCP parity
- real-agent acceptance
- adapter certification
- policy/privacy/no-network
- quality gates
- worktree safety
- graph/cache invalidation
- backup/restore/export/rebuild
- documentation and operator guide

## JSON Output

```json
{
  "schemaVersion": "1.0",
  "releaseRunId": "release_...",
  "pass": false,
  "evidenceRoot": "/tmp/fulcrum-release-evidence",
  "checks": [
    {
      "checkId": "doctor.full-matrix",
      "status": "failed",
      "sourceRequirements": ["SRS-FR-DOC-003"],
      "artifacts": ["doctor-full.json"],
      "nextAction": "Implement missing doctor probes."
    }
  ],
  "redactionStatus": "redacted"
}
```
