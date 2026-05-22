# Test Fixtures Context

## Language

`@fulcrum/test-fixtures` owns reusable test data, factories, and cross-surface contract fixtures consumed by two or more Fulcrum services or surfaces.

Use `factory` for Fishery-backed object builders. Use `fixture` for deterministic, named data sets that encode shared product contracts across web, CLI, TUI, API, or service tests.

## Relationships

- Consumed by `tests/**` through the `@fulcrum/test-fixtures` package alias.
- Does not own service-domain types; service-only test helpers stay beside their owning service tests.
- Complements `tests/support/**`, which owns runtime harnesses, databases, callers, and other execution infrastructure.

## Example dialogue

Human: "This workflow UAT data is used by web, CLI, TUI, and API contract tests."
Agent: "Move the shared deterministic fixture here and export it from `src/index.ts`."

Human: "This helper only creates a repository mock for one service unit test."
Agent: "Keep it in that service test file."

## Flagged ambiguities

- `tests/support/**` still contains broad runtime helpers. Keep only data/factory knowledge here; move harness code only if it becomes pure shared fixture data.
