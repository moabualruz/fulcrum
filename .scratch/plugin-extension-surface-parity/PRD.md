# Plugin and Extension Surface Parity Repair Plan

Status: needs-triage
Source: docs/superpowers/plans/2026-04-30-plugin-extension-surface-parity.md

> For agentic workers: REQUIRED SUB-SKILLS: use `subagent-orchestration`, `subagent-driven-development`, `tdd`, and `verification-before-completion`. This plan is written for one continuous implementation run with maximum useful parallelism. Use checkbox syntax for progress.

**Goal:** Repair Fulcrum's plugin/extension/package lifecycle so every managed vendor package is handled across all five supported CLI agents, using official/native installers first and mirroring the complete agent-visible, runtime-required package surface everywhere else.

**Architecture:** Add a shared package surface manifest, package mirror planner, package parity auditor, and per-agent target map. Refactor existing package-specific code onto that shared layer. Keep package-specific commands where official/native installers differ, but make every package prove which surfaces it ships and which surfaces each agent received.

**Tech Stack:** Bun TypeScript, `bun:test`, existing `AGENTS` registry, existing component lifecycle engine, existing MCP registry, TOML/JSON helpers, official CLI commands where available.

**Branch Policy:** Stay on `main` for integration. Parallel write workers must use external worktrees under `~/.config/superpowers/worktrees/fulcrum/<lane>/` and must own disjoint files. Parent owns final integration, final verification, and checklist updates.

## Scope

This is not a Repomix-only repair and not a Codex-only repair. Scope covers all Fulcrum-managed packages and all supported agents:

```text
Agents:
  claude-code
  codex
  gemini
  opencode
  pi

Managed package/component families:
  package.caveman
  package.repomix
  package.cloudflare
  package.superpowers
  skills.authored
  skills.upstream
  graphify project integration
  ast-grep agent skill
  tavily agent skills
  context7 MCP
  Pi MCP adapter
```

Package surface means every agent-visible or runtime-required artifact shipped by a vendor plugin, extension, or package:

```text
S = skills
R = rules, memory, context files, routing instructions
M = MCP servers and MCP metadata/config
C = slash commands, prompts, command TOML/Markdown
A = agents, subagents, explorer agents, reviewers
H = hooks and hook scripts/config
T = tools, direct tool definitions, helper binaries/scripts needed at runtime
P = plugin/extension/package metadata, manifests, assets, app config, README/LICENSE when native installer exposes them
```

Mirroring target is full `S/R/M/C/A/H/T/P` where the receiving agent supports the surface. When a surface has no equivalent native primitive, record an explicit unsupported reason in package status and doctor output. Do not silently omit it.

Generated CLI agent mirrors must exclude source backups such as `.original.md`, `.backup.md`, `_archive`, `_template`, `.git`, `node_modules`, and worktree folders. Project source keeps `.original.md`.

## Recovered Requirements

These requirements were recovered from older docs and commits, not from the recently edited docs alone.

1. Official-first is the core value: use vendor/native installers where they exist; never re-author vendor content; mirror vendor-authored content verbatim to agents without a native installer.
2. All five agents are first-class: Claude Code, Codex CLI, Gemini CLI, OpenCode, Pi CLI.
3. A `package.*` component owns the full vendor package surface, not only skills and not only MCPs.
4. Package-owned MCPs, skills, hooks, commands, agents, rules, and tools must not also be claimed by generic registry/remove paths.
5. Required MCPs should be set up as accessible disabled config where native disabled state exists, even when Fulcrum does not enable them by default.
6. Default enable state is separate from install/setup state. Install should make required/builtin MCPs available; enable should remain intentional.
7. Full-profile install should preserve historical bootstrap coverage. Minimal install may stay conservative, but must not pretend disabled setup happened where it did not.
8. Generated agent folders must be clean mirrors. Source backups stay only in the project source tree.
9. Docs must describe verified behavior only. No doc edit may mask an implementation drift.

Historical evidence points used during audit:

```text
57a3ba4:docs/mcp.md        official-first, native install first, default MCP set later superseded by product decision
a78d8ab:docs/mcp.md        package ownership hidden from registry remove/disable
f9880ed:docs/mcp.md        disabled MCP configs for Gemini/OpenCode; context7 added
4bf868d:docs/mcp.md        Codex disabled MCP support with enabled = false
e8b5cd4:HANDOVER.md        W2/W3 cross-agent MCP and vendor asset mirror gaps
f4269cd:docs/mcp.md        pre-latest Repomix package-default behavior
b889a4b, 890e30d           latest Repomix docs/code edits that narrowed the visible gap
```

## Official Source Map

These official references define the native package model. Workers must re-check them before implementation if command syntax or manifest fields are touched.

| Agent | Official model | Best-practice Fulcrum behavior | Sources |
|---|---|---|---|
| Claude Code | Marketplace repo with `.claude-plugin/marketplace.json`; plugin dirs with `.claude-plugin/plugin.json`; plugins can ship skills, commands, agents, hooks, MCP servers, settings, and assets. | Use `claude plugin marketplace add` and `claude plugin install` for packages that publish Claude plugins. Mirror only for non-Claude agents. Do not emulate Claude plugin internals for Claude when official installer works. | https://docs.claude.com/en/docs/claude-code/plugins, https://docs.claude.com/en/docs/claude-code/plugin-reference |
| Codex CLI | Plugin package with required `.codex-plugin/plugin.json`; optional `skills/`, `.app.json`, `.mcp.json`, `agents/`, `commands/`, `hooks.json`, `assets/`; marketplace added with `codex plugin marketplace add`. | Prefer Codex plugin install when vendor publishes one. Otherwise mirror package into Codex plugin cache/config when the source package contains Codex plugin metadata; mirror skills/commands/agents/hooks/MCP/app/assets into Codex-native paths/config. | https://developers.openai.com/codex/plugins/build?install-scope=workspace, https://developers.openai.com/codex/hooks |
| Gemini CLI | Extension under `.gemini/extensions/<name>` with `gemini-extension.json`; extension may ship commands, MCP servers, context files, hooks/settings, skills, and agents. | Prefer `gemini extensions install` when vendor publishes one. Otherwise build an extension mirror with manifest, commands, MCP, skills, agents, hooks/context/rules, and package assets. | https://google-gemini.github.io/gemini-cli/docs/extensions/ |
| OpenCode | Plugin modules registered through `opencode.json`; plugins hook events and add tools. OpenCode also supports native config for MCPs, skills, agents, commands, and rules/context files. | Prefer vendor OpenCode plugin/package install when published. Otherwise mirror every supported surface into OpenCode config/directory primitives and add unsupported reasons for non-portable plugin runtime code. | https://opencode.ai/docs/plugins/ |
| Pi CLI | Packages and extensions can provide skills, commands, tools, subagents, hooks, MCP servers, context providers, themes, and templates; user packages tracked in `~/.pi/packages.json`; skills load from `.pi/skills` or `~/.pi/agent/skills`. | Prefer `pi install` for official packages. Otherwise mirror every supported surface into Pi agent directories/config. Pi MCP disabled-state support must be verified through `pi-mcp-adapter`; if no safe disabled bit exists, registry keeps disabled availability and doctor reports `disabledConfigUnsupported`. | https://pi.dev/docs/latest/packages, https://pi.dev/docs/latest/extensions, https://pi.dev/docs/latest/skills |

## Gap And Drift Analysis

### Requirement-to-implementation gaps

| Requirement | Current state | Gap |
|---|---|---|
| Full package surface across all five agents | Repomix is close only for Codex/Gemini. OpenCode/Pi receive only a subset. Caveman, Cloudflare, and Superpowers mirrors are mostly skill-first outside native agents. | Need one surface manifest and parity audit for every package/agent pair. |
| Official-first, then mirror everything | Current code has package-specific helpers, but each helper decides independently what "everything" means. | Need shared `PackageSurfaceManifest` plus target map so omission is testable. |
| Disabled setup for required MCPs | Registry-owned disabled configs are written for Codex/Gemini/OpenCode. Claude/Pi are skipped because no safe disabled bit is documented. Component adapter disable currently removes config in some paths. | Need explicit install-vs-enable semantics, component disable preserving disabled config where possible, and doctor output for unsupported disabled config. |
| Package-owned MCPs hidden from generic registry | Partially implemented for Repomix and some Cloudflare/Superpowers paths. | Need package ownership encoded in the package manifest and audit output so generic MCP status cannot fight package status. |
| All shipped surfaces: skills, rules, tools, commands, agents, hooks | Current tests mostly count skills and a few MCP/config files. | Need tests that assert `S/R/M/C/A/H/T/P` per package and per agent, with unsupported reasons. |
| Graphify/ast-grep/Tavily lifecycle | `fulcrum init` runs vendor commands, but component lifecycle cannot inspect/remove/verify those installed package surfaces. | Add component/audit entries for project integrations and upstream skill installers so setup is not fire-and-forget. |
| Docs as truth | Recent docs say broader coverage than code proves. `docs/skills.md` and `HANDOVER.md` conflict on Superpowers and Repomix. | Docs update only after tests and live artifact audit pass. |

### Current package matrix

Legend: `ok` means verified or intentionally native; `partial` means some surfaces copied; `missing` means package surfaces not installed/mirrored; `unsupported` means no known native primitive and must be reported.

| Package | Claude Code | Codex | Gemini | OpenCode | Pi | Gap |
|---|---|---|---|---|---|---|
| Caveman | ok native plugin `S/H/R/P` | partial `S/H/P` mirror | ok native extension | partial `S` mirror | partial `S` mirror | OpenCode/Pi lack full commands/hooks/rules/package config if upstream ships them. Codex mirror must be manifest-audited, not assumed. |
| Repomix | ok native plugins `S/M/C/A/R/P` | partial-to-ok `S/M/C/A/R/P` mirror | partial-to-ok extension `S/M/C/A/R/P` | partial `S/M/A` | partial `S/M` | OpenCode lacks commands/rules/package metadata. Pi lacks commands/agent/rules/package metadata. |
| Cloudflare | ok native Claude plugin `S/M/C/P` | partial `S/M` | partial `S/M` | partial `S/M` | partial `S/M` | Non-Claude agents lack plugin metadata, commands, rules/context, assets, and any runtime package config if shipped. |
| Superpowers | ok native Claude plugin `S/C/A/H/P` | partial `S` | ok native Gemini extension | ok native OpenCode plugin | ok native Pi package, fallback partial `S` | Codex lacks commands/agents/hooks/package metadata. Pi fallback lacks commands/agents/hooks/package metadata. |
| Graphify | ok vendor CLI for Claude/Codex/Gemini/OpenCode | ok vendor CLI | ok vendor CLI | ok vendor CLI | partial skill fallback | Pi lacks official installer; component lifecycle cannot inspect/remove/verify graphify surfaces. |
| ast-grep | fire-and-forget `npx skills add` | fire-and-forget | fire-and-forget | fire-and-forget | fire-and-forget | Not component-managed or removable; no parity/status audit. |
| Tavily | fire-and-forget `npx skills add` + MCP registry | fire-and-forget | fire-and-forget | fire-and-forget | fire-and-forget | Skills and MCP availability are split; not package-audited. |
| context7 | MCP only | MCP only | MCP only | MCP only | MCP only | Good as MCP-only package if no official skill exists, but disabled/native config support must be explicit. |
| Pi MCP adapter | n/a | n/a | n/a | n/a | partial native package | Need disabled-state capability documented and tested; current adapter writes enabled surfaces only. |

### Live artifact drift found on this machine

| Agent | Observed state | Drift |
|---|---|---|
| Claude Code | Fulcrum rules sentinel present; native Caveman, Cloudflare, Superpowers, Repomix plugins installed. | Claude native side mostly healthy; package audit must include plugin commands/hooks/agents/MCP metadata, not just skill counts. |
| Codex | Fulcrum rules sentinel present; Caveman and Repomix plugin config present; Cloudflare/Superpowers skills present but no active Codex plugin config. | Cloudflare/Superpowers Codex package surfaces incomplete. |
| Gemini | `GEMINI.md` imports `@AGENTS.md`; Repomix/Superpowers/Caveman extensions present; Cloudflare skills top-level only. | Need verify import target and Cloudflare extension/package surface. |
| OpenCode | Fulcrum rules sentinel present; Superpowers plugin configured; Repomix skills/agent/MCP present; Cloudflare/Caveman skills only. | Repomix commands/rules and Cloudflare/Caveman package surfaces incomplete. |
| Pi | Fulcrum rules sentinel present; Superpowers package installed; Repomix/Cloudflare/Caveman skills and MCP config present. | Repomix commands/agent/rules and Cloudflare/Caveman fallback package surfaces incomplete; disabled MCP support unresolved. |

### MCP setup drift

Current mode split:

```text
fulcrum install --profile minimal:
  registers builtin MCP definitions
  enables deepwiki + context7 where no user state exists
  writes disabled native config for registry-owned disabled MCPs on Codex/Gemini/OpenCode
  does not write disabled native config for Claude/Pi because no safe disabled bit is currently implemented

fulcrum install --profile full:
  does minimal
  installs package surfaces
  some package-owned MCPs are active by package default, especially Repomix where Fulcrum owns the mirror
```

Required fix:

```text
1. Keep install/setup separate from enable.
2. For registry-owned MCPs, write disabled config on Codex/Gemini/OpenCode by default.
3. Preserve disabled config during `fulcrum mcp disable` and `fulcrum component disable` where the agent supports disabled state.
4. For Claude/Pi, record disabled availability in Fulcrum registry and doctor as `disabledConfigUnsupported` unless a safe native disabled state is implemented.
5. For package-owned MCPs, use package manifest ownership and package default enable state. Generic registry paths may inspect, but must not remove/disable package-owned native config unless the package component is operated on.
```

## Target Technical Design

### Shared package model

Add `src/cli/package-surfaces.ts`:

```ts
export type PackageSurfaceKind =
  | "skill"
  | "rule"
  | "mcp"
  | "command"
  | "agent"
  | "hook"
  | "tool"
  | "metadata"
  | "asset";

export interface PackageSurface {
  packageId: string;
  kind: PackageSurfaceKind;
  name: string;
  sourcePath: string;
  relativePath: string;
  sha256: string;
  runtimeRequired: boolean;
  packageOwned: boolean;
}

export interface PackageSurfaceManifest {
  packageId: string;
  source: {
    repo?: string;
    ref?: string;
    localPath?: string;
    officialInstallers: Partial<Record<AgentId, readonly string[]>>;
  };
  surfaces: readonly PackageSurface[];
}

export interface AgentSurfaceTarget {
  agentId: AgentId;
  surface: PackageSurface;
  targetPath?: string;
  configMutation?: string;
  nativeInstaller?: readonly string[];
  support: "native" | "mirror" | "unsupported";
  unsupportedReason?: string;
}
```

Discovery rules:

```text
skills:
  skills/**/SKILL.md
  */SKILL.md when upstream package documents that layout

commands:
  commands/**/*.md
  commands/**/*.toml
  slash-command folders documented by package metadata

agents:
  agents/**/*.md
  subagents/**/*.md

MCP:
  .mcp.json
  mcp.json
  mcpServers in plugin/extension/package manifests
  package-specific MCP metadata files

hooks:
  hooks.json
  hooks/**/*.*
  manifest hook entries
  TypeScript plugin hook modules when the receiving agent can load them

rules/context:
  AGENTS.md
  CLAUDE.md
  GEMINI.md
  rules/**/*
  configs/<agent>/**/*
  routing/context files referenced by manifests

metadata/assets:
  .claude-plugin/**/*
  .codex-plugin/**/*
  gemini-extension.json
  package.json
  opencode plugin files
  pi package/extension files
  .app.json
  assets/**/*
  README.md and LICENSE when native install exposes them or runtime config references them
```

Filtering rules:

```text
Exclude from generated agent mirrors:
  .git/**
  node_modules/**
  _archive/**
  _template/**
  **/*.original.md
  **/*.backup.md
  worktree directories
  tests/docs not loaded by runtime unless native installer exposes them as package assets

Never mutate:
  vendor-authored skill frontmatter names
  user-owned config outside Fulcrum-managed marked blocks/keys
```

### Per-agent mirror targets

Add `src/cli/package-mirror.ts`:

| Agent | Mirror target strategy |
|---|---|
| Claude Code | Prefer native plugin install. Mirror only Fulcrum-authored Claude plugin cache/marketplace where Fulcrum owns it. Use sentinel/markers for any non-native fallback. |
| Codex | Prefer Codex plugin install. Otherwise create plugin cache/config when `.codex-plugin/plugin.json` exists; mirror `skills/`, `.mcp.json`, `commands/`, `agents/`, `hooks.json`, `.app.json`, `assets/`, and rules/context into Codex-native locations. |
| Gemini | Prefer `gemini extensions install`. Otherwise create `.gemini/extensions/<package>/gemini-extension.json` and mirror commands, MCP servers, skills, agents, hooks/context/rules, metadata/assets. |
| OpenCode | Prefer vendor OpenCode plugin entry. Otherwise mirror skills, agents, commands, MCP config, rules/context, and hooks where OpenCode can load them. TypeScript plugin runtime code is supported only when registered through `opencode.json`; otherwise report unsupported. |
| Pi | Prefer `pi install`. Otherwise mirror skills, commands, tools, subagents, hooks, MCP config through `pi-mcp-adapter`, context providers, themes/templates where package files exist and Pi docs support them. |

Add `PackageParityReport`:

```ts
export interface PackageParityReport {
  packageId: string;
  agentId: AgentId;
  sourceCounts: Record<PackageSurfaceKind, number>;
  installedCounts: Record<PackageSurfaceKind, number>;
  missing: readonly AgentSurfaceTarget[];
  unsupported: readonly AgentSurfaceTarget[];
  leakedSourceOnlyFiles: readonly string[];
  ok: boolean;
}
```

`fulcrum component status --json` and `fulcrum doctor --json` must include this report for package components.

### Component behavior

Component install/remove/enable/disable must follow:

```text
install:
  run official installer where available
  mirror all supported surfaces where no installer exists
  write registry-owned disabled MCP config where supported
  write markers/ledger with package ownership and surface hashes

remove:
  uninstall official package if Fulcrum installed it or marker exists
  remove Fulcrum-managed mirrors/config keys only
  remove package-owned MCPs only through the package component
  default remove keeps user-owned state; `--purge` deletes package caches/markers

enable:
  enable package surfaces only where native disabled state exists
  enable package-owned MCPs through package component
  enable registry MCPs through MCP registry

disable:
  preserve disabled config where native disabled state exists
  do not delete setup on disable
  return explicit unsupported message where no disabled state exists
```

### Future Fulcrum-authored plugin/extension baseline

This repair must leave Fulcrum ready to author its own future packages without repeating the same drift.

Design decision:

```text
Canonical source:
  one Fulcrum package source tree
  one package surface manifest
  generated or checked agent-native package outputs
  parity tests for every supported agent before shipping

No single "generic" plugin artifact:
  Claude receives a Claude plugin
  Codex receives a Codex plugin
  Gemini receives a Gemini extension
  OpenCode receives an OpenCode plugin/config package
  Pi receives a Pi package/extension
```

Future package output requirements:

| Agent | Required Fulcrum-authored package output |
|---|---|
| Claude Code | `.claude-plugin/plugin.json`, marketplace metadata when published, native `skills/`, `commands/`, `agents/`, hooks, MCP, settings, and assets. |
| Codex | `.codex-plugin/plugin.json`, `skills/`, `commands/`, `agents/`, `hooks.json`, `.mcp.json`, `.app.json`, `assets/`, and plugin config entry. |
| Gemini | `gemini-extension.json`, extension-scoped commands, MCP servers, skills, agents, hooks/settings, context/rules files, and assets. |
| OpenCode | plugin module/config entry plus native skills, commands, agents, MCP config, rules/context, hooks/tools where supported. |
| Pi | Pi package/extension metadata plus skills, commands, tools, subagents, hooks, MCP servers via adapter/native config, context providers, themes/templates where supported. |

Every future package must run:

```bash
bun test src/cli/package-surfaces.test.ts src/cli/package-mirror.test.ts src/cli/package-parity.test.ts
bun run src/index.ts component status package.<name> --json
```

## Implementation Workflow

Parent starts with failing tests and interface skeletons, then dispatches independent work. Use up to six workers only when ownership is disjoint.

### Wave A - lock requirements and tests

- [x] Task A1: Add `src/cli/package-surfaces.test.ts`.
  - Owns package fixture/source discovery tests.
  - Assertions:
    - Repomix manifest includes `S/M/C/A/R/P`.
    - Caveman manifest includes every upstream package surface present in source, including commands/hooks/rules/package metadata when present.
    - Cloudflare manifest includes skills, commands, MCP metadata, plugin metadata, and assets from official source.
    - Superpowers manifest includes skills, commands, agents, hooks, package metadata, and assets.
    - Source backup files are not mirrorable surfaces.
  - Verify:
    ```bash
    bun test src/cli/package-surfaces.test.ts
    ```

- [x] Task A2: Add parity expectations to existing package tests.
  - Owns:
    ```text
    src/cli/repomix-package.test.ts
    src/cli/vendor-packages.test.ts
    src/cli/install.test.ts
    src/cli/uninstall.test.ts
    src/cli/mirror-policy.test.ts
    ```
  - New expectations:
    - OpenCode Repomix mirror includes skills, MCP config, explorer agent, commands, rules/context, package metadata where supported.
    - Pi Repomix mirror includes skills, MCP config, commands, explorer agent or unsupported reason, rules/context, package metadata where supported.
    - Codex Superpowers mirror includes skills, commands, agents, hooks, package metadata/assets, not skills-only.
    - Pi Superpowers fallback includes skills, commands, agents, hooks, package metadata/assets, not skills-only.
    - Cloudflare non-Claude mirrors include all supported official package surfaces, not skills-only.
    - Caveman non-native mirrors include all supported official package surfaces, not skills-only.
  - Verify:
    ```bash
    bun test src/cli/repomix-package.test.ts src/cli/vendor-packages.test.ts src/cli/install.test.ts src/cli/uninstall.test.ts src/cli/mirror-policy.test.ts
    ```

- [x] Task A3: Add disabled MCP semantic tests.
  - Owns:
    ```text
    src/cli/mcp-registry.test.ts
    src/cli/mcp-cmd.test.ts
    src/components/adapters/mcp.test.ts
    ```
  - Assertions:
    - `fulcrum install --no-default-mcps` still writes disabled config on Codex/Gemini/OpenCode.
    - `fulcrum mcp disable <name>` preserves disabled native config on Codex/Gemini/OpenCode.
    - `fulcrum component disable mcp.<name>` preserves disabled native config on Codex/Gemini/OpenCode.
    - Claude/Pi return `disabledConfigUnsupported` unless a native disabled state is implemented.
  - Verify:
    ```bash
    bun test src/cli/mcp-registry.test.ts src/cli/mcp-cmd.test.ts src/components/adapters/mcp.test.ts
    ```

### Wave B - shared package manifest and mirror core

Dispatch after A1 test skeleton lands.

- [x] Worker B1: Implement package surface discovery.
  - Worktree: `~/.config/superpowers/worktrees/fulcrum/package-surfaces`
  - Owns:
    ```text
    src/cli/package-surfaces.ts
    src/cli/package-surfaces.test.ts
    ```
  - Must implement deterministic discovery, SHA-256 hashing, mirror filtering, and package source descriptors for Caveman, Repomix, Cloudflare, and Superpowers.
  - Verify:
    ```bash
    bun test src/cli/package-surfaces.test.ts
    ```

- [x] Worker B2: Implement per-agent package mirror planner.
  - Worktree: `~/.config/superpowers/worktrees/fulcrum/package-mirror`
  - Owns:
    ```text
    src/cli/package-mirror.ts
    src/cli/package-mirror.test.ts
    ```
  - Must map manifest surfaces to Claude/Codex/Gemini/OpenCode/Pi targets and unsupported reasons.
  - Verify:
    ```bash
    bun test src/cli/package-mirror.test.ts
    ```

- [x] Worker B3: Implement package parity audit.
  - Worktree: `~/.config/superpowers/worktrees/fulcrum/package-parity`
  - Owns:
    ```text
    src/cli/package-parity.ts
    src/cli/package-parity.test.ts
    ```
  - Must count source vs installed surfaces, detect missing targets, unsupported targets, and `.original.md` leaks.
  - Verify:
    ```bash
    bun test src/cli/package-parity.test.ts
    ```

Parent integration after B1/B2/B3:

```bash
bun test src/cli/package-surfaces.test.ts src/cli/package-mirror.test.ts src/cli/package-parity.test.ts
```

### Wave C - package refactors

Dispatch only after shared interfaces compile. Keep write sets separate.

- [x] Worker C1: Refactor Repomix package onto manifest/mirror/parity.
  - Worktree: `~/.config/superpowers/worktrees/fulcrum/package-repomix`
  - Owns:
    ```text
    src/cli/repomix-package.ts
    src/cli/repomix-package.test.ts
    src/cli/mirror-policy.test.ts
    ```
  - Must repair OpenCode/Pi missing surfaces and keep Codex/Gemini full mirrors.
  - Verify:
    ```bash
    bun test src/cli/repomix-package.test.ts src/cli/mirror-policy.test.ts
    ```

- [x] Worker C2: Refactor Cloudflare package.
  - Worktree: `~/.config/superpowers/worktrees/fulcrum/package-cloudflare`
  - Owns:
    ```text
    src/cli/vendor-packages.ts
    src/cli/vendor-packages.test.ts
    ```
  - Must preserve native Claude plugin and mirror supported package surfaces to Codex/Gemini/OpenCode/Pi.
  - If Cloudflare official package ships a surface no target agent can load, record unsupported reason in parity, not silent omission.
  - Verify:
    ```bash
    bun test src/cli/vendor-packages.test.ts
    ```

- [x] Worker C3: Refactor Superpowers package.
  - Worktree: `~/.config/superpowers/worktrees/fulcrum/package-superpowers`
  - Owns:
    ```text
    src/cli/vendor-packages.ts
    src/cli/vendor-packages.test.ts
    src/cli/upstream-skills.ts
    src/cli/upstream-skills.test.ts
    ```
  - Must preserve native Claude/Gemini/OpenCode/Pi installs and make Codex plus Pi fallback full package mirrors, not skill-only.
  - Must keep `vendor_canonical_agents` skip behavior for skill-only upstream sync.
  - Verify:
    ```bash
    bun test src/cli/vendor-packages.test.ts src/cli/upstream-skills.test.ts
    ```

- [x] Worker C4: Refactor Caveman package.
  - Worktree: `~/.config/superpowers/worktrees/fulcrum/package-caveman`
  - Owns:
    ```text
    src/cli/install.ts
    src/cli/install.test.ts
    src/cli/uninstall.ts
    src/cli/uninstall.test.ts
    ```
  - Must preserve native Claude/Gemini install and make Codex/OpenCode/Pi mirrors manifest-driven. Codex must keep plugin metadata/assets/hooks/config mirror. OpenCode/Pi must receive supported non-skill surfaces.
  - Verify:
    ```bash
    bun test src/cli/install.test.ts src/cli/uninstall.test.ts
    ```

Parent resolves conflicts between C2/C3 because both touch `src/cli/vendor-packages.ts`. If conflict risk is high, serialize C2 then C3.

### Wave D - MCP disabled setup and component semantics

- [x] Worker D1: Fix MCP install/setup/enable/disable semantics.
  - Worktree: `~/.config/superpowers/worktrees/fulcrum/mcp-disabled-setup`
  - Owns:
    ```text
    src/cli/mcp-registry.ts
    src/cli/mcp-registry.test.ts
    src/cli/mcp-cmd.ts
    src/cli/mcp-cmd.test.ts
    src/components/adapters/mcp.ts
    src/components/adapters/mcp.test.ts
    ```
  - Must preserve disabled native config on Codex/Gemini/OpenCode and report unsupported disabled config for Claude/Pi.
  - Must keep package-owned MCPs out of generic remove/disable unless package component owns the operation.
  - Verify:
    ```bash
    bun test src/cli/mcp-registry.test.ts src/cli/mcp-cmd.test.ts src/components/adapters/mcp.test.ts
    ```

- [x] Worker D2: Add package parity to component status and doctor.
  - Worktree: `~/.config/superpowers/worktrees/fulcrum/package-status-doctor`
  - Owns:
    ```text
    src/cli/component.ts
    src/cli/component.test.ts
    src/cli/doctor.ts
    src/cli/doctor.test.ts
    ```
  - Must expose parity reports, unsupported reasons, package-owned MCPs, and source-only leak checks in JSON.
  - Verify:
    ```bash
    bun test src/cli/component.test.ts src/cli/doctor.test.ts
    ```

### Wave E - graphify, ast-grep, tavily lifecycle audit

- [x] Worker E1: Add component/audit coverage for vendor project integrations.
  - Worktree: `~/.config/superpowers/worktrees/fulcrum/project-integrations`
  - Owns:
    ```text
    src/cli/vendor-installs.ts
    src/cli/init.test.ts
    src/components/catalog.ts
    src/components/catalog.test.ts
    src/components/adapters/vendor.ts
    src/components/adapters/vendor.test.ts
    ```
  - Must make graphify, ast-grep, and tavily visible to component status/doctor as managed vendor integrations, even if install remains vendor-command-first.
  - Must add remove/status behavior or explicit non-removable/manual reason for vendor commands that do not publish uninstall.
  - Verify:
    ```bash
    bun test src/cli/init.test.ts src/components/catalog.test.ts src/components/adapters/vendor.test.ts
    ```

### Wave F - docs only after code is true

- [x] Worker F1: Correct docs after green focused tests.
  - Worktree: `~/.config/superpowers/worktrees/fulcrum/package-docs`
  - Owns:
    ```text
    HANDOVER.md
    docs/mcp.md
    docs/skills.md
    docs/agents.md
    docs/capabilities.md
    README.md
    ```
  - Must remove contradictions:
    - Repomix not skill-only.
    - Superpowers not skill-only on Codex/Pi fallback.
    - Cloudflare non-Claude package surface behavior exact.
    - Disabled MCP setup mode exact.
  - Must cite official docs listed in this plan where package model is described.
  - Verify:
    ```bash
    rg -n "Repomix|Superpowers|Cloudflare|disabled" HANDOVER.md docs README.md
    bun run src/index.ts component list --json
    bun run src/index.ts doctor --json
    ```

## One-Go Execution Order

Parent must keep parallelism high but not merge unreviewed conflicts.

```text
1. Parent: add failing tests A1/A2/A3 and interface skeletons.
2. Dispatch B1/B2/B3 in parallel.
3. Parent: integrate B results, run shared package tests.
4. Dispatch C1/C4 and D1 in parallel. Dispatch C2/C3 serialized or as separate workers with parent conflict owner because both touch vendor-packages.ts.
5. Dispatch D2 after package parity interfaces settle.
6. Dispatch E1 after catalog/package IDs settle.
7. Dispatch F1 only after code-focused tests pass.
8. Parent: run live cleanup/reinstall verification using Fulcrum commands only for remove/install, then final CI.
```

Worker prompt template:

```text
You are working in <worktree> for a parallel lane. Parent integration workspace is /Users/mkh/workspace/fulcrum on main; do not edit it directly.
Use AGENTS.md, HANDOVER.md, and docs/superpowers/plans/2026-04-30-plugin-extension-surface-parity.md as steering.
Use subagent-driven-development and test-driven-development.
Ownership: <exact files>.
Do not edit outside ownership without reporting first.
Start with failing tests or the stated verification criteria.
Do not claim package parity unless tests count every S/R/M/C/A/H/T/P surface or record unsupported reason.
Run: <focused command>.
Final report: changed files, commands run, pass/fail output, unresolved risks, and exact patch paths.
```

## Verification Gates

Focused test gates:

```bash
bun test src/cli/package-surfaces.test.ts src/cli/package-mirror.test.ts src/cli/package-parity.test.ts
bun test src/cli/repomix-package.test.ts src/cli/vendor-packages.test.ts
bun test src/cli/install.test.ts src/cli/uninstall.test.ts src/cli/mirror-policy.test.ts
bun test src/cli/mcp-registry.test.ts src/cli/mcp-cmd.test.ts src/components/adapters/mcp.test.ts
bun test src/cli/component.test.ts src/cli/doctor.test.ts src/components/adapters/vendor.test.ts src/components/catalog.test.ts
bun test src/cli/init.test.ts src/cli/upstream-skills.test.ts
```

Live cleanup/reinstall verification must use Fulcrum project commands for remove/install operations. Direct shell is allowed only for inspection and targeted cleanup of stale files before the reinstall test.

Inspection commands:

```bash
git status --short
git diff --stat
find ~/.codex ~/.gemini ~/.config/opencode ~/.pi/agent ~/.claude -name '*.original.md' -o -name '*.backup.md'
bun run src/index.ts component list --json
bun run src/index.ts component status package.repomix --json
bun run src/index.ts component status package.cloudflare --json
bun run src/index.ts component status package.superpowers --json
bun run src/index.ts component status package.caveman --json
bun run src/index.ts doctor --json
```

Remove/install smoke commands:

```bash
bun run src/index.ts component remove package.repomix --all-agents
bun run src/index.ts component install package.repomix --all-agents
bun run src/index.ts component remove package.cloudflare --all-agents
bun run src/index.ts component install package.cloudflare --all-agents
bun run src/index.ts component remove package.superpowers --all-agents
bun run src/index.ts component install package.superpowers --all-agents
bun run src/index.ts component remove package.caveman --all-agents
bun run src/index.ts component install package.caveman --all-agents
```

Disabled MCP smoke commands:

```bash
bun run src/index.ts install --profile minimal --no-default-mcps
bun run src/index.ts mcp disable context7 --all-agents
bun run src/index.ts mcp disable github --all-agents
bun run src/index.ts component disable mcp.context7 --all-agents
bun run src/index.ts doctor --json
```

Final gate:

```bash
bun run ci
```

## Acceptance Criteria

- [x] Every managed package has a `PackageSurfaceManifest` with source hashes and surface counts.
- [x] Every package/agent pair has a parity report in `component status --json`.
- [x] No package is represented as "done" by skill count alone.
- [x] Repomix OpenCode/Pi mirrors include supported commands, rules/context, agents, MCP, metadata, and skills, or unsupported reasons.
- [x] Cloudflare non-Claude mirrors include all supported official package surfaces, or unsupported reasons.
- [x] Superpowers Codex and Pi fallback mirrors include commands, agents, hooks, metadata/assets, and skills.
- [x] Caveman OpenCode/Pi mirrors include supported non-skill surfaces.
- [x] Required registry-owned MCPs are configured disabled on Codex/Gemini/OpenCode when not enabled.
- [x] Claude/Pi disabled-config limitations are explicit in doctor/component JSON.
- [x] Component disable preserves setup for agents with disabled-state support.
- [x] Package-owned MCPs are not removed or disabled by generic MCP operations.
- [x] Generated agent mirrors contain no `.original.md` or `.backup.md`.
- [x] Docs match verified code and no longer contradict package behavior.
- [x] Final `bun run ci` passes.

## Non-goals

- Do not build a public arbitrary plugin marketplace command in this repair.
- Do not translate unsupported runtime plugin code by guessing behavior.
- Do not activate every MCP by default.
- Do not remove user-owned config outside Fulcrum-managed keys/markers.
- Do not delete project source `.original.md` files.
