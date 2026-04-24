# Release Evidence Fixtures

Fixture layout for release-readiness tests:

- `compliance/` - compliance matrix inputs and expected summaries.
- `install/` - package, setup, doctor, and start command evidence.
- `sqlite/` - canonical-state restart and migration evidence.
- `surfaces/` - CLI, API, cockpit, TUI, and MCP parity evidence.
- `agents/` - real-agent certification and degradation evidence.
- `adapters/` - optional adapter certification evidence.
- `policy/` - privacy, redaction, local-only, and approval evidence.
- `quality/` - typecheck, test, e2e, and release command evidence.
- `recovery/` - backup, restore, export, rebuild, and invalidation evidence.

Fixtures should use redacted, local-only sample data. Live credentials and network-only artifacts do not belong here.
