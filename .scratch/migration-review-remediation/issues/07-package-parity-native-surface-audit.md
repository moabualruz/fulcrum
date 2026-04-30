# 07 — Package parity audits native surfaces and MCP config from real files

Status: ready-for-agent
Risk tier: medium
Severity: medium
Source findings: C8
Dependencies: 06
File ownership:
- `src/cli/package-parity.ts`
- `src/cli/package-parity.test.ts`
- `src/cli/package-mirror.ts`

Acceptance criteria:
- `auditPackageParity` counts a native package surface as installed only when the surface file (or its native config entry) exists at the expected target path. Root-directory existence is no longer sufficient.
- `mcpManifestConfigured` returns true only when the agent's native MCP config file actually contains an entry for the package's MCP server. Fallback manifests with a missing `sourcePath` are treated as missing.
- New tests cover: missing native plugin file → `missing` entry in the report; agent MCP config without the package server → `mcpManifestMissing`.
- `bun run ci` is green.
