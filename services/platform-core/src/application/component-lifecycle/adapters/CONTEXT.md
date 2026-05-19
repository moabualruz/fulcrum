# Component Lifecycle: Adapters

> Surface-specific executors invoked by the component executor. One module per `SurfaceKind` family; each turns a planned `ComponentAction` into a concrete write against an agent runtime, the rules tree, the hook registry, the MCP registry, or a vendor package.

## Language

**AdapterModule**:
A file under this directory exporting an `apply{Kind}Action` entrypoint that dispatches one `ComponentAction`.
_Avoid_: handler, executor, driver.

**RulesAdapter**:
`sentinel.ts` — splices the Fulcrum sentinel block into each agent's primary rules file.
_Avoid_: rules-splicer, rules-writer.

**PolicyAdapter**:
`files.ts` — seeds and removes the tool-output policy TOML.
_Avoid_: policy-seeder, file-copier.

**HookAdapter**:
`hooks.ts` — enables or disables a named hook recipe for one agent target.
_Avoid_: hook-installer, recipe-runner.

**McpAdapter**:
`mcp.ts` — registers, unregisters, enables, or disables MCP servers across agent configs, with disabled-config preservation.
_Avoid_: mcp-installer, server-driver.

**VendorAdapter**:
`vendor.ts` — install/remove path for skill mirrors, caveman, and third-party packages (Cloudflare, Superpowers, ast-grep, Tavily, Pi MCP adapter).
_Avoid_: package-runner, integration-runner.

**VendorComponent**:
The discriminator (`skills-authored | skills-upstream | caveman | cloudflare | superpowers | ast-grep | tavily | pi-mcp-adapter`) classifying a `package.*` or `skills.*` component id inside `vendor.ts`.
_Avoid_: vendor-kind, package-type.

**PackageOwnedUpstream**:
An upstream skills source bound to a package component (e.g. Cloudflare); removed only via that package's adapter path, never via the generic upstream-skills sync.
_Avoid_: vendor-skills, bundled-skills.

## Relationships

- The **executor** dispatches one **ComponentAction** to exactly one **AdapterModule** based on `SurfaceKind`.
- A **VendorAdapter** call may chain through `removeUpstreamSkillsIfLockExists` before delegating to a **PackageOwnedUpstream** install/uninstall.
- The **McpAdapter** treats `mcp.registry` as a fan-out target: enable applies every `BUILTIN_MCPS` entry; remove unregisters every server in the registry.
- Every adapter honors `change: "noop" | "preserve"` by returning without side effects, and respects `dryRun` by delegating to the underlying CLI module's dry-run path.

## Example dialogue

> **Dev:** "If I add a new `SurfaceKind`, where does the dispatch live?"
> **Domain expert:** "The executor switches on `SurfaceKind` and calls the matching `apply{Kind}Action`. Add a new **AdapterModule** here, export its entrypoint, and extend the executor's switch — adapters never self-register."
> **Dev:** "And a new third-party package?"
> **Domain expert:** "Extend `VendorComponent` in `vendor.ts`, add install/remove arms, and route `package.<name>` through `classifyVendorComponent`. If it owns upstream skills, list its source under `PACKAGE_OWNED_UPSTREAM_SOURCES` so the generic upstream sync skips it."

## Flagged ambiguities

- "Adapter" overlaps with the broader **Adapter** definition in the parent context (one per `SurfaceKind` family). Here it refers specifically to the module file; the parent's definition still governs the surface-family boundary.
- `vendor.ts` handles both **VendorAdapter** (`vendor-command`) and skill-sync surfaces (`skill-sync`, `upstream-skill-sync`); resolved: classification by `componentId` inside `classifyVendorComponent`, not by `SurfaceKind` alone.
