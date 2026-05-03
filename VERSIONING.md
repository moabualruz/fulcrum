# Versioning

## Semantic Versioning Policy

Fulcrum follows semantic versioning.

During `0.x`, breaking changes are allowed when they are documented in `CHANGELOG.md` and have a migration path where data is affected. After `1.0.0`, public CLI commands, documented config, governance policies, and exported API contracts require normal semver compatibility.

## Release Cadence

- Minor releases target a monthly cadence.
- Patch releases ship on demand for fixes.
- Critical security hotfixes target release within 24 hours of validation.

Local `bun run ci` and `bun run release vX.Y.Z` remain the source-of-truth release gates.

Security release coordination uses security@fulcrum.local.

## Deprecation Policy

After `1.0.0`, removals require at least one minor version of warning before removal. Deprecation notices must include replacement guidance, affected surfaces, and the earliest removal version.

During `0.x`, removals may happen sooner, but they still require a `CHANGELOG.md` entry and migration notes when user data or automation is affected.

## v1.0 Readiness Criteria

- [ ] All 16 product pillars shipped.
- [ ] Web/API, CLI, and TUI surfaces reach feature parity.
- [ ] Zero P0 bugs remain open.
- [ ] 90-day bug-bash window completed.
- [ ] Security policy, governance policy, code of conduct, and versioning policy reviewed.
- [ ] Dependency license audit passes with no AGPL, SSPL, BSL, or other non-permissive runtime dependency.
- [ ] `bun run ci` passes from a clean checkout.
