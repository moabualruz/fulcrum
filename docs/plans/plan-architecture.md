# Plan: Modular Architecture Refactoring

**Gaps addressed**: GAP-ARCH-1 through GAP-ARCH-10  
**Priority order**: Critical circular deps first, then layer violations, then quality improvements  
**Files**: `packages/core/`, `packages/teams/`, `packages/policy/`, `packages/cli/src/index.ts`, `packages/core/src/embedding/registry.ts`

---

## Step 1 — Critical: Break `fulcrum-core` ↔ `fulcrum-teams` circular dependency (GAP-ARCH-1)

**Current situation**:
- `packages/core/src/index.ts:138` — dynamic `await import('fulcrum-teams')` inside `getTeamOps()`
- `packages/teams/src/teams.ts:2` — static `import from 'fulcrum-core'`
- madge confirms this forms 2 actual cycles

**The fix**:

The `TeamOps` interface already exists in `packages/core/src/team-ops.ts`. This is the right place. The cycle is caused by `getTeamOps()` in core trying to load the teams implementation.

Solution: **Inversion of control**. Remove `getTeamOps()` from core entirely. The CLI (which has both packages as dependencies) sets the implementation:

```typescript
// packages/core/src/team-ops.ts
let _teamOps: TeamOps | null = null

export function setTeamOps(impl: TeamOps): void {
  _teamOps = impl
}

export function getTeamOps(): TeamOps {
  if (!_teamOps) throw new FulcrumError('TeamOps not initialized — call setTeamOps()', 'not_initialized')
  return _teamOps
}
```

In `packages/cli/src/index.ts` startup, before serving:
```typescript
import { createTeamOps } from 'fulcrum-teams'
import { setTeamOps } from 'fulcrum-core'
setTeamOps(createTeamOps())
```

`fulcrum-teams` exports `createTeamOps(): TeamOps`. Core never imports teams. Cycle broken.

---

## Step 2 — Critical: Fix `fulcrum-policy` depends on `fulcrum-teams` (GAP-ARCH-2)

**Current situation**: `packages/policy/package.json` lists `fulcrum-teams` as a direct dependency.

**The fix**: Identify what policy needs from teams. Likely it's team membership data or team instance state to evaluate team-related rules. 

Add a `TeamContext` type to `packages/core/src/types.ts`:
```typescript
export interface TeamContext {
  team_id: string
  workspace_id: string
  slots: Array<{ role: string; agent_ids: string[] }>
  status: string
}
```

In the policy rule that currently imports from `fulcrum-teams`, change the import to accept a `TeamContext` data object instead of calling team functions. The call site (CLI/monitor) is responsible for loading team data and passing it to policy evaluation.

Remove `fulcrum-teams` from `packages/policy/package.json`.

---

## Step 3 — Major: Move hook types out of CLI (GAP-ARCH-3)

The following types and functions in `packages/cli/src/index.ts` are library-level and should not live in an application entrypoint:

- `HookCli`, `NormalizedHookEvent`, `HookContext`, `HookOutput`, `HookIO` — types
- `normalizeHookEvent`, `runPreHook`, `runPostHook` — functions

**Move to**: `packages/core/src/hooks.ts` (new file) with full type exports.

Update imports in `index.ts` to use `fulcrum-core`. Remove exports from `index.ts`.

---

## Step 4 — Major: Replace `export *` with named exports (GAP-ARCH-4)

In each package's `index.ts`, replace wildcard re-exports with explicit named exports:

**`packages/teams/src/index.ts`**: List the ~15 specific symbols that are actually public API.
**`packages/policy/src/index.ts`**: List the ~8 specific symbols.
**`packages/workflows/src/index.ts`**: List the ~12 specific symbols.

Add to root ESLint config:
```json
"import/no-export-star": "error"
```

---

## Step 5 — Major: Embedding registry as plugin registry (GAP-ARCH-6)

Replace the switch/case in `packages/core/src/embedding/registry.ts`:

```typescript
type EmbeddingProviderFactory = (config: EmbeddingProviderConfig) => EmbeddingProvider

const providerRegistry = new Map<string, EmbeddingProviderFactory>()

export function registerEmbeddingProvider(name: string, factory: EmbeddingProviderFactory): void {
  providerRegistry.set(name, factory)
}

export function createProvider(config: EmbeddingProviderConfig): EmbeddingProvider {
  const factory = providerRegistry.get(config.provider)
  if (!factory) {
    throw new FulcrumError(`Unknown embedding provider: ${config.provider}`, 'not_found')
  }
  return factory(config)
}
```

Built-in providers self-register:
```typescript
// packages/core/src/embedding/local.ts (at module bottom)
registerEmbeddingProvider('local', (config) => new LocalEmbeddingProvider(config))

// packages/core/src/embedding/remote.ts
registerEmbeddingProvider('voyage', (config) => new RemoteEmbeddingProvider(config))
registerEmbeddingProvider('openai', (config) => new RemoteEmbeddingProvider(config))
```

---

## Step 6 — Major: Consolidate config loading (GAP-ARCH-7)

In `packages/core/src/config.ts` (or `packages/core/src/index.ts`), expose:
```typescript
export function readRawConfig(): Record<string, unknown>
export function writeRawConfig(patch: Record<string, unknown>): void
```

In `packages/memory/src/setup/wizard.ts`, delete the local `getFulcrumConfigPath`/`readFulcrumConfig`/`writeFulcrumConfig` implementations and replace with the core exports.

In `packages/memory/src/vault/client.ts`, replace the `process.env['FULCRUM_VAULT_PATH']` direct read with `loadConfig().vault_path`.

---

## Step 7 — Minor: Remove duplicate `globalDataDir()` (GAP-ARCH-10)

In `packages/cli/src/index.ts:509-516`, delete the local `globalDataDir()` implementation and import it from `fulcrum-core`:
```typescript
import { globalDataDir } from 'fulcrum-core'
```

This is already exported from core — one line change.

---

## Step 8 — Minor: Typed EventBus (GAP-ARCH-8)

Add `packages/core/src/events/bus.ts`:

```typescript
import { EventEmitter } from 'events'

export type FulcrumEvent =
  | { type: 'run.started'; run_id: string; role: string }
  | { type: 'run.completed'; run_id: string; summary: string }
  | { type: 'run.blocked'; run_id: string; reason: string }
  | { type: 'task.updated'; task_id: string; status: string }
  | { type: 'memory.written'; memory_id: string }

const bus = new EventEmitter()
bus.setMaxListeners(50)

export function emitBusEvent(event: FulcrumEvent): void {
  bus.emit(event.type, event)
}

export function onBusEvent<T extends FulcrumEvent['type']>(
  type: T,
  handler: (event: Extract<FulcrumEvent, { type: T }>) => void
): () => void {
  bus.on(type, handler as (e: unknown) => void)
  return () => bus.off(type, handler as (e: unknown) => void)
}
```

Initial consumers: monitor can subscribe to `run.started`/`run.completed` for real-time push (replaces polling). Memory package subscribes to `run.completed` to auto-compact memories.

---

## Step 9 — Minor: Peer dependency validation (GAP-ARCH-9)

Add `packages/workflows/src/check-peers.ts`:
```typescript
export async function checkWorkflowPeers(): Promise<void> {
  const peers = ['fulcrum-planning', 'fulcrum-teams', 'fulcrum-worker']
  for (const peer of peers) {
    try {
      await import(peer)
    } catch {
      throw new FulcrumError(
        `Missing peer dependency: ${peer}. Run: pnpm add ${peer}`,
        'peer_missing'
      )
    }
  }
}
```

Call `checkWorkflowPeers()` in `workflow start` and `workflow run` before proceeding.

---

## Execution Order (dependencies)

1. Step 7 (globalDataDir — zero risk, no deps)
2. Step 3 (move hook types — isolated refactor)
3. Step 4 (named exports — isolated but enables tree-shaking verification)
4. Step 6 (config consolidation — low risk)
5. Step 5 (embedding registry — touches a few files but well-isolated)
6. Step 2 (policy layer fix — requires adding TeamContext to core types)
7. Step 1 (core↔teams cycle — the big one, requires Steps 2 as context)
8. Steps 8-9 (additive features, any order)

---

## Acceptance Criteria

- [ ] madge reports 0 circular dependencies after Step 1
- [ ] `fulcrum-policy` package.json does not list `fulcrum-teams` as dependency
- [ ] CLI `index.ts` exports no library types
- [ ] No `export *` in teams, policy, or workflows `index.ts`
- [ ] `createProvider()` in embedding registry uses the map, not switch/case
- [ ] Memory wizard reads config from core, no local implementation
- [ ] All 11 packages build independently (`tsc --noEmit` from each package root)
- [ ] All test suites pass
