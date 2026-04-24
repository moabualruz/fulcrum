# R6 — Modular Architecture: standalone + tightly integrated

> Research brief: how mature projects structure code so each component works as
> a standalone tool AND integrates seamlessly when composed.
>
> Audit target: Fulcrum's 10+ packages (`fulcrum-core`, `memory`, `planning`,
> `policy`, `sync`, `teams`, `worker`, `workflows`, `worktrees`, `monitor`,
> `cli`) currently have hard `workspace:*` dependencies that prevent standalone
> use. We want each to be usable alone (e.g. `fulcrum-memory` as a local CLI
> for semantic notes) but compose into a tight control plane.

---

## 1. Architecture patterns (hexagonal, clean, modular monolith, plugin)

### 1.1 Hexagonal architecture (Ports & Adapters — Alistair Cockburn, 2005)

The original hexagon metaphor says: the application (the "inside") knows
nothing about the outside world. It defines **ports** — interfaces that
describe what it needs or offers — and **adapters** implement those ports for
a specific technology (HTTP, SQLite, Redis, CLI, test mock).

Two kinds of ports:

- **Driving / primary ports** — "how the outside drives us". A REST adapter, a
  CLI adapter, or a test harness all drive the same application through the
  same port. The port is a use-case-shaped interface (e.g.
  `IngestNote(note)`).
- **Driven / secondary ports** — "what we need from the outside". A `NoteStore`
  port is implemented by a `SqliteNoteStore`, an `InMemoryNoteStore`, etc.

Why this matters for standalone-vs-integrated:

- The **core** is a plain library with no I/O and no knowledge of the host
  process. It can run inside a CLI, inside a daemon, inside a test, or
  embedded as a worker inside another package.
- Adapters are small and replaceable. The SQLite adapter can be swapped for a
  Postgres adapter without touching the core.
- A package's public API is its ports, not its adapters. Other packages depend
  on the port contract, not on the concrete SQLite implementation.

### 1.2 Clean architecture (Robert C. Martin, 2012)

Clean architecture formalises hexagonal into concentric rings:

1. **Entities** — enterprise business rules (plain data + invariants).
2. **Use cases** — application-specific rules (orchestrate entities to satisfy
   one user goal).
3. **Interface adapters** — controllers, presenters, gateways. Translate
   between the outside world and use cases.
4. **Frameworks & drivers** — HTTP frameworks, DB drivers, UI toolkits.

The **dependency rule**: source code dependencies point inward only. An outer
ring may know about an inner ring; an inner ring must never know an outer
ring's names. Interfaces defined in use-cases are implemented by adapters
(dependency inversion).

The practical contribution of clean architecture over hexagonal is the
explicit use-case layer. Each use case is a single class/function that
orchestrates one goal. For Fulcrum, a use case would be
`PlanNextTask(workspaceId, agent) -> Plan`, and it would know nothing about
whether it is being driven by an HTTP route, a CLI command, or a daemon tick.

### 1.3 Onion architecture (Jeffrey Palermo, 2008)

Onion is strictly a refinement of clean/hexagonal. Layers are:

- Domain model (center)
- Domain services
- Application services
- Infrastructure (outermost)

The key Onion insight: **infrastructure code depends on the domain**, not the
other way around. A repository interface lives in the domain; its SQLite
implementation lives in infrastructure. Same shape as ports-and-adapters.

### 1.4 Hexagonal vs Onion vs Clean — subtle differences

| Axis | Hexagonal | Onion | Clean |
|---|---|---|---|
| Primary metaphor | symmetric ports on a polygon | concentric rings | concentric rings |
| Distinguishes driving vs driven | **yes** | no | no (but implicit via controllers/gateways) |
| Emphasises use cases | no | no | **yes** |
| Dependency rule direction | inward | inward | inward |
| Where interfaces live | "inside" | domain / application | use case layer |
| Practical feel | library-first | DDD-first | application-first |

For Fulcrum the meaningful distinction is hexagonal's **symmetry**. Our
packages need both driving adapters (CLI, daemon, test runner, LSP-like RPC)
and driven adapters (SQLite, filesystem, git, shell). That symmetry is
exactly what hexagonal gives.

### 1.5 Modular monolith (Simon Brown, Kamil Grzybek, Sam Newman)

A modular monolith is **one deployable unit with deliberately enforced module
boundaries**. Key principles (from Grzybek's primer and Brown's C4 talks):

- Modules are organised by **business capability**, not technical layer. A
  "memory" module owns its ingestion, storage, search, and eviction; it does
  not share tables with the "planning" module.
- Each module has a **public API**, a **private implementation**, and a
  database / storage space it owns. Outside code talks to the module through
  its public API only.
- Modules communicate via **in-process calls** (facade) or **in-process
  events** (pub-sub). Never by reaching into another module's private types.
- A modular monolith is a stepping stone: if you later split a module into a
  service, the public API becomes an RPC boundary and the event bus becomes a
  message queue.

Grzybek's three independence factors: minimal dependencies, weak coupling,
stable dependencies. Fulcrum today fails on stability — every package depends
on `fulcrum-core` which is the most volatile package.

### 1.6 Plugin architectures (editors, IDEs)

Editors solve an even harder version of this problem: the core must not know
about any specific plugin, but must let plugins contribute new features that
look first-class. Common techniques:

- **Contribution points**: a declarative table of slots the core knows about
  (commands, keybindings, menus, tree views, languages). Plugins write into
  the table via manifest metadata rather than by calling core APIs.
- **Activation events**: core lazy-loads a plugin only when a trigger occurs
  (file of type X opened, command Y invoked, view Z revealed). This keeps
  startup fast and lets hundreds of plugins coexist.
- **Capability negotiation**: the LSP / DAP pattern. Client and server exchange
  a capabilities object so each end knows what the other supports without
  assuming.
- **Host API**: the core exposes a single stable module (`vscode`, `vim.api`)
  that plugins import. The host API is versioned separately from internal
  modules.

### 1.7 Contribution points (VSCode)

VSCode extensions declare what they contribute in `package.json`:

```json
{
  "contributes": {
    "commands": [{ "command": "hello.world", "title": "Hello World" }],
    "languages": [{ "id": "toml", "extensions": [".toml"] }],
    "menus": { "editor/context": [{ "command": "hello.world", "when": "editorLangId == toml" }] }
  },
  "activationEvents": ["onLanguage:toml", "onCommand:hello.world"]
}
```

Core VSCode does not import anything from the extension. It reads the
manifest at install time, indexes contribution points, and activates the
extension only when an activation event fires. At that moment the extension
receives a `vscode` object and can register handlers imperatively.

Two lessons for Fulcrum:

1. **Declarative metadata beats code registration** for discovery. A root
   `fulcrum.json` can list installed packages and their contribution points
   without forcing core to import them.
2. **Lazy activation** means every package can ship its own startup cost
   without inflating the CLI's cold start.

---

## 2. Case studies

### 2.1 VSCode

- **Architecture**: a thin "extension host" process that runs extensions in
  isolation from the renderer. Core communicates with the host via RPC.
- **Contribution model**: declarative in `package.json#contributes`. Core has
  a static list of known contribution points; extensions plug into those
  slots.
- **Activation**: `activationEvents` (e.g. `onLanguage:python`, `onCommand:…`,
  `onStartupFinished`, `workspaceContains:**/*.py`). Nothing loads until
  needed.
- **API surface**: one stable `vscode` module, published as
  `@types/vscode`, with semver-ish guarantees tied to the editor version
  (`engines.vscode: ^1.80.0`).
- **Standalone use**: an extension is an NPM package; you can unit-test it by
  mocking the `vscode` module. The core is not importable standalone (it is
  an app), but the *shape* is that extensions never depend on core code
  directly, only on the `vscode` API.
- **Dependency graph**: extension → `vscode` API (peer) → core. Extensions
  may depend on other extensions via `extensionDependencies` in manifest;
  VSCode resolves order.
- **Glue**: the extension host + activation scheduler + command registry.
  Core exposes no "import me" surface to extensions; everything goes through
  the registry.

### 2.2 Neovim / Lua plugins

- **Plugin discovery**: by runtimepath. Any directory matching
  `plugin/`, `lua/<name>/`, `autoload/`, `ftplugin/` is picked up.
- **`lua/` modules** are loaded lazily via `require('name')`, giving each
  plugin a namespace.
- **Capability declaration**: plugins declare filetypes, user commands,
  autocmds, keymaps. Core exposes `vim.api.*` and `vim.lsp.*` as the stable
  host API.
- **Composition**: plugin managers (lazy.nvim, packer) resolve
  plugin-of-plugin dependencies and defer loading until `event`, `ft`, or
  `cmd` triggers — the same activation-event idea as VSCode.
- **Standalone**: any plugin's Lua module is an ordinary Lua library; you can
  `require` it in headless Neovim or in plain Lua if you stub `vim.*`.
- **Lesson**: the host API (`vim.api`) is the only allowed coupling.

### 2.3 Obsidian

- **Plugin API**: a single `obsidian` module, shipped as `@types/obsidian`.
  Plugins subclass `Plugin` and register commands, views, settings tabs via
  `this.addCommand`, `this.registerView`, etc.
- **Plugin-to-plugin dependencies**: community plugins can depend on the API
  of other plugins via `app.plugins.getPlugin(id)`. This is a runtime
  service-locator — degrades gracefully if the other plugin is missing.
- **Manifest**: `manifest.json` with `id`, `minAppVersion`, `isDesktopOnly`.
  No hard dep lock-in; the host discovers the plugin by folder.
- **Lesson**: optional plugin-of-plugin via runtime lookup + null-check is a
  simple, robust pattern.

### 2.4 Rails engines

- **An engine is a miniature Rails app** that can be mounted inside another
  Rails app. It has its own `app/`, `config/routes.rb`, migrations, tests.
- **Standalone testing**: engines ship a `test/dummy/` host app that is a
  minimal Rails app used only to exercise the engine in isolation.
- **Mount**: `mount MyEngine::Engine, at: '/my'` in host's routes.
- **Initialisation hook**: engines register initializers that run when the
  host app boots (`initializer 'my.setup' do |app| … end`).
- **Autoloading**: the engine contributes to the host's autoload paths so
  host code can reference engine classes, but engine code should only talk
  to the host through its own config.
- **Distribution**: published as a gem; discovered via Bundler. Users just
  add the gem to their `Gemfile`.
- **Lesson for Fulcrum**: ship each package with a "host shim" dummy entry
  so the package can run stand-alone in tests and demos.

### 2.5 Django apps

- **An app is a Python package** with `models.py`, `views.py`, `urls.py`,
  `admin.py`, `apps.py`, `migrations/`.
- **Registration**: add the app to `INSTALLED_APPS` in settings. Django calls
  `AppConfig.ready()` during startup, which is where the app wires signals,
  registers admin, etc.
- **Signals**: Django's pub-sub. An app can emit a signal; other apps can
  listen without the emitter knowing the listeners exist. Perfect decoupling
  via an event bus.
- **Contrib apps** (`django.contrib.auth`, `django.contrib.admin`) are the
  canonical modular pattern — each is optional, each works alone with a
  minimal settings file, and they compose in a real project.
- **Standalone**: `python -m django startapp` creates an app; you can test it
  with a minimal `settings.py` that lists only that app.
- **Lesson**: an `AppConfig`-style ready hook is how each package can self-
  register without core knowing about it.

### 2.6 Tauri

- **Core Rust** (`tauri` crate) hosts a webview. **Plugins** are separate
  crates (e.g. `tauri-plugin-fs`, `tauri-plugin-sql`) that register commands
  and event handlers via `Builder::plugin(…)`.
- **Plugins are Cargo crates** and reuse Cargo features to opt into platform
  or backend support.
- **Capability manifest**: Tauri v2 added a capabilities system where the
  host app declares which commands a webview window is allowed to call,
  enforced at runtime.
- **Standalone**: a Tauri plugin is a normal Rust library plus optional
  JS glue. The Rust half is usable without Tauri (it is just a library)
  and Tauri-specific code lives behind `#[cfg(feature = "tauri")]` gates.
- **Lesson**: separate the algorithmic core from the host-integration layer
  with a feature flag.

### 2.7 dbt packages

- **A dbt package is a dbt project** (models, macros, tests, seeds) that can
  be referenced from another dbt project via `packages.yml`.
- **Standalone use**: you can `dbt run` the package alone to validate it.
- **Composition**: `dbt deps` clones the package into `dbt_packages/`; models
  and macros become available under the package's namespace.
- **No runtime coupling**: packages can depend on other packages, but only
  by referencing their macros/models through the package namespace.
- **Lesson**: the same artifact is either a leaf (standalone) or a dependency
  (composed). A registry file (`packages.yml`) is the only wiring.

### 2.8 Airflow providers

- **A provider package** (`apache-airflow-providers-postgres`) contains
  operators, hooks, sensors, connections for a single technology.
- **Plugin discovery**: providers use Python entry points (setuptools
  `entry_points`). At Airflow startup the core scans entry points under
  groups like `apache_airflow_provider` and loads metadata.
- **Manifest**: each provider has a `get_provider_info()` function that
  returns metadata (version, connection types, extra links).
- **Standalone**: you can `pip install apache-airflow-providers-postgres`
  and import its hooks in any Python script without Airflow. The operators
  still need Airflow as a peer dep.
- **Lesson**: **Python entry points = declarative, out-of-tree plugins**.
  The Node.js equivalent is reading `package.json` files on disk and looking
  at a custom field like `fulcrum.contributes`.

### 2.9 PNPM / Nx / Turborepo monorepo patterns

**PNPM workspaces**:

- `pnpm-workspace.yaml` lists package directories.
- `workspace:*` protocol in `package.json` dependencies links local packages.
  On `pnpm publish`, the protocol is rewritten to the actual version.
- Subpath exports (Node's `exports` field) let a single package expose
  multiple entrypoints.

**Nx**:

- **Project graph**: Nx computes an import graph across packages and can
  enforce module boundaries with `@nx/enforce-module-boundaries` ESLint rule.
  You tag each project (`scope:public`, `type:feature`, `type:util`) and
  declare which tags may depend on which.
- **Task orchestration**: `nx affected` runs builds/tests only on changed
  packages and their dependents, using the graph.
- **Executors**: each package can expose its own build/test executors.
- **Publishable vs non-publishable libraries**: Nx distinguishes internal
  libraries (not published) from public ones (`nx release` handles versioning).

**Turborepo**:

- Lighter-weight than Nx; focuses on caching and task orchestration.
- `turbo.json` declares pipelines; Turborepo hashes inputs and caches outputs
  across the monorepo.
- No built-in module boundary enforcement; relies on TS project references
  or ESLint.

### 2.10 Rust workspace + features — Ruff, Biome, Deno, Cargo itself

- **Cargo workspace**: one `Cargo.toml` at the root lists member crates; each
  crate has its own manifest. Workspace-level dependency versions are shared.
- **Features**: optional, additive flags per crate. A feature may enable
  other features or optional dependencies (`dep:serde`). Enabling a feature
  must never remove functionality (unification rule).
- **Ruff**: split into `ruff_linter`, `ruff_formatter`, `ruff_cache`,
  `ruff_python_ast`, `ruff_diagnostics`, `ruff_source_file`, `ruff_workspace`,
  and the thin `ruff` binary crate at the top. The binary crate is the only
  place that depends on everything; each library crate has a narrow,
  documented purpose and minimal deps.
- **Biome**: `biome_js_parser`, `biome_js_formatter`, `biome_rowan`,
  `biome_cli`. Parser and formatter are independent libraries; the CLI is a
  separate crate that composes them.
- **Deno**: `deno_core` (V8 bindings + op registry), `deno_runtime`
  (permissions, web APIs), `deno_std` (stdlib), and extension crates
  (`deno_fetch`, `deno_web`, `deno_net`) each expose an `Extension` value
  that the runtime can register. Extensions are Deno's contribution points.
- **Lesson**: the **binary is always a thin composition crate**. Every
  library crate is publishable to crates.io on its own.

---

## 3. Library + application from one codebase

### 3.1 The tension

A single package can be:

- A **library** — others import it and call its API.
- An **application** — a CLI or daemon that end users run.

Most languages make you pick. The good patterns let you ship both without
duplicating code.

### 3.2 Rust: `lib.rs` + `main.rs`

A single crate can have both a `src/lib.rs` (library) and `src/main.rs`
(binary). The binary depends on the library; Cargo builds both. Multiple
binaries go in `src/bin/*.rs`. This is the simplest version of the pattern:
the binary is a 20-line wrapper that calls into the library.

### 3.3 Node / TypeScript: dual exports + `bin`

- `package.json` `"main"`, `"module"`, `"types"`, `"exports"` fields define
  the library entrypoints.
- `"bin": { "fulcrum-memory": "./dist/cli.js" }` defines the CLI.
- The CLI file imports from `./index.js` (the library entry). Users who
  `npm i -g` get the CLI; users who `npm i` as a dep get the library.

### 3.4 Subpath exports for granular imports

```json
{
  "name": "fulcrum-memory",
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
    "./store": { "import": "./dist/store/index.js", "types": "./dist/store/index.d.ts" },
    "./search": { "import": "./dist/search/index.js", "types": "./dist/search/index.d.ts" },
    "./cli": { "import": "./dist/cli.js" },
    "./package.json": "./package.json"
  },
  "bin": { "fulcrum-memory": "./dist/cli.js" }
}
```

Consumers can now:

- `import { MemoryStore } from 'fulcrum-memory'` — main API.
- `import { SqliteStore } from 'fulcrum-memory/store'` — just the store.
- `import { bm25 } from 'fulcrum-memory/search'` — just search.
- Run `fulcrum-memory ingest ./notes` from the shell — standalone CLI.

Subpath exports also **hide internals**: anything not listed cannot be
imported. This is the Node-native way to enforce encapsulation, equivalent
to Rust's `pub(crate)`.

### 3.5 Conditional exports

Useful for Fulcrum when a package has both a browser-safe core and a
Node-only adapter:

```json
{
  "exports": {
    ".": {
      "node": "./dist/node.js",
      "browser": "./dist/browser.js",
      "default": "./dist/index.js"
    }
  }
}
```

### 3.6 Examples in the wild

- **ink** — React renderer for CLIs. Library. You write CLIs as React trees.
- **oclif** — full CLI framework with a plugin model; each command can live
  in its own package; `oclif-dev` discovers plugins via `package.json`
  metadata.
- **commander** — library only; you compose it into your own `bin` script.
- **esbuild** — single binary but also a Node library via `esbuild` npm
  package. The binary and the library expose the same API surface.

### 3.7 "bin scripts + library entry" discipline

The rule we adopt for Fulcrum packages: every package that has anything
useful to a human must ship a `bin` script. The script is a 30-line file
that imports from its own library entry and uses a tiny argv parser. No
business logic in the bin script.

---

## 4. Dependency management techniques

### 4.1 Hard deps vs peer deps vs optional vs dynamic imports vs registry

**Hard deps** (`dependencies`). Package A statically imports from B at the
top of a source file. B is installed automatically with A. Breaks standalone
use if A and B both depend on a large shared core, because installing A
pulls in all of core.

**Peer deps** (`peerDependencies`). Package A declares "I need B to be
supplied by whoever installs me". B is not installed automatically. Good for
plugins that must use the host's copy of the shared core. With NPM 7+,
peers are installed by default unless marked optional; with pnpm the
resolution is stricter.

**Optional peer deps** (`peerDependenciesMeta: { "@x/y": { "optional": true } }`).
A says "if B is present, I can use it; otherwise I degrade". A must guard
every reference to B at runtime (`try { await import('@x/y') } catch`).
The classic example is `winston` transports or `react-native` native
modules.

**Dynamic imports** (`await import('@x/y')`). The reference to B is a
string, not a static import. Bundlers can code-split around it. Runtime can
catch the `ERR_MODULE_NOT_FOUND` and continue. Works even if B is a
regular dep — you still get the lazy-load benefit.

**Registry pattern**. A publishes a mutable registry object:
`import { registerProvider } from 'fulcrum-core'`. B calls
`registerProvider(myProvider)` at module load. Later, A iterates its
registry. The dependency arrow points from B→A only, not A→B. Core has no
compile-time knowledge of B, but B must be loaded for its side effects.

**Service locator / DI container**. A shared `Context` object is created by
the host at startup and passed into each module's `init(ctx)` function.
Modules pull what they need out of the context. No module imports another
module's runtime code; all coupling is through the context's typed keys.

**Event bus / pub-sub**. A emits `bus.emit('task.completed', payload)`; B
subscribes via `bus.on('task.completed', handler)`. Neither side knows the
other exists. Great for notifications and workflow triggers; poor for
anything that needs a return value.

**Plugin contribution points** (VSCode-style). A maintains a declarative
table keyed by contribution type. B writes into the table via metadata or
an explicit registration call. A reads the table when it needs to
enumerate contributors.

### 4.2 Table: which patterns enable standalone + integrated

| Pattern | Standalone use of A? | Standalone use of B? | Tight integration? | Typing? | Lazy load? |
|---|---|---|---|---|---|
| Hard dep (A→B) | no (needs B) | yes | yes | full | no |
| Peer dep (A declares B) | no (needs host) | yes | yes | full | no |
| Optional peer dep | **yes** (degrades) | yes | conditional | partial | yes |
| Dynamic import (`import()`) | **yes** (try/catch) | yes | conditional | via `import type` | **yes** |
| Registry in shared module | yes (empty registry) | yes | yes | typed via core | yes |
| Service locator / Context | **yes** (null context) | yes | yes | typed via context | yes |
| Event bus | **yes** (no listeners) | yes | loose | typed via event map | yes |
| Contribution points (manifest) | **yes** | **yes** | yes | via manifest schema | **yes** |

**The patterns that give us standalone + tight integration**: optional
peer deps, dynamic imports, registries in the shared core, service
locators, event buses, contribution points. Hard deps and strict peer deps
force a choice.

For Fulcrum the recommended mix is:

1. A tiny **`fulcrum-kernel`** package that defines ports, contribution
   points, and a shared `Context`. Every package peer-depends on it.
2. Runtime **registries** inside the kernel for the things core needs to
   enumerate (agents, tools, memory providers, policies).
3. **Dynamic imports** in the CLI's orchestrator for optional packages
   (`fulcrum-teams`, `fulcrum-workflows`) — no hard dep.
4. An **event bus** for cross-package notifications that do not need a
   return value.

---

## 5. Circular dependency avoidance

### 5.1 Why cycles appear

- Two packages share a type; one imports it from the other, and vice versa.
- A utility grows into the wrong package; now everyone imports it and it
  imports back.
- A barrel file (`index.ts`) re-exports everything, pulling in modules
  that transitively import the barrel.

### 5.2 Techniques to break cycles

- **Interfaces-only package**: extract the shared contract into a leaf
  package (`fulcrum-contracts`) that has zero runtime code. Both cyclers
  depend on it; neither depends on the other.
- **Dependency inversion**: the "higher" module defines an interface; the
  "lower" module implements it; composition happens at the app edge.
- **Lazy / runtime registration**: B calls `coreRegistry.register(x)`
  during its init; core never imports B.
- **Event bus**: side A emits, side B listens. Arrow is eliminated on
  both sides in favour of an arrow to the bus package.
- **Lazy getters / function refs**: store a factory `() => import('./b')`
  instead of a top-level `import`. Resolved on first call.
- **Type-only imports** (`import type`): breaks runtime cycles while keeping
  compile-time type checking. TypeScript erases them.

### 5.3 Why cycles are a symptom

If package A and package B need each other, at least one of:

1. The boundary is wrong — merge them or split along a different seam.
2. There is a missing leaf package — extract the shared piece.
3. Coupling should be at runtime, not compile-time — use a registry.

### 5.4 Tools for detection

- **madge**: draws and analyses a JS/TS import graph. `madge --circular
  packages/**/src` lists cycles. Good for quick triage.
- **dep-tree** (gabotechs/dep-tree): multi-language, reports cycles and
  module boundaries violations.
- **ts-prune / knip**: find unused exports that often turn out to be the
  reason for an unnecessary import.
- **ESLint `import/no-cycle`**: fails CI on new cycles.
- **Nx `@nx/enforce-module-boundaries`**: tag-based rules ("only `scope:
  memory` packages may import `scope:memory-internal`").
- **TypeScript project references**: turn each package into its own
  tsbuild unit; cycles become build errors.

---

## 6. API surface design for composability

### 6.1 Semver discipline with inter-package deps

- **MAJOR** = public API break. If `fulcrum-core` goes from 0.x to 1.0 and
  any package peer-depends on it, those packages must bump their
  `peerDependencies` range.
- **MINOR** = additive changes. Adding a new export, a new optional
  parameter, a new contribution point. Consumers get the benefit without
  breakage.
- **PATCH** = bugfix. No signature change.

For monorepos: use **changesets** (or `nx release`) to track which packages
changed and bump them together. Interdependent packages bump each other
automatically if the underlying one had a breaking change.

### 6.2 Tree-shaking

- **Named exports only** in barrel files, never default exports.
- **No top-level side effects** in library code; if a module must register
  something, do it inside an exported `init()` function, not at import time.
- `"sideEffects": false` in `package.json` tells bundlers they can drop
  unused exports. Opt-out specific files: `"sideEffects": ["./dist/init.js"]`.
- **Small, orthogonal exports** tree-shake better than megamodules.

### 6.3 Barrel files — good or bad?

Good when small, explicit, and free of side effects. Bad when:

- They re-export everything from every subdirectory (`export * from './*'`)
  and pull in half the package at every `import { x } from 'pkg'`.
- They cause cold-start regressions because one consumer needs one function
  but ends up initialising ten modules.

**Mitigation**: use subpath exports (`pkg/store`, `pkg/search`) for the
"I only want this slice" case, and keep the root barrel deliberately small
(only the facade API).

### 6.4 Subpath exports for granularity without splitting packages

Already covered in §3.4. The key point: you can keep 10 modules inside one
published package and still let consumers depend on only one entrypoint,
getting most of the benefits of per-module packages without the npm
publishing overhead.

### 6.5 Type-only imports

```ts
import type { NoteStore } from 'fulcrum-memory'
```

Compile-time type check; zero runtime emit. This lets `fulcrum-planning`
reference a `NoteStore` shape for typing function parameters without
creating a runtime edge in the import graph. Combined with dynamic
imports, it gives you typed lazy loading:

```ts
import type { NoteStore } from 'fulcrum-memory'

async function getStore(): Promise<NoteStore | null> {
  try {
    const mod = await import('fulcrum-memory')
    return new mod.SqliteStore()
  } catch {
    return null
  }
}
```

---

## 7. Configuration layering

### 7.1 Goal

Each module has its own config, but users want one place to configure
everything. Different layers must compose cleanly.

### 7.2 Patterns in the wild

- **Single root file with per-module sections**: `pyproject.toml`
  (`[tool.ruff]`, `[tool.pytest]`), `package.json` (`"eslintConfig"`,
  `"prettier"`, `"jest"`). One file, namespaced keys. Simple, discoverable,
  human-editable. Downside: the root file grows.
- **Per-module files merged by the host**: `.eslintrc` + `.prettierrc` +
  `tsconfig.json`. Each tool owns its file. Downside: more files.
- **Env var prefixes per module**: `FULCRUM_MEMORY_DB_PATH`,
  `FULCRUM_POLICY_WIP_DEFAULT`. Good for ops; bad for large config trees.
- **CLI flags**: per-command, highest priority. Good for transient
  overrides; bad for anything structural.

### 7.3 Recommended hierarchy

```
defaults (compiled into each module)
  ↓ merged over by
global config (root fulcrum.toml or fulcrum.config.{ts,json})
  ↓ merged over by
per-module config (optional, rarely used)
  ↓ merged over by
environment variables (FULCRUM_<MOD>_<KEY>)
  ↓ merged over by
CLI flags (--memory.db-path /tmp/foo.db)
```

- Each package publishes a **config schema** (Zod or JSON Schema). The
  kernel loads the root config, slices out the module's section, validates
  it against the schema, and passes a typed config object via the service
  locator.
- **Standalone mode**: when a module is used directly, it looks for its own
  `fulcrum-<name>.toml` first, then falls back to `FULCRUM_<MOD>_*` env vars,
  then defaults. No dependency on the root file.
- **Integrated mode**: the kernel owns the root file and provides the
  module its section. The module never reads disk directly when integrated.

---

## 8. Testing composable packages

### 8.1 Isolation: testing a single package

- **No cross-package imports in tests** except the kernel and test utilities.
- **Mock adapters**: provide an in-memory implementation of every port the
  package declares. Tests inject the mock; production injects the real
  adapter.
- **Avoid mocking module registries**; instead, use an explicit "test
  kernel" fixture that starts empty and lets the test register what it
  wants.
- **Dummy host app** (Rails engine pattern): ship a tiny integration host
  inside the package's `test/` folder so the package can be exercised end-
  to-end without the full monorepo.

### 8.2 Contract tests at interface boundaries

When package A defines a port and package B implements it:

- A ships a suite of **contract tests**: a function that takes an
  implementation and asserts the implementation honours the port contract.
- B's tests import the suite and run it against its implementation. Any
  change in A's contract immediately fails B's tests.
- This replaces flaky end-to-end integration tests with a tight, fast,
  per-package check.

### 8.3 Integration tests that compose multiple packages

- Live in a top-level `tests/integration/` package or a dedicated
  `fulcrum-e2e` workspace.
- Use the real kernel, real packages, real SQLite. No mocks.
- Keep these slow tests out of the inner test loop; run on CI and before
  release.
- Nx / Turbo: `nx affected --target=test` should run them only when a
  package in the composition changed.

### 8.4 Fake vs stub vs mock

- **Fake**: a working in-memory implementation. `InMemoryNoteStore`
  satisfies the `NoteStore` port fully. Preferred — tests become readable.
- **Stub**: returns canned data. OK for edge cases.
- **Mock**: asserts interactions. Use sparingly; couples tests to call
  sequences.

---

## 9. Distribution and discovery

### 9.1 How does a user of A discover that B exists?

- **npm search / keywords**: each Fulcrum package should declare
  `"keywords": ["fulcrum", "fulcrum-plugin", "<capability>"]`. `npm search
  fulcrum-plugin` returns everything.
- **A central registry** in the docs: `https://fulcrum.dev/plugins`, a
  simple markdown index + a JSON feed for programmatic consumption.
- **Inside the CLI**: `fulcrum plugin search`, `fulcrum plugin install
  fulcrum-teams`. The CLI queries npm's registry API filtered by keyword.
- **Contribution metadata in manifest**: each package declares in its
  `package.json` under `"fulcrum"`:

  ```json
  {
    "fulcrum": {
      "kind": "plugin",
      "contributes": {
        "commands": [{ "id": "teams.spawn", "title": "Spawn team" }],
        "activation": ["onCommand:teams.spawn"]
      }
    }
  }
  ```

  The kernel scans installed packages' `package.json` at startup.

### 9.2 `peerDependenciesMeta` for optionality

```json
{
  "peerDependencies": {
    "fulcrum-kernel": "^1.0.0",
    "fulcrum-memory": "^1.0.0"
  },
  "peerDependenciesMeta": {
    "fulcrum-memory": { "optional": true }
  }
}
```

`fulcrum-memory` is optional; the package degrades if it is missing.

### 9.3 How Rails engines, Django, Airflow advertise themselves

- **Rails engines**: installed via Bundler; the host adds one line to
  `Gemfile`. Engines self-register via `Rails::Engine` subclass and
  `isolate_namespace`.
- **Django**: `INSTALLED_APPS += ['myapp']` + `AppConfig.ready()`.
- **Airflow providers**: Python entry points. No host-side changes.

For Fulcrum the nearest Node.js equivalent is: scan `node_modules` for
packages with a `"fulcrum"` field in `package.json`, deduped via pnpm's
project graph. This is also how `oclif` and `hardhat` discover plugins.

### 9.4 `engines` and `peerDependencies` versioning

- Use `"engines": { "node": ">=20" }` so incompatible installs fail fast.
- Use ranges on peer deps (`^1.0.0`), not pins. Otherwise plugins become
  impossible to upgrade.

---

## 10. Anti-patterns to avoid

1. **God package owning everything**. A `fulcrum-core` that exports the
   kernel, every adapter, every use case, and every plugin's types. It
   becomes the single point of recompilation and breaks tree-shaking.
2. **Barrel files that import half the monorepo at startup**. Prefer
   subpath exports and narrow barrels.
3. **Packages with no standalone utility**. If
   `fulcrum-worktrees` is unusable without the full kernel + memory +
   planning + policy, it is not a package; it is a subdirectory of the
   app.
4. **Hardcoded package names in `await import()`**. If you will ever rename
   the package, use a resolver indirection (`kernel.resolve('memory')`) so
   renames happen in one place.
5. **Untyped contribution points**. A contribution table keyed by `string`
   with `any` values. You will ship a bug and find it at runtime. Use Zod
   / JSON Schema to validate at load time.
6. **Mutable module state** (top-level `let state = {}`) shared across
   consumers. Two packages importing the same module now share a hidden
   singleton. Move state into an explicit `Context` owned by the host.
7. **Relying on import order for initialisation**. If `teams.ts` must be
   imported before `workflows.ts` or things break silently, you have a
   latent ordering bug. Use an explicit `init(ctx)` hook and let the kernel
   run them in dependency order.
8. **Publishing every internal file** via `"files": ["dist"]` + no
   `exports` field. Consumers will reach into `fulcrum-memory/dist/private/foo`
   and your refactor will break them.
9. **Cross-package DB access**. Package B reads a table owned by package
   A. Congratulations, A can never migrate that table without breaking B.
   Go through A's public API.
10. **Workspace-only `file:` protocol**. If the only way to install a
    package is `file:../core`, it cannot be published and cannot be used
    standalone. Use `workspace:*` with pnpm (which rewrites on publish) or
    publish to a registry.
11. **Private types leaking through public APIs**. If a public function
    returns `InternalStoreHandle`, the "private" type is now part of your
    public API. Use structural types on the boundary.
12. **Circular peer deps**. If A peer-depends on B and B peer-depends on A,
    nobody can install either without the other. Extract the shared
    contract into a leaf `contracts` package.

---

## 11. Standards checklist for Fulcrum audit

### 11.1 MUST

- [ ] Every package has a **single, documented public API** defined via
      `"exports"` in its `package.json`.
- [ ] Every package can be installed and imported (or run as a CLI)
      **without any sibling Fulcrum package** except `fulcrum-kernel`
      (leaf contracts).
- [ ] `fulcrum-kernel` contains **only contracts, ports, the service
      locator, and the plugin manifest schema**. No runtime logic, no I/O.
- [ ] No package has a **hard runtime dep** on another Fulcrum package;
      cross-package coupling is either peer (kernel), optional peer, or
      dynamic `import()`.
- [ ] Every package ships a **CLI wrapper** (`bin`) or documents why it
      has none (pure library).
- [ ] The dependency graph is **acyclic**. Enforced by `madge --circular`
      in CI and `eslint-plugin-import` `no-cycle`.
- [ ] Every package passes its **contract tests** against the kernel
      ports it implements.
- [ ] Each package's tests run **without installing siblings** in CI.
- [ ] Each package publishes a **changelog** and bumps semver correctly
      on every release (changesets or `nx release`).
- [ ] `peerDependencies` and `peerDependenciesMeta` are used correctly;
      `workspace:*` is rewritten on publish.
- [ ] No mutable top-level module state; state lives in the `Context`.
- [ ] Every contribution point is **typed** (Zod schema or equivalent) and
      validated when a plugin is loaded.

### 11.2 SHOULD

- [ ] Each package defines a **Zod config schema** and loads config via
      kernel when integrated, via its own loader when standalone.
- [ ] `"sideEffects": false` in every library package (or narrowed to the
      few files that do have side effects).
- [ ] Subpath exports (`fulcrum-memory/store`, `…/search`) for granular
      imports.
- [ ] Barrel files kept small: only the facade API, not every file.
- [ ] Integration tests live in a dedicated `fulcrum-e2e` workspace,
      not scattered across packages.
- [ ] Each package ships a **`test/dummy/`** or `examples/` directory
      showing a minimal standalone use.
- [ ] The CLI discovers plugins by scanning installed packages for
      `"fulcrum": { "kind": "plugin" }` in `package.json`.
- [ ] Plugin activation is lazy: a contribution point fires loading,
      not package install.
- [ ] Each package has a short `README.md` with standalone usage.

### 11.3 MAY

- [ ] Optional peer deps for nice-to-have integrations
      (`fulcrum-memory` → `fulcrum-embeddings`).
- [ ] Cross-package events via a typed event bus in the kernel.
- [ ] Feature-flagged exports for experimental APIs
      (`fulcrum-memory/unstable`).
- [ ] An `fulcrum-e2e` scenario runner that composes every package for
      smoke tests.
- [ ] A project-graph lint (Nx tags) to enforce architecture boundaries.
- [ ] Plugin-of-plugin: a package may peer-depend (optionally) on
      another plugin to extend it.

---

## 12. Recommended concrete patterns for Fulcrum's 10+ packages

### 12.1 Package classification

Group the packages by their role in the architecture:

| Package | Role | Standalone CLI? | Depends on |
|---|---|---|---|
| `fulcrum-kernel` (NEW) | contracts, ports, service locator, plugin manifest, event bus | no | nothing |
| `fulcrum-core` | use cases, orchestration, scheduler | `fulcrum run` | kernel (peer) |
| `fulcrum-memory` | notes, semantic search, eviction | `fulcrum-memory` | kernel (peer) |
| `fulcrum-planning` | plan synthesis, re-plan on failure | `fulcrum-plan` | kernel (peer), core (optional) |
| `fulcrum-policy` | WIP limits, gates, RBAC | `fulcrum-policy check` | kernel (peer) |
| `fulcrum-sync` | git sync, remote mirror | `fulcrum-sync` | kernel (peer) |
| `fulcrum-teams` | multi-agent orchestration | `fulcrum-teams` | kernel (peer), core (optional) |
| `fulcrum-worker` | task executor, shell, sandbox | `fulcrum-worker` | kernel (peer) |
| `fulcrum-workflows` | durable steps, retries | `fulcrum-workflow` | kernel (peer) |
| `fulcrum-worktrees` | git worktrees, branch rotation | `fulcrum-worktree` | kernel (peer) |
| `fulcrum-monitor` | logs, metrics, health | `fulcrum-monitor` | kernel (peer) |
| `fulcrum-cli` | top-level CLI binary, dispatches to others | `fulcrum` | kernel (peer), all others (dynamic) |

### 12.2 The kernel

A new leaf package. Contains:

- **Ports / interfaces** for every cross-package contract: `NoteStore`,
  `Planner`, `PolicyGate`, `Worker`, `Workspace`, `Sync`, etc.
- **Plugin manifest schema** (Zod): the shape of a package's `"fulcrum"`
  field in `package.json`.
- **Service locator / Context**: a typed map of kernel-defined keys to
  implementations. Host code instantiates one per run.
- **Event bus**: typed pub-sub with a declared event map.
- **Config schema primitives**: Zod helpers + the root loader that
  produces a validated `FulcrumConfig`.
- **Activation engine**: reads manifests, schedules lazy init, handles
  activation events (`onCommand`, `onStartup`, `onWorkspaceLoad`).

Kernel has **zero runtime deps on any other Fulcrum package**. Other
packages **peer-depend** on kernel with a range like `^1.0.0`.

### 12.3 Dependency graph (target)

```
                     ┌────────────────┐
                     │  fulcrum-cli  │  (binary, dynamic imports)
                     └────────┬───────┘
                              │ dynamic
        ┌──────────┬──────────┼──────────┬──────────┬──────────┐
        ▼          ▼          ▼          ▼          ▼          ▼
   core      memory     planning    policy     teams     workflows
        │          │          │          │          │          │
        └──────────┴──────────┴──────────┴──────────┴──────────┘
                              │ peer
                              ▼
                     ┌────────────────┐
                     │ fulcrum-kernel│
                     └────────────────┘
```

- The arrow from each feature package to kernel is `peerDependencies`.
- The CLI has optional peer deps on every feature package and
  dynamic-imports them.
- Feature packages **do not import each other**. If `planning` needs
  memory's search, it does so via the `NoteStore` port from kernel, which
  the host has populated from a `fulcrum-memory` implementation at
  runtime.

### 12.4 Standalone entrypoint for `fulcrum-memory`

Layout:

```
packages/memory/
  package.json
  src/
    index.ts          # library entry — exports ports + SqliteStore
    cli.ts            # bin — `fulcrum-memory` CLI
    store/index.ts    # subpath — SqliteStore
    search/index.ts   # subpath — BM25, reranker
    config.ts         # Zod schema for memory config
    init.ts           # init(ctx: Context) — the integration hook
  test/
    dummy/            # minimal standalone host for tests
```

`package.json`:

```json
{
  "name": "fulcrum-memory",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
    "./store": { "import": "./dist/store/index.js", "types": "./dist/store/index.d.ts" },
    "./search": { "import": "./dist/search/index.js", "types": "./dist/search/index.d.ts" },
    "./init": { "import": "./dist/init.js", "types": "./dist/init.d.ts" },
    "./package.json": "./package.json"
  },
  "bin": { "fulcrum-memory": "./dist/cli.js" },
  "peerDependencies": { "fulcrum-kernel": "^1.0.0" },
  "peerDependenciesMeta": { "fulcrum-kernel": { "optional": false } },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "zod": "^3.22.0"
  },
  "sideEffects": false,
  "keywords": ["fulcrum", "fulcrum-plugin", "memory", "semantic-search"],
  "fulcrum": {
    "kind": "plugin",
    "contributes": {
      "ports": ["NoteStore", "Search"],
      "commands": [
        { "id": "memory.ingest", "title": "Ingest notes" },
        { "id": "memory.search", "title": "Search notes" }
      ]
    },
    "activation": ["onCommand:memory.*", "onPort:NoteStore"]
  }
}
```

**Standalone mode** (`fulcrum-memory ingest ./notes`):

1. CLI loads `fulcrum-memory.toml` or env vars for config.
2. CLI constructs a `SqliteStore` directly.
3. CLI runs the command — no kernel needed.

**Integrated mode** (CLI runs the daemon):

1. Kernel reads root config, finds the memory section.
2. Kernel discovers `fulcrum-memory` via `package.json` scan.
3. Kernel dynamic-imports `fulcrum-memory/init` and calls `init(ctx)`.
4. `init` registers the `SqliteStore` as the `NoteStore` port in `ctx`.
5. Planning/teams/etc. pull `NoteStore` out of `ctx` and use it.

### 12.5 Which packages should be library-only

Packages whose standalone CLI has no end-user value may skip the `bin`:

- `fulcrum-kernel` — library only. No CLI.
- Possibly `fulcrum-workflows` if it is a pure engine with no
  human-facing commands. Still publishable and importable.

Everything else should ship a `bin` that does something useful:

- `fulcrum-memory ingest`, `fulcrum-memory search`, `fulcrum-memory gc`.
- `fulcrum-policy check <task>`, `fulcrum-policy list`.
- `fulcrum-worktree create`, `fulcrum-worktree list`, `fulcrum-worktree gc`.
- `fulcrum-sync push`, `fulcrum-sync pull`.
- `fulcrum-plan <goal>`.
- `fulcrum-monitor tail`, `fulcrum-monitor metrics`.
- `fulcrum-worker run <task.json>`.
- `fulcrum-teams spawn`, `fulcrum-teams list`.

The top-level `fulcrum` binary (from `fulcrum-cli`) is a **composition
point only**: it loads the kernel, resolves plugins, and dispatches to
subcommands. It is intentionally thin — no business logic in the binary.

### 12.6 How integration is composed by `fulcrum-cli`

```ts
// packages/cli/src/main.ts
import { createKernel, loadConfig, ActivationEngine } from 'fulcrum-kernel'

async function main(argv: string[]) {
  const config = await loadConfig()
  const kernel = createKernel(config)

  // Discovery: scan installed packages for the "fulcrum" manifest.
  const manifests = await kernel.discoverPlugins()

  // Activation: lazily load a plugin only when its activation events fire.
  const engine = new ActivationEngine(kernel, manifests)
  engine.start(argv)

  // Dispatch: the engine activates the right plugin for this command.
  await engine.runCommand(argv)
}
```

The CLI has no top-level imports of `fulcrum-memory`, `fulcrum-planning`,
etc. Everything is loaded via `await import(pkg)` inside the activation
engine. Bundlers must not eagerly bundle them; we keep them as external.

### 12.7 Cross-package contracts live in kernel

Example: the `NoteStore` contract.

```ts
// fulcrum-kernel/src/ports/note-store.ts
export interface NoteStore {
  put(note: Note): Promise<string>
  get(id: string): Promise<Note | null>
  search(query: string, k?: number): Promise<Note[]>
}

export const NoteStorePort = portKey<NoteStore>('NoteStore')
```

Planning references the port by key, not the memory package:

```ts
// fulcrum-planning/src/use-cases/plan.ts
import { Context, NoteStorePort } from 'fulcrum-kernel'

export async function plan(ctx: Context, goal: Goal): Promise<Plan> {
  const store = ctx.tryGet(NoteStorePort) // may be null if memory absent
  const hints = store ? await store.search(goal.text, 5) : []
  // … use hints if present, otherwise plan without memory
}
```

Planning gracefully degrades when memory is not installed.

### 12.8 Config layering for Fulcrum

```
~/.config/fulcrum/fulcrum.toml                    # user defaults
./fulcrum.toml                                    # project config
./fulcrum.<module>.toml                           # rare per-module override
FULCRUM_MEMORY_DB_PATH=...                        # env overrides
fulcrum memory ingest --db ./alt.sqlite           # cli flags
```

Each package registers its **config schema** during `init`. Kernel
validates the merged config once at startup and fails fast on errors.
Standalone CLIs use the same schema with just the module's section.

### 12.9 Testing strategy per package

- Unit tests live in `packages/<name>/src/**/*.test.ts`. They only import
  from kernel and from the package's own modules. No sibling imports.
- **Contract tests** live in `fulcrum-kernel/test-kit/contracts/*.ts`.
  `fulcrum-memory` imports the `NoteStore` contract suite and runs it
  against `SqliteStore`. This replaces most integration tests.
- **`test/dummy/`** ships a minimal host the package can run inside.
  Rails-engine-style.
- `fulcrum-e2e` is a separate workspace package that depends on
  everything and runs scenarios against a real daemon.

### 12.10 Concrete migration steps for the current repo

1. **Create `fulcrum-kernel`** with ports extracted from today's
   `fulcrum-core`. Nothing else moves yet.
2. **Convert every workspace dep** from `dependencies` to
   `peerDependencies` on kernel, plus `peerDependenciesMeta` for
   cross-package optionality.
3. **Delete cross-package imports**. For each one, either move the contract
   into kernel or switch to a runtime lookup via `ctx`.
4. **Add `exports` and `bin`** to every package. Introduce subpath exports
   where the package has distinct module groups.
5. **Add `"fulcrum"` manifest metadata** and build the kernel's plugin
   discovery.
6. **Move `fulcrum-cli`** to dynamic imports for feature packages; remove
   top-level imports.
7. **Add `madge --circular` + `eslint-plugin-import/no-cycle`** to CI.
   Fix cycles.
8. **Ship `test/dummy/`** for at least memory, policy, worker — the three
   with the most obvious standalone value.
9. **Publish a kernel 1.0.0** and feature packages 0.x until their
   public APIs stabilise.
10. **Document standalone usage** in each package's README.

### 12.11 What this buys us

- A user who only wants a local semantic notes store runs
  `npm i -g fulcrum-memory && fulcrum-memory ingest ./notes`. Zero
  Fulcrum daemon. Small install.
- A user who wants the full control plane runs `npm i -g fulcrum-cli`
  and gets everything. Feature packages are optional peer deps.
- Contributors can ship a third-party plugin
  `@acme/fulcrum-slack-notifier` that peer-depends on kernel and
  registers an event listener. No core changes needed.
- Refactoring one package cannot break another as long as it does not
  change the kernel contract. Semver does the rest.
- Tests run per-package in seconds, not minutes. `fulcrum-e2e` stays
  the heavy integration suite.

---

## 13. References

- Alistair Cockburn — "Hexagonal Architecture" (2005), original essay:
  https://alistair.cockburn.us/hexagonal-architecture/
- Robert C. Martin — "The Clean Architecture" (2012):
  https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
- Jeffrey Palermo — Onion Architecture series (2008):
  https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/
- Simon Brown — "Modular Monoliths" (C4 / talks), e.g.
  https://simonbrown.je/
- Kamil Grzybek — "Modular Monolith Primer":
  https://www.kamilgrzybek.com/blog/posts/modular-monolith-primer
- Sam Newman — "Monolith to Microservices" (O'Reilly, 2019), chapter on
  modular monoliths.
- Vlad Khononov — "Learning Domain-Driven Design" (O'Reilly, 2021),
  chapters on bounded contexts and module boundaries.
- VSCode Contribution Points:
  https://code.visualstudio.com/api/references/contribution-points
- VSCode Activation Events:
  https://code.visualstudio.com/api/references/activation-events
- Neovim Lua plugin guide: `:help lua-guide`; lazy.nvim docs:
  https://github.com/folke/lazy.nvim
- Obsidian Plugin API: https://docs.obsidian.md/Plugins/
- Rails Engines guide:
  https://guides.rubyonrails.org/engines.html
- Django Applications:
  https://docs.djangoproject.com/en/stable/ref/applications/
- Tauri Plugin guide (v2):
  https://v2.tauri.app/develop/plugins/
- dbt packages: https://docs.getdbt.com/docs/build/packages
- Apache Airflow providers:
  https://airflow.apache.org/docs/apache-airflow-providers/
- Cargo features reference:
  https://doc.rust-lang.org/cargo/reference/features.html
- Cargo workspaces:
  https://doc.rust-lang.org/cargo/reference/workspaces.html
- Ruff monorepo layout: https://github.com/astral-sh/ruff
- Biome monorepo layout: https://github.com/biomejs/biome
- Deno extensions model: https://deno.com/ (deno_core, deno_runtime,
  extension crates)
- Node subpath + conditional exports:
  https://nodejs.org/api/packages.html#subpath-exports
- pnpm workspaces and `workspace:*` protocol:
  https://pnpm.io/workspaces
- Nx enforce-module-boundaries:
  https://nx.dev/features/enforce-module-boundaries
- Turborepo pipelines: https://turbo.build/repo/docs
- Changesets: https://github.com/changesets/changesets
- madge (circular dep detector): https://github.com/pahen/madge
- dep-tree: https://github.com/gabotechs/dep-tree
- eslint-plugin-import `no-cycle`:
  https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-cycle.md
- oclif plugin architecture: https://oclif.io/docs/plugins
- hardhat plugin model:
  https://hardhat.org/hardhat-runner/docs/advanced/building-plugins
- Martin Fowler — "ServiceLocator":
  https://martinfowler.com/articles/injection.html#UsingAServiceLocator
- Martin Fowler — "Event Collaboration":
  https://martinfowler.com/eaaDev/EventCollaboration.html
