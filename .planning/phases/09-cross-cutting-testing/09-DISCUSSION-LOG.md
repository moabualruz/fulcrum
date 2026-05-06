# Phase 9: Cross-Cutting + Testing - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-06  
**Phase:** 9-Cross-Cutting + Testing  
**Areas discussed:** Deep research standard, maximum interface parity, i18n/theme, accessibility, telemetry/error reporting, backup/import/export, secrets/audit, migration/shutdown, comprehensive testing

---

## Deep Research Standard

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 5-style disk-backed research | Write platform, dependency, and codebase integration research files before plans. | ✓ |
| Inline-only research | Keep findings only in conversation/context. | |

**User's choice:** Auto-selected from prompt: "deep researches similar to the way we did researches in phase 5."  
**Notes:** Research persisted to `09-RESEARCH-PLATFORMS.md`, `09-RESEARCH-DEPENDENCIES.md`, `09-RESEARCH-INTEGRATION.md`.

---

## Maximum Interface Parity

| Option | Description | Selected |
|--------|-------------|----------|
| Maximum practical parity across Web/CLI/TUI/API | Every cross-cutting feature gets capability-equivalent interface row and tests. | ✓ |
| Web-first only | Cross-cutting settings mostly live in web settings pages. | |
| Backend-only hardening | Treat Phase 09 as internal tests/infrastructure only. | |

**User's choice:** Auto-selected from prompt: "Make sure maximum feature parity in all interfaces as much as possible."  
**Notes:** Parity means surface-native UX, not identical UI.

---

## i18n + Theme

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse current adapter/theme primitives | Keep `src/i18n/index.ts`, `mode-watcher`, theme router, CSS variable sanitization. | ✓ |
| Rewrite around new i18n/theme frameworks | Adopt new libraries across app immediately. | |

**User's choice:** Auto-selected recommended option.  
**Notes:** `@inlang/paraglide-js@2.18.0` is evaluation-only behind adapter.

---

## Accessibility

| Option | Description | Selected |
|--------|-------------|----------|
| Automated axe plus manual-style keyboard/focus tests | WCAG 2.1 AA route sweeps plus testable keyboard/focus/label/high-contrast checks. | ✓ |
| Axe-only | Rely only on automated violations. | |

**User's choice:** Auto-selected recommended option.  
**Notes:** TUI accessibility receives explicit high-contrast/non-color-only/FakeTTY contract.

---

## Telemetry + Error Reporting

| Option | Description | Selected |
|--------|-------------|----------|
| Local-first observability | Local tables/source of truth, opt-in remote, HMAC signing, no required SaaS SDK. | ✓ |
| Adopt hosted SDK defaults | Use Sentry/OpenTelemetry SDKs as required runtime path. | |

**User's choice:** Auto-selected recommended option.  
**Notes:** `@opentelemetry/api@1.9.1` optional only; `@sentry/*` not core dependency.

---

## Backup, Import, Export

| Option | Description | Selected |
|--------|-------------|----------|
| Manifest/preflight/verify model | Versioned manifests, dry-run, collision policy, counts, secret redaction. | ✓ |
| Simple dump/load | Export/import raw data with minimal checks. | |

**User's choice:** Auto-selected recommended option.  
**Notes:** Current `src/backup/runner.ts` stub archive is known gap.

---

## Secrets + Audit

| Option | Description | Selected |
|--------|-------------|----------|
| Verify existing local vault and audit every mutation | Keep Nacl/PBKDF2/keyring path, add parity and audit event coverage. | ✓ |
| Change encryption stack now | Replace with new native/hosted secret management. | |

**User's choice:** Auto-selected recommended option.  
**Notes:** External Vault/AWS SM remains feature-flagged.

---

## Migration + Shutdown

| Option | Description | Selected |
|--------|-------------|----------|
| Testable downgrade and graceful lifecycle gates | Every new migration has down test; shutdown covers PGlite/jobs/workspaces/subscriptions. | ✓ |
| Document-only strategy | Write docs without executable downgrade/shutdown gates. | |

**User's choice:** Auto-selected recommended option.  
**Notes:** Use MikroORM migrator APIs where possible.

---

## Comprehensive Testing

| Option | Description | Selected |
|--------|-------------|----------|
| Hard local CI coverage/parity/a11y gate | 80% line coverage, web/root split, local `bun run ci` source of truth. | ✓ |
| Advisory coverage report | Generate coverage without blocking completion. | |

**User's choice:** Auto-selected recommended option.  
**Notes:** Staged baseline allowed during implementation, final TST-08 requires hard gate.

## the agent's Discretion

- Exact plan wave split.
- Exact CLI command aliases if existing command registry conventions require adjustment.
- Exact coverage ramp mechanism before final hard 80% gate.
- Exact audit verb naming if mapped to existing schema constraints.

## Deferred Ideas

- Required hosted observability provider.
- Enterprise theme marketplace.
- External SIEM export beyond JSON/CSV.
- Encryption algorithm replacement without test-driven need.
