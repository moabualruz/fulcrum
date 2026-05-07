# Context: Components

> Component lifecycle engine. Declarative catalog → planner → ledger → executor → adapters. Every managed agent OS surface (rules, hooks, MCPs, skills, packages, profiles) flows through here.

## Vocabulary

- **Component** — a managed unit of agent OS state (`rules.global`, `hooks.format`, `mcp.context7`, `package.repomix`, `profile.default`, …). Identified by stable id `<kind>.<name>`.
- **ComponentKind** — `profile | rules | policy | hook | skill | package | mcp`.
- **Surface** — concrete artifact a component installs (`SurfaceSpec`): a sentinel block, a hook registration, an MCP entry, a skill sync, a vendor command, a directory copy, a JSON patch, …
- **SurfaceKind** — discriminator for adapter dispatch: `sentinel-block | policy-seed | hook-registration | skill-sync | upstream-skill-sync | mcp-registry-entry | mcp-agent-config | vendor-command | directory-copy | file-copy | json-patch | toml-block`.
- **Profile** — a component whose `profileMembers` reference other components. `profile.default`, `profile.minimal`, `profile.verify-all` are the ship profiles.
- **Plan** — ordered list of `ComponentAction`s for a given operation/target/agent set. Produced by the planner; consumed by the executor.
- **Ledger** — SQLite store at `~/.fulcrum/state/global/components.db` recording component status, surfaces, artifacts, operations, and operation steps.
- **RemovePolicy** — `managed-only | sentinel-only | keep-modified | purgeable`. Drives whether `remove`/`--purge` deletes a surface.
- **Adapter** — surface-specific executor module under `src/components/adapters/`. One per `SurfaceKind` family.

## Public surface

- `catalog.ts` — `ALL_COMPONENTS`, `getComponent`, `expandProfile`. No filesystem writes.
- `planner.ts` — `planComponentOperation({ operation, target, agents?, exclude? })`. Pure.
- `ledger.ts` — SQLite open/close, schema migration, surface/artifact/operation upserts.
- `executor.ts` — `executeComponentPlan(plan, opts)`. Dispatches actions to adapters; records ledger rows.
- `adapters/files.ts` — policy-seed and file-copy actions.
- `adapters/sentinel.ts` — sentinel-block actions (rules splice).
- `adapters/hooks.ts` — hook registration/enable/disable.
- `adapters/mcp.ts` — MCP registry/agent-config actions, including disabled-config preservation.
- `adapters/vendor.ts` — vendor-command + skill-sync + upstream-skill-sync (Caveman, Repomix, Cloudflare, Superpowers, authored, upstream).

## Invariants

- The catalog is declarative. No filesystem I/O.
- The planner is pure. Same inputs → identical plan.
- `--dry-run` calls the same planner as real execution and skips writes.
- Adapters never parse CLI args. The CLI lives in `src/cli/component.ts`.
- `RemovePolicy` is honored: `keep-modified` preserves user-modified files unless `--purge`; `sentinel-only` removes only the spliced block; `managed-only` removes only Fulcrum-owned files; `purgeable` is removed by `remove --purge` and only then.
- Package-owned MCPs/skills are removed only through the package component, never through generic registry/skills paths.
- Ledger writes happen after the adapter call succeeds. Failures leave the ledger consistent with disk.

## Cross-context coupling

- Reads `AGENTS` from `src/agents/`.
- Reuses helpers from `src/cli/install.ts` / `uninstall.ts` / `skills.ts` / `upstream-skills.ts` / `vendor-packages.ts` / `repomix-package.ts` / `mcp-registry.ts`.
- The CLI handler in `src/cli/component.ts` is the only command surface; this directory is engine-only.

## ADRs

Context-scoped decisions will live under `src/components/docs/adr/` when recorded. None recorded yet; create the directory lazily from `docs/adr/0000-template.md`.
