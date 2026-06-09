# Architecture and code rules

Read when adding modules, naming code, changing service boundaries, touching tests, or choosing infrastructure libraries.

## Naming and ownership

- Name code by responsibility, domain, behavior, or value.
- Do not name code after plan phase, provenance, status, or inspiration source.
- Prefer editing existing modules over creating parallel utilities with overlapping responsibility.
- Comment why a non-obvious choice exists. Do not comment what the next line already says.

## Architecture

- Prefer service-oriented domain boundaries for large product work.
- Keep domain logic separate from infrastructure and interface code.
- Use one persistence stack and one server or API framework per project unless an explicit migration bridge is tracked for removal.
- Prefer DDD and SOLID over premature DRY. Remove duplicated knowledge, but do not couple unrelated callers through a shared abstraction just to save a few lines.

## Tests

- Unit tests should not require a database.
- Integration tests can use a real database for persistence, migration, transaction, query-shape, or service-wiring contracts.
- E2E tests should exercise realistic workflows with realistic seeded data.
