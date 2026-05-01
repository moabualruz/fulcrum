# Fulcrum Web Shell

SvelteKit + shadcn-svelte web UI for Fulcrum product kernel. Exports the supervisor, task system, memory, and context engine via HTTP.

## Development

```bash
bun run dev
```

Starts `vite` dev server on `http://localhost:5173` (configurable in `vite.config.ts`). Hot-reload on `.svelte` and `.ts` changes.

## Build

```bash
bun run build
```

Generates optimized production bundle under `build/`.

## Type check

```bash
bun run check
```

Runs `tsc --noEmit` to verify TypeScript types without emitting code.

## Tests

### Unit tests (Vitest + `@testing-library/svelte`)

```bash
bun run web:test
```

Runs Vitest in watch mode. Test files live alongside source under `src/**/*.test.ts` and in `tests/vitest/`. Covers:
- Active project store state transitions
- Command palette filtering and selection
- Project form validation
- Kanban move helpers
- Component rendering (inputs, buttons, panels)

### E2E tests (Playwright)

From `src/web/`:
```bash
FULCRUM_RUN_E2E=1 bun run web:e2e
```

From repo root:
```bash
FULCRUM_RUN_E2E=1 bun run ci
```

Runs Playwright against a temporary `FULCRUM_HOME` directory. Tests the full user journey: create project → create task → drag to in_progress → search via cmd+K → assert toast. Playwright specs live under `tests/e2e/`.

See also: [Testing architecture](../../docs/product-kernel.md#web-shell-testing) in product kernel docs.

## Rebuild from scratch

To recreate this project with the same SvelteKit config:

```bash
bun x sv@0.15.2 create --template minimal --types ts --install bun /Users/mkh/workspace/fulcrum/src/web
```
