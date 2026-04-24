# Compliance Contract

## CLI

```bash
fulcrum compliance audit --sources FULCRUM_PRODUCT.md,SRS.md,SRS-ammend-01.md,SRS-ammend-02.md --json
fulcrum compliance show <requirementId> --json
fulcrum compliance export --format markdown|json --output <path>
```

## JSON Output

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "2026-04-24T00:00:00.000Z",
  "sourceOrder": ["FULCRUM_PRODUCT.md", "SRS-ammend-02.md", "SRS-ammend-01.md", "SRS.md"],
  "summary": {
    "implemented": 0,
    "partial": 0,
    "missing": 0,
    "deferred": 0,
    "superseded": 0,
    "mockOnly": 0,
    "previewOnly": 0,
    "documentationOnly": 0
  },
  "requirements": [
    {
      "requirementId": "SRS-FR-DOC-003",
      "sourceRef": "SRS.md:FR-DOC-003",
      "status": "partial",
      "implementationRefs": ["packages/core/src/doctor/setup-doctor.ts"],
      "testRefs": ["tests/contract/doctor-capability-matrix.test.ts"],
      "evidenceRefs": [],
      "nextAction": "Add missing fd, ast-grep, Aider, Repomix, memsearch, Engram, and project MCP config probes."
    }
  ]
}
```

## Gate Rule

Release readiness fails when any non-deferred requirement has status `missing`, `partial`, `mock_only`, `preview_only`, or `documentation_only`.
