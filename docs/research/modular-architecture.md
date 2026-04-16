# Modular Architecture Research

## Industry Patterns Summary

**Standalone-but-composable packages** — Each package exposes a typed public API through `index.ts` and relies only on its declared `dependencies`. Integration happens through interfaces, not concrete imports of sibling internals. (Reference: Node.js ecosystem convention; pnpm workspaces best practices.)

**Dependency Inversion Principle (DIP)** — High-level policy modules must not depend on low-level implementation modules. Both should depend on abstractions (interfaces/types). Enforcement layer packages (policy, auth) must sit at a lower layer than the domain packages they govern.

**Interface-first / minimal surface API** — `index.ts` is a deliberate export list, not `export *`. Named exports enable tree-shaking, prevent accidental API leakage, and make breaking changes detectable at compile time. (Reference: TypeScript handbook on module design.)

**Registry / plugin pattern** — Extensible behavior (embedding providers, workflow step handlers, hook adapters) belongs in a registry with a `register(key, impl)` method. Hard-coded `switch/case` factory functions are not extensible without editing core source.

**Dependency injection over module-level singletons** — Singleton state (`let _db = null`) shared across an entire process makes unit tests order-dependent and prevents parallel testing. Accepting a `db` parameter (or a small context object) as an argument is the standard alternative. (Reference: Hono/Fastify patterns; TypeScript DI literature.)

**Event bus / loose coupling** — When packages need to react to each other without forming a direct import edge, an internal event emitter or typed pub/sub channel breaks the coupling without requiring a full DI container.

**Config-as-code validation** — Each package that reads configuration should validate it at the boundary (Zod or a lightweight structural validator) and fail fast with a clear error. Packages that reach into global config without validation silently degrade.

---

## Fulcrum Package Dependency Map

```
@moabualruz/fulcrum-cli  ──imports──>  all 10 other packages  (application shell)
@moabualruz/fulcrum-monitor  ──>  core, memory, policy
@moabualruz/fulcrum-sync     ──>  core, policy
@moabualruz/fulcrum-workflows  ──>  core, memory  (+ peerDeps: planning, teams, worker)
@moabualruz/fulcrum-planning   ──>  core
@moabualruz/fulcrum-policy     ──>  core, teams          ← layer violation
@moabualruz/fulcrum-teams      ──>  core                 ← part of core↔teams cycle
@moabualruz/fulcrum-worker     ──>  core
@moabualruz/fulcrum-worktrees  ──>  core
@moabualruz/fulcrum-memory     ──>  core
@moabualruz/fulcrum-core       ──peerDep──>  teams       ← confirmed circular (madge)
```

Key standalone check:
- `@moabualruz/fulcrum-memory` — works without `@moabualruz/fulcrum-cli`. Dependency-clean.
- `@moabualruz/fulcrum-core` — works in a plain Node script; no CLI dependency.
- `@moabualruz/fulcrum-policy` — depends on `@moabualruz/fulcrum-teams`; cannot be used without it.

---

## Gap Analysis

### GAP-ARCH-1: Confirmed Circular Dependency — `@moabualruz/fulcrum-core` ↔ `@moabualruz/fulcrum-teams`

- **Standard**: A foundational package must never import from a domain-feature package that itself depends on the foundation. The cycle is broken by extracting a shared-types/interfaces package or by using an interface-only shim in the foundation layer.
- **Fulcrum**: `packages/core/src/index.ts:138` uses a dynamic `await import('@moabualruz/fulcrum-teams')` workaround inside `getTeamOps()`. `packages/teams/src/teams.ts:2` statically imports from `@moabualruz/fulcrum-core`. madge confirms two circular paths through `scheduler.ts` and `teams.ts`.
- **Severity**: Critical
- **Fix direction**: Move the `TeamOps` interface (already in `packages/core/src/team-ops.ts`) to a zero-dep `@fulcrum/types` package, or promote it to the core types file and have `@moabualruz/fulcrum-teams` implement it — eliminating the runtime dynamic import entirely.

---

### GAP-ARCH-2: Layer Violation — `@moabualruz/fulcrum-policy` Depends on `@moabualruz/fulcrum-teams`

- **Standard**: An enforcement/policy layer must sit below the domain packages it governs so it can be composed independently. Policy importing from teams means you cannot use policy without teams.
- **Fulcrum**: `packages/policy/package.json` lists `@moabualruz/fulcrum-teams` as a direct dependency. Policy must know about teams to evaluate team-related rules, but it should do so through a shared type/interface, not a concrete package import.
- **Severity**: Critical
- **Fix direction**: Expose a `TeamContext` interface in `@moabualruz/fulcrum-core` (or a shared-types package). Policy rules accept `TeamContext` as a data object; `@moabualruz/fulcrum-teams` satisfies the interface at the call site without policy importing teams.

---

### GAP-ARCH-3: CLI `index.ts` Exports Library-Level Types and Functions

- **Standard**: An application entrypoint (the CLI bin) should not re-export hook interfaces and business-logic functions. If other packages ever import from `@moabualruz/fulcrum-cli`, the entire CLI becomes a transitive dependency, inverting the dependency hierarchy.
- **Fulcrum**: `packages/cli/src/index.ts` exports `HookCli`, `NormalizedHookEvent`, `HookContext`, `HookOutput`, `HookIO`, `normalizeHookEvent`, `runPreHook`, `runPostHook`, `outputRows`, `outputObject`, `requireArg`, `optArg`. These are importable library symbols in an application module.
- **Severity**: Major
- **Fix direction**: Move hook types and business logic (`runPreHook`, `runPostHook`, `normalizeHookEvent`) into `@moabualruz/fulcrum-core` or a new `@fulcrum/hooks` package. The CLI `index.ts` becomes a pure dispatch script with no exported symbols.

---

### GAP-ARCH-4: Wildcard `export *` in Several Packages

- **Standard**: `export *` from an `index.ts` makes every internal symbol a public API contract. Any internal rename or removal becomes a breaking change for downstream consumers, and tree-shaking is impeded.
- **Fulcrum**: `packages/teams/src/index.ts` — four `export *` statements with no filtering. `packages/policy/src/index.ts` — `export * from './types.js'`. `packages/workflows/src/index.ts` — five `export *` statements.
- **Severity**: Major
- **Fix direction**: Replace `export *` with explicit named exports in each `index.ts`. Use a barrel-lint rule (e.g., `eslint-plugin-import/no-export-star`) to enforce this going forward.

---

### GAP-ARCH-5: Module-Level DB Singleton Limits Testability and Composability

- **Standard**: A function that lazily creates and caches a singleton in a module-level variable (`let _db = null`) couples all callers to the same instance. Unit tests that run in parallel, or packages that need multiple DB connections, cannot opt out.
- **Fulcrum**: `packages/core/src/db/client.ts:23` — `let _db: Database.Database | null = null`. Every package that calls `getDb()` shares this singleton. `setDb()` exists for tests but requires global mutation.
- **Severity**: Major
- **Fix direction**: Accept an optional `db` parameter on functions that need the database (or pass a small `CoreContext` object). The singleton remains as a convenience default; callers that need isolation pass their own instance.

---

### GAP-ARCH-6: Embedding Registry Uses Non-Extensible Switch/Case Factory

- **Standard**: A plugin/provider registry should have a `register(name, factory)` method so external code can add providers without modifying core source. The `WorkflowRegistry` class already follows this pattern correctly.
- **Fulcrum**: `packages/core/src/embedding/registry.ts:17` — `createProvider()` is a switch/case over a hard-coded provider list (`local`, `voyage`, `openai`). Adding `anthropic` or `cohere` requires editing core. Contrast with `packages/workflows/src/registry.ts:66` which has `register(def)`.
- **Severity**: Major
- **Fix direction**: Add `registerEmbeddingProvider(name: string, factory: (config) => EmbeddingProvider): void` to the embedding registry, mirroring `WorkflowRegistry`. The built-in providers self-register at module load.

---

### GAP-ARCH-7: Config Loading Centralized Only in `@moabualruz/fulcrum-core`; Other Packages Duplicate Logic

- **Standard**: Each package should obtain its configuration through a single, validated path. Duplicate config-reading code creates drift and silent misconfiguration.
- **Fulcrum**: `packages/memory/src/setup/wizard.ts:30–45` reimplements `getFulcrumConfigPath()`, `readFulcrumConfig()`, and `writeFulcrumConfig()` — logic that already exists in `@moabualruz/fulcrum-core`'s `loadConfig` / `globalDataDir`. Memory also reads the vault path directly from `process.env['FULCRUM_VAULT_PATH']` at `packages/memory/src/vault/client.ts:20` without going through `loadConfig`.
- **Severity**: Major
- **Fix direction**: Expose `readRawConfig(): Record<string, unknown>` and `writeRawConfig(patch)` helpers from `@moabualruz/fulcrum-core`. Delete the duplicates in `@moabualruz/fulcrum-memory`. All env-var reads for config should flow through the single `loadConfig` function.

---

### GAP-ARCH-8: No Event Bus for Cross-Package Loose Coupling

- **Standard**: When packages need to react to domain events (e.g., memory package reacts to run completion, policy reacts to task creation) without forming import edges, a typed event bus breaks the coupling. This is the pattern used by VS Code extensions, NestJS event emitter, and Hono middleware.
- **Fulcrum**: Cross-package coordination (e.g., CLI calling `writeMemory` inside `runPostHook`, monitor calling `evaluatePolicy`) is done via direct function imports. There is no event emitter or pub/sub channel. `emitEvent` in core writes to the DB audit log but does not dispatch to in-process listeners.
- **Severity**: Minor
- **Fix direction**: Add a lightweight `EventBus` (Node.js `EventEmitter` wrapped in typed helpers) to `@moabualruz/fulcrum-core`. Packages subscribe at startup; the CLI orchestrates subscriptions. This avoids direct imports between peer packages.

---

### GAP-ARCH-9: Peer Dependency Interfaces Not Validated at Runtime

- **Standard**: When a package declares a peer dependency (e.g., `@moabualruz/fulcrum-workflows` peers on `@moabualruz/fulcrum-planning`, `@moabualruz/fulcrum-teams`, `@moabualruz/fulcrum-worker`), it should check at runtime whether the peer is present and emit a clear error if it is not, rather than failing on a missing import.
- **Fulcrum**: `packages/workflows/package.json` declares three peer dependencies. The step executor dynamically imports them but has no explicit peer-presence guard. Failure mode is an opaque `Cannot find module` error at step execution time.
- **Severity**: Minor
- **Fix direction**: Add a `checkPeers()` helper that each package with peer dependencies calls on startup. If a peer is absent, throw a `FulcrumError` with an install hint rather than propagating a raw module-not-found.

---

### GAP-ARCH-10: `globalDataDir()` Duplicated in CLI and Core

- **Standard**: A function that computes a platform-specific path should have exactly one implementation. Multiple copies diverge under maintenance.
- **Fulcrum**: `packages/cli/src/index.ts:509–516` — local `globalDataDir()` function. Identical logic lives in `packages/core/src/db/client.ts:14–24` and is already exported from `@moabualruz/fulcrum-core`. The CLI re-implements it locally.
- **Severity**: Minor
- **Fix direction**: Delete the local copy in `packages/cli/src/index.ts` and import `globalDataDir` from `@moabualruz/fulcrum-core` (it is already in the export list).
