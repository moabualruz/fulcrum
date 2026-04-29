# Component Lifecycle Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILLS: Use `subagent-orchestration` plus superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Fulcrum component lifecycle management so Fulcrum can install, remove, enable, disable, inspect, and dry-run every managed agent OS part from one extensible engine while preserving current `fulcrum install` / `fulcrum uninstall` behavior.

**Architecture:** Introduce a component catalog, action planner, execution ledger, and per-surface adapters. Existing procedural flows become wrappers around component profiles, starting with `profile.default`; current subcommands remain public and stable. Package/skill adapters must preserve the current vendor-first install policy: use official plugin/extension/package installers where they exist, and mirror every managed vendor surface into each supported CLI that lacks a native first-party installer.

**Tech Stack:** Bun TypeScript, `bun:test`, `bun:sqlite`, existing `AGENTS` registry, existing JSON/TOML/sentinel helpers, existing MCP/hook/skill/vendor modules.

**Branch Policy:** Stay on `main` as the integration branch. User explicitly directed using `subagent-orchestration` and git worktrees for implementation lanes. Parent owns the dirty `main` integration workspace. Parallel write workers must use external worktrees under `~/.config/superpowers/worktrees/fulcrum/<lane>/`; seed any required uncommitted integration state into those worktrees before dispatch, then apply owned-path patches back to `main`. Read-only research/review lanes may inspect the integration workspace when they will not write.

**Current Progress (2026-04-30):**

- Done: Tasks 1-7 implementation through reviewed integration.
- Shipped in main worktree: component type model, catalog, planner, SQLite ledger, `fulcrum component list/info/plan`, `fulcrum component install/remove/enable/disable`, executor, hook adapter, MCP adapter, rules adapter, policy adapter.
- Verified so far: focused integrated suite `188 pass, 0 fail`; focused apply/adapter retest `41 pass, 0 fail`; `bun run --bun tsc --noEmit` passes; `bun run ci` passes. Subagent orchestration guidance was hardened after this foundation work to require max-useful parallelism, external worktrees for parallel write lanes, runtime dependency reassessment, and lane-specific model/effort selection.
- Remaining: Task 8 vendor/skills adapter, Task 9 status + doctor integration, Task 10 compatibility wrappers, Task 12 docs, Task 13 full verification.

---

## Scope

This is a Fulcrum feature. Do not rename Fulcrum, do not add a `pkg` command, and do not introduce a separate package-manager brand. The internal model may borrow package-manager ideas such as manifests, plans, ownership ledgers, dry-runs, exact state, and remove-vs-purge behavior.

The public command is:

```bash
fulcrum component ...
```

The compatibility commands stay:

```bash
fulcrum install
fulcrum uninstall
fulcrum hooks ...
fulcrum skills ...
fulcrum mcp ...
```

`fulcrum install` eventually becomes a wrapper around:

```bash
fulcrum component install profile.default
```

`fulcrum uninstall` eventually becomes a wrapper around:

```bash
fulcrum component remove profile.default
```

The feature is complete when `fulcrum component install/remove/status --json` can describe and operate on these managed parts:

```text
rules.global
policy.tool-output
hooks.format
hooks.lint-gate
hooks.pm-policy
hooks.test-on-edit
hooks.audit-log
hooks.index-check
hooks.index-rebuild
hooks.tool-output-router
skills.authored
skills.upstream
package.caveman
package.repomix
package.cloudflare
package.superpowers
mcp.deepwiki
mcp.registry
mcp.github
mcp.repomix
mcp.semgrep
mcp.context7
mcp.tavily
mcp.playwright
mcp.dart
mcp.cloudflare-docs
mcp.cloudflare-workers-bindings
mcp.cloudflare-workers-builds
mcp.cloudflare-observability
mcp.cloudflare-radar
mcp.cloudflare-logpush
mcp.cloudflare-browser
mcp.cloudflare-containers
mcp.cloudflare-ai-gateway
profile.default
profile.minimal
profile.verify-all
```

## Managed Package Mirroring Contract

This is a hard compatibility requirement, not an optional enhancement. The component manager must maintain the behavior where Fulcrum distributes vendor plugin/extension/package parts to every supported CLI, while avoiding duplicate writes for agents that already have a vendor-native installer.

Rules:

```text
1. Prefer the vendor's native installer for an agent when one exists.
2. Mirror vendor-authored files verbatim into equivalent native locations for agents without that installer.
3. Never mirror into `~/.agents/` or any shared global skill root.
4. Never rename vendor-authored skill frontmatter. Use install-path namespacing only.
5. Preserve `vendor_canonical_agents` from `skills/upstream.lock`; those agents are skipped by file-copy mirrors.
6. A `package.*` component install owns the full package surface for that vendor, not just one CLI.
7. `--dry-run` must show vendor commands and mirror paths, but must not run CLIs, clone repos, write files, or remove files.
8. Remove must undo only Fulcrum-managed mirrors/registrations and preserve user-owned config outside known managed surfaces.
```

Current package matrix to preserve:

| Component | Native installer surfaces | Mirror surfaces Fulcrum owns |
|---|---|---|
| `skills.authored` | Claude Code plugin `fulcrum@fulcrum`; Gemini extension `fulcrum-skills` | Codex/OpenCode/Pi under `<agent>/skills/fulcrum/<name>/`; refresh Claude plugin cache/marketplace package after install |
| `skills.upstream` | Per-entry `claude_plugin`; per-entry `vendor_canonical_agents` skip list | Vendor-placement skill copies into Codex/OpenCode/Pi and Gemini `~/.gemini/skills`; Pi may use frontmatter name when it differs from lock entry |
| `package.caveman` | Claude Code plugin `caveman@caveman`; Gemini extension from `JuliusBrussee/caveman` | Codex direct official repo mirror including skills, Codex plugin cache, hooks, and config enablement; OpenCode/Pi skill mirrors; shared caveman config `defaultMode: "ultra"` |
| `package.repomix` | Claude Code plugins `repomix-mcp`, `repomix-commands`, `repomix-explorer` | Codex/Pi skills; Gemini extension with commands, skills, agent, MCP server; OpenCode skills plus `repomix-explorer` agent |
| `package.cloudflare` | Claude Code plugin `cloudflare@cloudflare` | Cloudflare pinned skills from `skills/upstream.lock` mirrored to non-Claude agents; Claude is skipped by `vendor_canonical_agents = ["claude-code"]` |
| `package.superpowers` | Claude Code plugin, Gemini extension, OpenCode plugin, Pi `pi install` packages when `pi` exists | Codex full skill mirror; Pi full skill mirror only when `pi` is not available |

Technical implication: Task 8 cannot be a thin `vendor-command` dispatcher only. It must expose package-specific helpers so component install can operate one package at a time without accidentally installing every upstream skill or every vendor package.

## Subagent Orchestration Model

Parent orchestrator owns the critical path:

1. Keep `main` as the active integration branch.
2. Read `AGENTS.md`, `HANDOVER.md`, this plan, and relevant project config before dispatch.
3. Maintain the checklist in this plan as work completes.
4. Define failing tests or exact verification criteria before dispatching implementation workers.
5. Build and revise a runtime dependency graph: immediate blockers, dependency chains, parallel-safe units, shared-file risks, and review gates.
6. Maximize useful parallelism for independent units, but serialize work that shares files or needs prior output.
7. Use external git worktrees for every parallel write lane; parent integrates owned-path patches into the current `main` worktree.
8. Keep parent on critical-path work while agents run. Do not wait when non-overlapping tests, docs, reviews, or integration work can proceed.
9. Assign model/effort per lane based on assigned work, not feature size:
   - Low effort/smaller model: mechanical edits, narrow tests, fixture/log/docs-only checks.
   - Medium/default: normal implementation slices, adapter work, focused debugging.
   - High/xhigh/stronger: architecture, ambiguous requirements, security/auth/shell/network review, final integration review.
10. Reassess after every agent result, test failure, reviewer finding, or user instruction. If new independent work appears, parallelize it; if hidden dependencies appear, serialize or split ownership.
11. Verify each worker claim against files and command output.
12. Run `git status --short`, `git diff --stat`, focused tests, and final `bun run ci`.

Dispatch only when units are independent. Do not spawn a worker for one obvious edit or a task the parent can finish faster than briefing an agent.

Suggested worker waves:

```text
Completed in main:
  Tasks 1-7: catalog, planner, ledger, component apply CLI, executor, hooks/MCP/rules/policy adapters.

Next runtime wave — maximize parallelism:
  Worker F1: skills/authored + upstream filtering helpers
    Worktree: ~/.config/superpowers/worktrees/fulcrum/component-skills-vendor
    Owns: src/cli/skills.ts, src/cli/upstream-skills.ts, related tests
    Verifies: bun test src/cli/skills.test.ts src/cli/upstream-skills.test.ts

  Worker F2: vendor package helpers + Repomix package relocation
    Worktree: ~/.config/superpowers/worktrees/fulcrum/component-package-vendors
    Owns: src/cli/vendor-packages.ts, src/cli/repomix-package.ts, src/cli/install.ts, src/cli/uninstall.ts, related tests
    Verifies: bun test src/cli/vendor-packages.test.ts src/cli/repomix-package.test.ts src/cli/install.test.ts src/cli/uninstall.test.ts

  Worker F3: component vendor adapter + executor dispatch
    Worktree: ~/.config/superpowers/worktrees/fulcrum/component-vendor-adapter
    Depends on: F1/F2 helper signatures, but can start with failing tests and type-only imports while helpers are in flight.
    Owns: src/components/adapters/vendor.ts, src/components/adapters/vendor.test.ts, src/components/executor.ts
    Verifies: bun test src/components/adapters/vendor.test.ts src/cli/skills.test.ts src/cli/upstream-skills.test.ts src/cli/vendor-packages.test.ts src/cli/repomix-package.test.ts src/cli/install.test.ts src/cli/uninstall.test.ts

  Parent in main while F workers run:
    Keep plan/checklist current, resolve helper-interface conflicts, review worker diffs, run focused integration tests after merge-back.

After Task 8 merge-back — reassess dependency graph:
  Parallel if independent:
    Worker S: component status + doctor read paths
      Worktree: ~/.config/superpowers/worktrees/fulcrum/component-status-doctor
      Owns: src/cli/component.ts, src/cli/component.test.ts, src/cli/doctor.ts, src/cli/doctor.test.ts
      Verifies: bun test src/cli/component.test.ts src/cli/doctor.test.ts

    Worker D: docs alignment for component lifecycle
      Worktree: ~/.config/superpowers/worktrees/fulcrum/component-docs
      Owns: docs/user-guide.md, docs/developer-guide.md, HANDOVER.md
      Verifies: docs grep checks plus bun run src/index.ts --help

  Sequential after Task 8 and status interfaces settle:
    Worker W: install/uninstall compatibility wrappers
      Worktree: ~/.config/superpowers/worktrees/fulcrum/component-wrappers
      Owns: src/cli/install.ts, src/cli/uninstall.ts, wrapper tests
      Verifies: wrapper tests, dry-run smoke, existing install/uninstall tests

Final parent gate:
  Integrate owned-path patches, run dry-run smoke for package components, run focused suites, then bun run ci.
```

Worker assignment template:

```text
You are working in <external-worktree-path> for a parallel lane. The parent integration workspace is /Users/mkh/workspace/fulcrum on main; do not edit it directly.
Use AGENTS.md, HANDOVER.md, and docs/superpowers/plans/2026-04-29-component-lifecycle-management.md as steering.
Runtime scheduling: if you discover hidden dependencies, shared write-set conflict, or a smaller independent split, report it before broadening scope.
Ownership: <exact files/modules>.
Do not edit outside ownership without reporting first.
Start with failing tests or stated verification criteria.
Keep code, tests, docs, examples, and generated artifacts aligned inside your scope.
Run: <focused command>.
Model/effort guidance for this lane: <mechanical low | integration medium | review/design high>, because <reason>.
Final report: changed files, commands run, pass/fail output, unresolved risks, dependency assumptions, and exact patch paths to integrate.
```

## User Experience Contract

### Discovery

```bash
fulcrum component list
fulcrum component list --json
fulcrum component info package.repomix
fulcrum component info package.repomix --json
```

Human list output:

```text
Fulcrum components:
  profile.default        default setup profile
  rules.global           cross-agent rules sentinel block
  hooks.format           format hook registration
  skills.authored        Fulcrum-authored skills
  skills.upstream        pinned vendor skills
  package.caveman        caveman cross-agent output compression
  package.repomix        Repomix plugin/package surfaces
  mcp.context7           Context7 MCP registry entry

Use: fulcrum component info <id>
```

JSON list output:

```json
[
  {
    "id": "package.repomix",
    "kind": "package",
    "description": "Repomix managed plugin, skill, agent, and MCP surfaces",
    "defaultProfile": true
  }
]
```

### Planning

```bash
fulcrum component plan install package.repomix --agent codex --json
fulcrum component plan remove package.repomix --agent codex --json
```

Plan JSON shape:

```json
{
  "operation": "install",
  "target": "package.repomix",
  "profile": null,
  "agents": ["codex"],
  "actions": [
    {
      "id": "package.repomix:codex:skill-mirror",
      "componentId": "package.repomix",
      "agentId": "codex",
      "kind": "directory-copy",
      "phase": "apply",
      "target": "~/.codex/skills/repomix",
      "change": "create-or-update",
      "risk": "managed",
      "reason": "Repomix vendor-derived skills are mirrored to Codex because Codex has no Repomix plugin primitive."
    }
  ],
  "warnings": []
}
```

### Applying

```bash
fulcrum component install package.repomix --agent codex
fulcrum component remove package.repomix --agent codex
fulcrum component install profile.default
fulcrum component install profile.verify-all
```

`--dry-run` must call the same planner as real execution and must never write files or call vendor CLIs.

### Status

```bash
fulcrum component status
fulcrum component status package.repomix
fulcrum component status package.repomix --agent codex --json
```

Status JSON shape:

```json
{
  "componentId": "package.repomix",
  "status": "installed",
  "surfaces": [
    {
      "agentId": "codex",
      "kind": "directory-copy",
      "target": "~/.codex/skills/repomix",
      "state": "present",
      "managed": true,
      "modified": false
    }
  ]
}
```

### Enable / Disable

`enable` and `disable` affect active state without removing installed artifacts when the surface supports disabled state. MCPs map to existing registry enablement. Hooks map to native registration + marker presence. Rules, policy, skills, and vendor package installs that lack native disabled state should report an explicit non-supporting message.

```bash
fulcrum component disable mcp.github --agent codex
fulcrum component enable hooks.format --agent gemini
```

Unsupported example:

```text
package.caveman does not support disable; use remove to uninstall managed copies or set CAVEMAN_DEFAULT_MODE for behavior.
```

### Remove vs Purge

Default `remove` deletes managed files only when they are unmodified or sentinel-owned. It preserves modified user config and reports that preservation.

`--purge` removes Fulcrum state and known managed artifacts more aggressively, matching current `fulcrum uninstall --purge` semantics. Destructive files outside known managed paths are never removed.

## File Structure

Create:

```text
src/components/types.ts
src/components/catalog.ts
src/components/planner.ts
src/components/ledger.ts
src/components/executor.ts
src/components/adapters/files.ts
src/components/adapters/json.ts
src/components/adapters/toml.ts
src/components/adapters/sentinel.ts
src/components/adapters/hooks.ts
src/components/adapters/mcp.ts
src/components/adapters/vendor.ts
src/components/catalog.test.ts
src/components/planner.test.ts
src/components/ledger.test.ts
src/components/executor.test.ts
src/components/adapters/hooks.test.ts
src/components/adapters/mcp.test.ts
src/cli/component.ts
src/cli/component.test.ts
```

Modify:

```text
src/index.ts
src/cli/install.ts
src/cli/uninstall.ts
src/cli/hooks.ts
src/cli/mcp-cmd.ts
src/cli/mcp-registry.ts
src/cli/skills.ts
src/cli/upstream-skills.ts
src/cli/vendor-packages.ts
src/cli/repomix-package.ts
src/cli/doctor.ts
src/cli/doctor.test.ts
docs/user-guide.md
docs/developer-guide.md
HANDOVER.md
```

Responsibility boundaries:

```text
catalog.ts       Declarative component specs and profiles. No filesystem writes.
planner.ts       Converts specs + desired operation + agents into ordered actions.
ledger.ts        SQLite state for component ownership, artifacts, operation history.
executor.ts      Executes plan actions through adapters and records ledger rows.
adapters/*       Small surface-specific operations. No CLI parsing.
component.ts     CLI parser and output rendering only.
install.ts       Compatibility wrapper after migration.
uninstall.ts     Compatibility wrapper after migration.
doctor.ts        Reads ledger + existing probes to report component state.
```

## Data Model

Use `bun:sqlite` at:

```text
~/.fulcrum/state/global/components.db
```

Schema version via `PRAGMA user_version`.

Initial migration:

```sql
CREATE TABLE IF NOT EXISTS components (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  version TEXT,
  installed_at TEXT,
  updated_at TEXT,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS surfaces (
  id TEXT PRIMARY KEY,
  component_id TEXT NOT NULL,
  agent_id TEXT,
  kind TEXT NOT NULL,
  target TEXT NOT NULL,
  owner_key TEXT NOT NULL,
  desired_enabled INTEGER,
  remove_policy TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(component_id) REFERENCES components(id)
);

CREATE TABLE IF NOT EXISTS artifacts (
  surface_id TEXT NOT NULL,
  path TEXT NOT NULL,
  sha256 TEXT,
  size INTEGER,
  modified INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY(surface_id, path),
  FOREIGN KEY(surface_id) REFERENCES surfaces(id)
);

CREATE TABLE IF NOT EXISTS operations (
  id TEXT PRIMARY KEY,
  command TEXT NOT NULL,
  target TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS operation_steps (
  operation_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  component_id TEXT NOT NULL,
  agent_id TEXT,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  PRIMARY KEY(operation_id, action_id),
  FOREIGN KEY(operation_id) REFERENCES operations(id)
);

PRAGMA user_version = 1;
```

## Type Sketch

```typescript
// src/components/types.ts
import type { AgentId } from "../cli/mcp-registry.ts";

export type ComponentKind =
  | "profile"
  | "rules"
  | "policy"
  | "hook"
  | "skill"
  | "package"
  | "mcp";

export type SurfaceKind =
  | "sentinel-block"
  | "policy-seed"
  | "hook-registration"
  | "skill-sync"
  | "upstream-skill-sync"
  | "mcp-registry-entry"
  | "mcp-agent-config"
  | "vendor-command"
  | "directory-copy"
  | "file-copy"
  | "json-patch"
  | "toml-block";

export type Operation = "install" | "remove" | "enable" | "disable" | "status";
export type RemovePolicy = "managed-only" | "sentinel-only" | "keep-modified" | "purgeable";

export interface ComponentSpec {
  id: string;
  kind: ComponentKind;
  description: string;
  defaultProfile?: boolean;
  verifyAllProfile?: boolean;
  dependsOn?: string[];
  conflictsWith?: string[];
  surfaces: SurfaceSpec[];
  profileMembers?: string[];
}

export interface SurfaceSpec {
  id: string;
  kind: SurfaceKind;
  componentId: string;
  agents?: readonly AgentId[];
  target: string;
  ownerKey: string;
  removePolicy: RemovePolicy;
  supportsDisable?: boolean;
  payload?: Record<string, unknown>;
}

export interface ComponentAction {
  id: string;
  componentId: string;
  surfaceId: string;
  agentId?: AgentId;
  operation: Exclude<Operation, "status">;
  kind: SurfaceKind;
  target: string;
  change: "create-or-update" | "remove" | "enable" | "disable" | "noop" | "preserve";
  risk: "managed" | "external-command" | "modified-user-file";
  reason: string;
  payload?: Record<string, unknown>;
}

export interface ComponentPlan {
  operation: Exclude<Operation, "status">;
  target: string;
  profile: string | null;
  agents: AgentId[];
  actions: ComponentAction[];
  warnings: string[];
}
```

## Implementation Tasks

### Task 1: Component Type Model And Catalog Skeleton

**Files:**
- Create: `src/components/types.ts`
- Create: `src/components/catalog.ts`
- Create: `src/components/catalog.test.ts`

- [ ] **Step 1: Write failing catalog tests**

```typescript
// src/components/catalog.test.ts
import { describe, expect, test } from "bun:test";
import { ALL_COMPONENTS, getComponent, expandProfile } from "./catalog.ts";

describe("component catalog", () => {
  test("contains stable component ids for current Fulcrum managed surfaces", () => {
    const ids = ALL_COMPONENTS.map((c) => c.id).sort();
    expect(ids).toContain("profile.default");
    expect(ids).toContain("rules.global");
    expect(ids).toContain("policy.tool-output");
    expect(ids).toContain("hooks.format");
    expect(ids).toContain("skills.authored");
    expect(ids).toContain("skills.upstream");
    expect(ids).toContain("package.caveman");
    expect(ids).toContain("package.repomix");
    expect(ids).toContain("package.cloudflare");
    expect(ids).toContain("package.superpowers");
    expect(ids).toContain("mcp.deepwiki");
    expect(ids).toContain("mcp.registry");
    expect(ids).toContain("mcp.context7");
  });

  test("component ids are unique", () => {
    const ids = ALL_COMPONENTS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("profile.default expands in install order", () => {
    expect(expandProfile("profile.default").map((c) => c.id)).toEqual([
      "policy.tool-output",
      "rules.global",
      "package.caveman",
      "skills.authored",
      "skills.upstream",
      "package.cloudflare",
      "package.superpowers",
      "mcp.deepwiki",
      "mcp.registry",
      "mcp.context7",
    ]);
  });

  test("unknown component returns null", () => {
    expect(getComponent("missing.component")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test src/components/catalog.test.ts
```

Expected: FAIL because `src/components/catalog.ts` does not exist.

- [ ] **Step 3: Implement minimal types and catalog**

Use the type sketch above for `src/components/types.ts`.

Add this initial catalog:

```typescript
// src/components/catalog.ts
import { BUILTIN_MCPS, MINIMAL_DEFAULT_MCPS } from "../cli/mcp-builtins.ts";
import type { ComponentSpec } from "./types.ts";

const HOOKS = [
  "format",
  "lint-gate",
  "pm-policy",
  "test-on-edit",
  "audit-log",
  "index-check",
  "index-rebuild",
  "tool-output-router",
] as const;

function hookComponent(name: typeof HOOKS[number]): ComponentSpec {
  return {
    id: `hooks.${name}`,
    kind: "hook",
    description: `Fulcrum ${name} hook registration`,
    surfaces: [{
      id: `hooks.${name}:registration`,
      componentId: `hooks.${name}`,
      kind: "hook-registration",
      target: `hook:${name}`,
      ownerKey: `fulcrum:hook:${name}`,
      removePolicy: "managed-only",
      supportsDisable: true,
      payload: { recipe: name },
    }],
  };
}

function mcpComponent(name: string): ComponentSpec {
  const defaultProfile = (MINIMAL_DEFAULT_MCPS as readonly string[]).includes(name);
  return {
    id: `mcp.${name}`,
    kind: "mcp",
    description: `Fulcrum managed MCP ${name}`,
    defaultProfile,
    surfaces: [{
      id: `mcp.${name}:registry`,
      componentId: `mcp.${name}`,
      kind: "mcp-registry-entry",
      target: `mcp:${name}`,
      ownerKey: `fulcrum:mcp:${name}`,
      removePolicy: "managed-only",
      supportsDisable: true,
      payload: { name },
    }],
  };
}

const MCP_COMPONENTS = BUILTIN_MCPS.map(({ name }) => mcpComponent(name));

export const ALL_COMPONENTS: readonly ComponentSpec[] = [
  {
    id: "profile.default",
    kind: "profile",
    description: "Default Fulcrum setup profile",
    surfaces: [],
    profileMembers: [
      "policy.tool-output",
      "rules.global",
      "package.caveman",
      "skills.authored",
      "skills.upstream",
      "package.cloudflare",
      "package.superpowers",
      "mcp.deepwiki",
      "mcp.registry",
      "mcp.context7",
    ],
  },
  {
    id: "profile.minimal",
    kind: "profile",
    description: "Minimal Fulcrum setup profile",
    surfaces: [],
    profileMembers: ["policy.tool-output", "rules.global", "mcp.deepwiki", "mcp.context7"],
  },
  {
    id: "profile.verify-all",
    kind: "profile",
    description: "Verification profile that enables every builtin MCP",
    surfaces: [],
    profileMembers: ["profile.default", ...MCP_COMPONENTS.map((c) => c.id)],
  },
  {
    id: "policy.tool-output",
    kind: "policy",
    description: "Tool-output policy seed",
    surfaces: [{
      id: "policy.tool-output:file",
      componentId: "policy.tool-output",
      kind: "policy-seed",
      target: "~/.fulcrum/tool-output-policy.toml",
      ownerKey: "fulcrum:policy:tool-output",
      removePolicy: "keep-modified",
    }],
  },
  {
    id: "rules.global",
    kind: "rules",
    description: "Cross-agent rules sentinel block",
    surfaces: [{
      id: "rules.global:sentinel",
      componentId: "rules.global",
      kind: "sentinel-block",
      target: "agent-rules-files",
      ownerKey: "FULCRUM RULES",
      removePolicy: "sentinel-only",
    }],
  },
  ...HOOKS.map(hookComponent),
  {
    id: "skills.authored",
    kind: "skill",
    description: "Fulcrum-authored skills",
    surfaces: [{
      id: "skills.authored:sync",
      componentId: "skills.authored",
      kind: "skill-sync",
      target: "agent-skill-roots",
      ownerKey: "fulcrum:skills:authored",
      removePolicy: "managed-only",
    }],
  },
  {
    id: "skills.upstream",
    kind: "skill",
    description: "Pinned vendor skills",
    surfaces: [{
      id: "skills.upstream:sync",
      componentId: "skills.upstream",
      kind: "upstream-skill-sync",
      target: "vendor-skill-roots",
      ownerKey: "fulcrum:skills:upstream",
      removePolicy: "managed-only",
    }],
  },
  {
    id: "package.caveman",
    kind: "package",
    description: "Caveman cross-agent output compression",
    surfaces: [{
      id: "package.caveman:install",
      componentId: "package.caveman",
      kind: "vendor-command",
      target: "agent-caveman-surfaces",
      ownerKey: "fulcrum:package:caveman",
      removePolicy: "purgeable",
    }],
  },
  {
    id: "package.repomix",
    kind: "package",
    description: "Repomix plugin/package surfaces",
    surfaces: [{
      id: "package.repomix:install",
      componentId: "package.repomix",
      kind: "vendor-command",
      target: "agent-repomix-surfaces",
      ownerKey: "fulcrum:package:repomix",
      removePolicy: "managed-only",
    }],
  },
  {
    id: "package.cloudflare",
    kind: "package",
    description: "Cloudflare vendor plugin/skill surfaces",
    surfaces: [{
      id: "package.cloudflare:install",
      componentId: "package.cloudflare",
      kind: "vendor-command",
      target: "agent-cloudflare-surfaces",
      ownerKey: "fulcrum:package:cloudflare",
      removePolicy: "managed-only",
    }],
  },
  {
    id: "package.superpowers",
    kind: "package",
    description: "Superpowers vendor package/skill surfaces",
    surfaces: [{
      id: "package.superpowers:install",
      componentId: "package.superpowers",
      kind: "vendor-command",
      target: "agent-superpowers-surfaces",
      ownerKey: "fulcrum:package:superpowers",
      removePolicy: "managed-only",
    }],
  },
  {
    id: "mcp.deepwiki",
    kind: "mcp",
    description: "DeepWiki MCP registration",
    defaultProfile: true,
    surfaces: [{
      id: "mcp.deepwiki:registration",
      componentId: "mcp.deepwiki",
      kind: "mcp-agent-config",
      target: "mcp:deepwiki",
      ownerKey: "fulcrum:mcp:deepwiki",
      removePolicy: "managed-only",
      supportsDisable: true,
    }],
  },
  {
    id: "mcp.registry",
    kind: "mcp",
    description: "Builtin MCP registry scaffolding",
    defaultProfile: true,
    surfaces: [{
      id: "mcp.registry:entries",
      componentId: "mcp.registry",
      kind: "mcp-registry-entry",
      target: "~/.fulcrum/state/global/mcp-registry.toml",
      ownerKey: "fulcrum:mcp:registry",
      removePolicy: "managed-only",
    }],
  },
  ...MCP_COMPONENTS,
];

export function getComponent(id: string): ComponentSpec | null {
  return ALL_COMPONENTS.find((component) => component.id === id) ?? null;
}

export function expandProfile(id: string): ComponentSpec[] {
  const root = getComponent(id);
  if (!root || root.kind !== "profile") return [];
  const out: ComponentSpec[] = [];
  const seen = new Set<string>();

  function visit(componentId: string): void {
    if (seen.has(componentId)) return;
    const component = getComponent(componentId);
    if (!component) throw new Error(`unknown component in profile '${id}': ${componentId}`);
    seen.add(componentId);
    if (component.kind === "profile") {
      for (const member of component.profileMembers ?? []) visit(member);
      return;
    }
    out.push(component);
  }

  for (const member of root.profileMembers ?? []) visit(member);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
bun test src/components/catalog.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/types.ts src/components/catalog.ts src/components/catalog.test.ts
git commit -m "feat(component): add lifecycle catalog"
```

### Task 2: Planner For Component Operations

**Files:**
- Create: `src/components/planner.ts`
- Create: `src/components/planner.test.ts`
- Modify: `src/components/types.ts`

- [ ] **Step 1: Write failing planner tests**

```typescript
// src/components/planner.test.ts
import { describe, expect, test } from "bun:test";
import { planComponentOperation } from "./planner.ts";

describe("component planner", () => {
  test("plans default profile install in catalog order", () => {
    const plan = planComponentOperation({
      operation: "install",
      target: "profile.default",
      agents: ["codex"],
    });
    expect(plan.profile).toBe("profile.default");
    expect(plan.actions.map((a) => a.componentId)).toEqual([
      "policy.tool-output",
      "rules.global",
      "package.caveman",
      "skills.authored",
      "skills.upstream",
      "package.cloudflare",
      "package.superpowers",
      "mcp.deepwiki",
      "mcp.registry",
      "mcp.context7",
    ]);
    expect(plan.actions.every((a) => a.operation === "install")).toBe(true);
  });

  test("limits agent-specific surfaces to requested agents", () => {
    const plan = planComponentOperation({
      operation: "enable",
      target: "hooks.format",
      agents: ["gemini"],
    });
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]?.agentId).toBe("gemini");
    expect(plan.actions[0]?.change).toBe("enable");
  });

  test("disable warns for surfaces without disabled state", () => {
    const plan = planComponentOperation({
      operation: "disable",
      target: "package.caveman",
      agents: ["codex"],
    });
    expect(plan.actions[0]?.change).toBe("noop");
    expect(plan.warnings.join("\n")).toContain("package.caveman does not support disable");
  });

  test("unknown component throws clear error", () => {
    expect(() => planComponentOperation({
      operation: "install",
      target: "missing.component",
      agents: ["codex"],
    })).toThrow("unknown component: missing.component");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test src/components/planner.test.ts
```

Expected: FAIL because planner does not exist.

- [ ] **Step 3: Implement planner**

```typescript
// src/components/planner.ts
import type { AgentId } from "../cli/mcp-registry.ts";
import { ALL_AGENT_IDS } from "../cli/mcp-registry.ts";
import { expandProfile, getComponent } from "./catalog.ts";
import type { ComponentAction, ComponentPlan, ComponentSpec, Operation, SurfaceSpec } from "./types.ts";

interface PlanInput {
  operation: Exclude<Operation, "status">;
  target: string;
  agents?: readonly AgentId[];
}

function actionChange(operation: Exclude<Operation, "status">, supportsDisable?: boolean): ComponentAction["change"] {
  if (operation === "install") return "create-or-update";
  if (operation === "remove") return "remove";
  if (operation === "enable") return supportsDisable ? "enable" : "noop";
  return supportsDisable ? "disable" : "noop";
}

function surfaceAgents(surface: SurfaceSpec, requested: readonly AgentId[]): Array<AgentId | undefined> {
  if (!surface.agents || surface.agents.length === 0) {
    if (surface.kind === "sentinel-block" || surface.target.startsWith("agent-") || surface.target.startsWith("mcp:") || surface.target.startsWith("hook:")) {
      return [...requested];
    }
    return [undefined];
  }
  return surface.agents.filter((agent) => requested.includes(agent));
}

function componentsForTarget(target: string): { profile: string | null; components: ComponentSpec[] } {
  const component = getComponent(target);
  if (!component) throw new Error(`unknown component: ${target}`);
  if (component.kind === "profile") return { profile: component.id, components: expandProfile(component.id) };
  return { profile: null, components: [component] };
}

export function planComponentOperation(input: PlanInput): ComponentPlan {
  const requestedAgents = input.agents && input.agents.length > 0 ? [...input.agents] : [...ALL_AGENT_IDS];
  const { profile, components } = componentsForTarget(input.target);
  const warnings: string[] = [];
  const actions: ComponentAction[] = [];

  for (const component of components) {
    for (const surface of component.surfaces) {
      for (const agentId of surfaceAgents(surface, requestedAgents)) {
        const change = actionChange(input.operation, surface.supportsDisable);
        if ((input.operation === "enable" || input.operation === "disable") && change === "noop") {
          warnings.push(`${component.id} does not support ${input.operation}; remove/install or use component-specific configuration.`);
        }
        actions.push({
          id: `${surface.id}:${agentId ?? "global"}:${input.operation}`,
          componentId: component.id,
          surfaceId: surface.id,
          ...(agentId ? { agentId } : {}),
          operation: input.operation,
          kind: surface.kind,
          target: surface.target,
          change,
          risk: surface.kind === "vendor-command" ? "external-command" : "managed",
          reason: `${input.operation} ${component.id} via ${surface.kind}`,
          ...(surface.payload ? { payload: surface.payload } : {}),
        });
      }
    }
  }

  return {
    operation: input.operation,
    target: input.target,
    profile,
    agents: requestedAgents,
    actions,
    warnings,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
bun test src/components/planner.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/planner.ts src/components/planner.test.ts src/components/types.ts
git commit -m "feat(component): plan lifecycle operations"
```

### Task 3: SQLite Ownership Ledger

**Files:**
- Create: `src/components/ledger.ts`
- Create: `src/components/ledger.test.ts`

- [ ] **Step 1: Write failing ledger tests**

```typescript
// src/components/ledger.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ComponentLedger } from "./ledger.ts";

let scratch = "";
let originalFulcrumHome: string | undefined;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-component-ledger-"));
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(async () => {
  if (originalFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = originalFulcrumHome;
  await rm(scratch, { recursive: true, force: true });
});

describe("ComponentLedger", () => {
  test("initializes schema version 1", () => {
    const ledger = ComponentLedger.open();
    expect(ledger.userVersion()).toBe(1);
    ledger.close();
  });

  test("records component and surface state", () => {
    const ledger = ComponentLedger.open();
    ledger.recordComponent({ id: "hooks.format", kind: "hook", status: "installed" });
    ledger.recordSurface({
      id: "hooks.format:codex",
      componentId: "hooks.format",
      agentId: "codex",
      kind: "hook-registration",
      target: "~/.codex/hooks.json",
      ownerKey: "fulcrum:hook:format",
      desiredEnabled: true,
      removePolicy: "managed-only",
    });
    expect(ledger.componentStatus("hooks.format")?.status).toBe("installed");
    expect(ledger.surfacesForComponent("hooks.format")).toHaveLength(1);
    ledger.close();
  });

  test("records operation steps", () => {
    const ledger = ComponentLedger.open();
    const operationId = ledger.beginOperation("install", "hooks.format");
    ledger.recordOperationStep({
      operationId,
      actionId: "a1",
      componentId: "hooks.format",
      agentId: "codex",
      action: "create-or-update",
      status: "ok",
    });
    ledger.endOperation(operationId, "ok");
    expect(ledger.operationSteps(operationId)[0]?.status).toBe("ok");
    ledger.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test src/components/ledger.test.ts
```

Expected: FAIL because `ledger.ts` does not exist.

- [ ] **Step 3: Implement ledger**

Use `bun:sqlite`. Generate operation IDs with existing-safe timestamp plus random suffix; ULID can be introduced later with a small helper when repo supervisor work starts.

```typescript
// src/components/ledger.ts
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

function fulcrumHome(): string {
  return process.env["FULCRUM_HOME"] ?? `${process.env["HOME"]}/.fulcrum`;
}

function dbPath(): string {
  return `${fulcrumHome()}/state/global/components.db`;
}

function now(): string {
  return new Date().toISOString();
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class ComponentLedger {
  private constructor(private readonly db: Database) {}

  static open(path = dbPath()): ComponentLedger {
    mkdirSync(dirname(path), { recursive: true });
    const db = new Database(path);
    const ledger = new ComponentLedger(db);
    ledger.migrate();
    return ledger;
  }

  close(): void {
    this.db.close();
  }

  userVersion(): number {
    return this.db.query("PRAGMA user_version").get() as number;
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS components (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        version TEXT,
        installed_at TEXT,
        updated_at TEXT,
        status TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS surfaces (
        id TEXT PRIMARY KEY,
        component_id TEXT NOT NULL,
        agent_id TEXT,
        kind TEXT NOT NULL,
        target TEXT NOT NULL,
        owner_key TEXT NOT NULL,
        desired_enabled INTEGER,
        remove_policy TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS artifacts (
        surface_id TEXT NOT NULL,
        path TEXT NOT NULL,
        sha256 TEXT,
        size INTEGER,
        modified INTEGER NOT NULL DEFAULT 0,
        last_seen_at TEXT NOT NULL,
        PRIMARY KEY(surface_id, path)
      );
      CREATE TABLE IF NOT EXISTS operations (
        id TEXT PRIMARY KEY,
        command TEXT NOT NULL,
        target TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        status TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS operation_steps (
        operation_id TEXT NOT NULL,
        action_id TEXT NOT NULL,
        component_id TEXT NOT NULL,
        agent_id TEXT,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        PRIMARY KEY(operation_id, action_id)
      );
      PRAGMA user_version = 1;
    `);
  }

  recordComponent(input: { id: string; kind: string; status: string; version?: string }): void {
    const ts = now();
    this.db.query(`
      INSERT INTO components (id, kind, version, installed_at, updated_at, status)
      VALUES ($id, $kind, $version, $ts, $ts, $status)
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind,
        version = excluded.version,
        updated_at = excluded.updated_at,
        status = excluded.status
    `).run({ $id: input.id, $kind: input.kind, $version: input.version ?? null, $ts: ts, $status: input.status });
  }

  componentStatus(id: string): { id: string; kind: string; status: string } | null {
    return this.db.query("SELECT id, kind, status FROM components WHERE id = $id").get({ $id: id }) as { id: string; kind: string; status: string } | null;
  }

  recordSurface(input: {
    id: string;
    componentId: string;
    agentId?: string;
    kind: string;
    target: string;
    ownerKey: string;
    desiredEnabled?: boolean;
    removePolicy: string;
  }): void {
    this.db.query(`
      INSERT INTO surfaces (id, component_id, agent_id, kind, target, owner_key, desired_enabled, remove_policy, updated_at)
      VALUES ($id, $componentId, $agentId, $kind, $target, $ownerKey, $desiredEnabled, $removePolicy, $updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        component_id = excluded.component_id,
        agent_id = excluded.agent_id,
        kind = excluded.kind,
        target = excluded.target,
        owner_key = excluded.owner_key,
        desired_enabled = excluded.desired_enabled,
        remove_policy = excluded.remove_policy,
        updated_at = excluded.updated_at
    `).run({
      $id: input.id,
      $componentId: input.componentId,
      $agentId: input.agentId ?? null,
      $kind: input.kind,
      $target: input.target,
      $ownerKey: input.ownerKey,
      $desiredEnabled: input.desiredEnabled === undefined ? null : input.desiredEnabled ? 1 : 0,
      $removePolicy: input.removePolicy,
      $updatedAt: now(),
    });
  }

  surfacesForComponent(componentId: string): Array<{ id: string; component_id: string; agent_id: string | null; kind: string; target: string }> {
    return this.db.query("SELECT id, component_id, agent_id, kind, target FROM surfaces WHERE component_id = $componentId ORDER BY id")
      .all({ $componentId: componentId }) as Array<{ id: string; component_id: string; agent_id: string | null; kind: string; target: string }>;
  }

  beginOperation(command: string, target: string): string {
    const id = newId();
    this.db.query("INSERT INTO operations (id, command, target, started_at, status) VALUES ($id, $command, $target, $startedAt, 'running')")
      .run({ $id: id, $command: command, $target: target, $startedAt: now() });
    return id;
  }

  endOperation(id: string, status: string): void {
    this.db.query("UPDATE operations SET status = $status, ended_at = $endedAt WHERE id = $id")
      .run({ $id: id, $status: status, $endedAt: now() });
  }

  recordOperationStep(input: {
    operationId: string;
    actionId: string;
    componentId: string;
    agentId?: string;
    action: string;
    status: string;
    error?: string;
  }): void {
    const ts = now();
    this.db.query(`
      INSERT INTO operation_steps (operation_id, action_id, component_id, agent_id, action, status, error, started_at, ended_at)
      VALUES ($operationId, $actionId, $componentId, $agentId, $action, $status, $error, $startedAt, $endedAt)
    `).run({
      $operationId: input.operationId,
      $actionId: input.actionId,
      $componentId: input.componentId,
      $agentId: input.agentId ?? null,
      $action: input.action,
      $status: input.status,
      $error: input.error ?? null,
      $startedAt: ts,
      $endedAt: ts,
    });
  }

  operationSteps(operationId: string): Array<{ action_id: string; status: string }> {
    return this.db.query("SELECT action_id, status FROM operation_steps WHERE operation_id = $operationId ORDER BY action_id")
      .all({ $operationId: operationId }) as Array<{ action_id: string; status: string }>;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
bun test src/components/ledger.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ledger.ts src/components/ledger.test.ts
git commit -m "feat(component): record managed state"
```

### Task 4: CLI For List, Info, And Plan

**Files:**
- Create: `src/cli/component.ts`
- Create: `src/cli/component.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing CLI tests**

```typescript
// src/cli/component.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./component.ts";

let scratch = "";
let output: string[] = [];
let originalLog: typeof console.log;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-component-cli-"));
  process.env["FULCRUM_HOME"] = scratch;
  output = [];
  originalLog = console.log;
  console.log = (message?: unknown) => { output.push(String(message ?? "")); };
});

afterEach(async () => {
  console.log = originalLog;
  delete process.env["FULCRUM_HOME"];
  await rm(scratch, { recursive: true, force: true });
});

describe("fulcrum component CLI", () => {
  test("list --json prints component inventory", async () => {
    await run(["list", "--json"]);
    const parsed = JSON.parse(output.join("\n")) as Array<{ id: string }>;
    expect(parsed.some((entry) => entry.id === "profile.default")).toBe(true);
    expect(parsed.some((entry) => entry.id === "package.repomix")).toBe(true);
  });

  test("info --json prints one component", async () => {
    await run(["info", "package.repomix", "--json"]);
    const parsed = JSON.parse(output.join("\n")) as { id: string; surfaces: unknown[] };
    expect(parsed.id).toBe("package.repomix");
    expect(parsed.surfaces.length).toBeGreaterThan(0);
  });

  test("plan install --json prints action plan", async () => {
    await run(["plan", "install", "hooks.format", "--agent", "codex", "--json"]);
    const parsed = JSON.parse(output.join("\n")) as { actions: Array<{ componentId: string; agentId: string }> };
    expect(parsed.actions).toHaveLength(1);
    expect(parsed.actions[0]).toMatchObject({ componentId: "hooks.format", agentId: "codex" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test src/cli/component.test.ts
```

Expected: FAIL because `src/cli/component.ts` does not exist.

- [ ] **Step 3: Implement list/info/plan CLI**

```typescript
// src/cli/component.ts
import { ALL_AGENT_IDS, type AgentId } from "./mcp-registry.ts";
import { ALL_COMPONENTS, getComponent } from "../components/catalog.ts";
import { planComponentOperation } from "../components/planner.ts";
import type { Operation } from "../components/types.ts";

function hasJson(args: string[]): boolean {
  return args.includes("--json");
}

function parseAgents(args: string[]): AgentId[] {
  if (args.includes("--all-agents")) return [...ALL_AGENT_IDS];
  const out: AgentId[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--agent") {
      const value = args[i + 1] as AgentId | undefined;
      if (!value || !(ALL_AGENT_IDS as readonly string[]).includes(value)) {
        throw new Error(`invalid --agent value '${value ?? ""}'`);
      }
      out.push(value);
      i++;
    }
  }
  return out.length > 0 ? out : [...ALL_AGENT_IDS];
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function cmdList(args: string[]): void {
  const rows = ALL_COMPONENTS.map((component) => ({
    id: component.id,
    kind: component.kind,
    description: component.description,
    defaultProfile: component.defaultProfile === true,
  }));
  if (hasJson(args)) {
    printJson(rows);
    return;
  }
  console.log("Fulcrum components:");
  for (const row of rows) {
    console.log(`  ${row.id.padEnd(28)} ${row.description}`);
  }
  console.log("\nUse: fulcrum component info <id>");
}

function cmdInfo(args: string[]): void {
  const id = args.find((arg) => !arg.startsWith("--"));
  if (!id) throw new Error("usage: fulcrum component info <id> [--json]");
  const component = getComponent(id);
  if (!component) throw new Error(`unknown component: ${id}`);
  if (hasJson(args)) {
    printJson(component);
    return;
  }
  console.log(`${component.id} (${component.kind})`);
  console.log(component.description);
  for (const surface of component.surfaces) {
    console.log(`  - ${surface.kind}: ${surface.target}`);
  }
}

function cmdPlan(args: string[]): void {
  const operation = args[0] as Exclude<Operation, "status"> | undefined;
  const target = args[1];
  if (!operation || !target || !["install", "remove", "enable", "disable"].includes(operation)) {
    throw new Error("usage: fulcrum component plan <install|remove|enable|disable> <component> [--agent <id>] [--json]");
  }
  const plan = planComponentOperation({ operation, target, agents: parseAgents(args.slice(2)) });
  if (hasJson(args)) {
    printJson(plan);
    return;
  }
  console.log(`${operation} plan for ${target}`);
  for (const warning of plan.warnings) console.log(`  warning: ${warning}`);
  for (const action of plan.actions) {
    console.log(`  ${action.change.padEnd(16)} ${action.agentId ?? "global"} ${action.componentId} ${action.kind}`);
  }
}

export async function run(args: string[]): Promise<void> {
  const sub = args[0] ?? "list";
  if (sub === "list") return cmdList(args.slice(1));
  if (sub === "info") return cmdInfo(args.slice(1));
  if (sub === "plan") return cmdPlan(args.slice(1));
  throw new Error(`fulcrum component: unknown subcommand '${sub}'`);
}
```

Update `src/index.ts`:

```typescript
case "component": {
  const { run: runComponent } = await import("./cli/component.ts");
  await runComponent(rest);
  return;
}
```

Add help lines:

```text
  fulcrum component list [--json]  List managed Fulcrum components.
  fulcrum component info <id>      Show one managed component.
  fulcrum component plan <op> <id> Plan install/remove/enable/disable.
```

- [ ] **Step 4: Run tests**

Run:

```bash
bun test src/cli/component.test.ts src/components/catalog.test.ts src/components/planner.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/component.ts src/cli/component.test.ts src/index.ts
git commit -m "feat(component): expose lifecycle planning cli"
```

### Task 5: Executor And Hook Adapter

**Files:**
- Create: `src/components/executor.ts`
- Create: `src/components/executor.test.ts`
- Create: `src/components/adapters/hooks.ts`
- Create: `src/components/adapters/hooks.test.ts`
- Modify: `src/cli/component.ts`
- Modify: `src/cli/hooks.ts`

- [ ] **Step 1: Export reusable hook recipe operations**

Before writing component adapter tests, expose these functions from `src/cli/hooks.ts`:

```typescript
export async function enableHookRecipe(name: RecipeName, targetAgents: Set<AgentId>): Promise<void> {
  await enableRecipe(name, targetAgents);
  await writeMarker(name);
}

export async function disableHookRecipe(name: RecipeName, targetAgents: Set<AgentId>): Promise<void> {
  await disableRecipe(name, targetAgents);
  await removeMarker(name);
}
```

Keep existing `cmdEnable` / `cmdDisable` behavior by calling these exports.

- [ ] **Step 2: Write failing hook adapter test**

```typescript
// src/components/adapters/hooks.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyHookAction } from "./hooks.ts";
import type { ComponentAction } from "../types.ts";

let scratch = "";
let originalHome: string | undefined;
let originalFulcrumHome: string | undefined;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-hook-adapter-"));
  originalHome = process.env["HOME"];
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["HOME"] = scratch;
  process.env["FULCRUM_HOME"] = `${scratch}/.fulcrum`;
  await Bun.write(`${scratch}/.codex/.keep`, "");
});

afterEach(async () => {
  if (originalHome === undefined) delete process.env["HOME"]; else process.env["HOME"] = originalHome;
  if (originalFulcrumHome === undefined) delete process.env["FULCRUM_HOME"]; else process.env["FULCRUM_HOME"] = originalFulcrumHome;
  await rm(scratch, { recursive: true, force: true });
});

function action(change: ComponentAction["change"]): ComponentAction {
  return {
    id: `hooks.format:codex:${change}`,
    componentId: "hooks.format",
    surfaceId: "hooks.format:registration",
    agentId: "codex",
    operation: change === "remove" ? "remove" : change === "disable" ? "disable" : "install",
    kind: "hook-registration",
    target: "hook:format",
    change,
    risk: "managed",
    reason: "test",
    payload: { recipe: "format" },
  };
}

describe("hook component adapter", () => {
  test("enable writes Codex hook config and marker", async () => {
    await applyHookAction(action("enable"));
    const hooks = JSON.parse(await readFile(`${scratch}/.codex/hooks.json`, "utf8"));
    expect(JSON.stringify(hooks)).toContain("fulcrum hook format");
    expect(await Bun.file(`${scratch}/.fulcrum/hooks/enabled/format`).exists()).toBe(true);
  });

  test("disable removes Codex hook config and marker", async () => {
    await applyHookAction(action("enable"));
    await applyHookAction(action("disable"));
    expect(await Bun.file(`${scratch}/.fulcrum/hooks/enabled/format`).exists()).toBe(false);
  });
});
```

- [ ] **Step 3: Run hook adapter test to verify it fails**

Run:

```bash
bun test src/components/adapters/hooks.test.ts
```

Expected: FAIL because adapter does not exist or hook exports do not exist.

- [ ] **Step 4: Implement hook adapter**

```typescript
// src/components/adapters/hooks.ts
import type { AgentId } from "../../cli/mcp-registry.ts";
import { disableHookRecipe, enableHookRecipe } from "../../cli/hooks.ts";
import type { ComponentAction } from "../types.ts";

export async function applyHookAction(action: ComponentAction): Promise<void> {
  const recipe = action.payload?.["recipe"];
  if (typeof recipe !== "string") throw new Error(`hook action missing recipe: ${action.id}`);
  const agentId = action.agentId as AgentId | undefined;
  if (!agentId) throw new Error(`hook action missing agent: ${action.id}`);
  const agents = new Set<AgentId>([agentId]);

  if (action.change === "create-or-update" || action.change === "enable") {
    await enableHookRecipe(recipe as never, agents as never);
    return;
  }
  if (action.change === "remove" || action.change === "disable") {
    await disableHookRecipe(recipe as never, agents as never);
    return;
  }
}
```

- [ ] **Step 5: Write failing executor test**

```typescript
// src/components/executor.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeComponentPlan } from "./executor.ts";
import { planComponentOperation } from "./planner.ts";
import { ComponentLedger } from "./ledger.ts";

let scratch = "";
let originalHome: string | undefined;
let originalFulcrumHome: string | undefined;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-executor-"));
  originalHome = process.env["HOME"];
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["HOME"] = scratch;
  process.env["FULCRUM_HOME"] = `${scratch}/.fulcrum`;
  await Bun.write(`${scratch}/.codex/.keep`, "");
});

afterEach(async () => {
  if (originalHome === undefined) delete process.env["HOME"]; else process.env["HOME"] = originalHome;
  if (originalFulcrumHome === undefined) delete process.env["FULCRUM_HOME"]; else process.env["FULCRUM_HOME"] = originalFulcrumHome;
  await rm(scratch, { recursive: true, force: true });
});

describe("component executor", () => {
  test("dry-run records no ledger state and writes no files", async () => {
    const plan = planComponentOperation({ operation: "install", target: "hooks.format", agents: ["codex"] });
    await executeComponentPlan(plan, { dryRun: true });
    expect(await Bun.file(`${scratch}/.codex/hooks.json`).exists()).toBe(false);
    const ledger = ComponentLedger.open();
    expect(ledger.componentStatus("hooks.format")).toBeNull();
    ledger.close();
  });

  test("executes hook plan and records ledger state", async () => {
    const plan = planComponentOperation({ operation: "install", target: "hooks.format", agents: ["codex"] });
    await executeComponentPlan(plan, { dryRun: false });
    expect(await Bun.file(`${scratch}/.codex/hooks.json`).exists()).toBe(true);
    const ledger = ComponentLedger.open();
    expect(ledger.componentStatus("hooks.format")?.status).toBe("installed");
    expect(ledger.surfacesForComponent("hooks.format")).toHaveLength(1);
    ledger.close();
  });
});
```

- [ ] **Step 6: Implement executor for hook-registration**

```typescript
// src/components/executor.ts
import { getComponent } from "./catalog.ts";
import { ComponentLedger } from "./ledger.ts";
import type { ComponentAction, ComponentPlan } from "./types.ts";
import { applyHookAction } from "./adapters/hooks.ts";

interface ExecuteOptions {
  dryRun?: boolean;
}

async function applyAction(action: ComponentAction): Promise<void> {
  if (action.change === "noop" || action.change === "preserve") return;
  if (action.kind === "hook-registration") {
    await applyHookAction(action);
    return;
  }
  throw new Error(`component executor does not support ${action.kind} yet`);
}

function statusForOperation(operation: ComponentPlan["operation"]): string {
  if (operation === "remove") return "removed";
  if (operation === "disable") return "disabled";
  return "installed";
}

export async function executeComponentPlan(plan: ComponentPlan, opts: ExecuteOptions = {}): Promise<void> {
  if (opts.dryRun) {
    for (const action of plan.actions) {
      console.log(`[dry-run] ${action.change} ${action.componentId} ${action.agentId ?? "global"} ${action.kind}`);
    }
    return;
  }

  const ledger = ComponentLedger.open();
  const operationId = ledger.beginOperation(plan.operation, plan.target);
  let ok = true;
  try {
    for (const action of plan.actions) {
      try {
        await applyAction(action);
        const component = getComponent(action.componentId);
        ledger.recordComponent({
          id: action.componentId,
          kind: component?.kind ?? "package",
          status: statusForOperation(plan.operation),
        });
        ledger.recordSurface({
          id: action.id,
          componentId: action.componentId,
          agentId: action.agentId,
          kind: action.kind,
          target: action.target,
          ownerKey: action.surfaceId,
          desiredEnabled: action.operation !== "disable" && action.operation !== "remove",
          removePolicy: "managed-only",
        });
        ledger.recordOperationStep({
          operationId,
          actionId: action.id,
          componentId: action.componentId,
          agentId: action.agentId,
          action: action.change,
          status: "ok",
        });
      } catch (err) {
        ok = false;
        ledger.recordOperationStep({
          operationId,
          actionId: action.id,
          componentId: action.componentId,
          agentId: action.agentId,
          action: action.change,
          status: "error",
          error: (err as Error).message,
        });
        throw err;
      }
    }
  } finally {
    ledger.endOperation(operationId, ok ? "ok" : "error");
    ledger.close();
  }
}
```

- [ ] **Step 7: Wire component install/remove/enable/disable CLI for hook components**

In `src/cli/component.ts`, add:

```typescript
async function cmdApply(operation: "install" | "remove" | "enable" | "disable", args: string[]): Promise<void> {
  const target = args.find((arg) => !arg.startsWith("--"));
  if (!target) throw new Error(`usage: fulcrum component ${operation} <component> [--agent <id>] [--dry-run] [--json]`);
  const plan = planComponentOperation({ operation, target, agents: parseAgents(args) });
  if (hasJson(args)) printJson(plan);
  const { executeComponentPlan } = await import("../components/executor.ts");
  await executeComponentPlan(plan, { dryRun: args.includes("--dry-run") });
}
```

Dispatch:

```typescript
if (sub === "install" || sub === "remove" || sub === "enable" || sub === "disable") {
  return cmdApply(sub, args.slice(1));
}
```

- [ ] **Step 8: Run targeted tests**

Run:

```bash
bun test src/components/adapters/hooks.test.ts src/components/executor.test.ts src/cli/component.test.ts src/cli/hooks.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/executor.ts src/components/executor.test.ts src/components/adapters/hooks.ts src/components/adapters/hooks.test.ts src/cli/component.ts src/cli/hooks.ts
git commit -m "feat(component): execute hook lifecycle actions"
```

### Task 6: MCP Adapter

**Files:**
- Create: `src/components/adapters/mcp.ts`
- Create: `src/components/adapters/mcp.test.ts`
- Modify: `src/components/executor.ts`
- Modify: `src/cli/mcp-registry.ts`
- Modify: `src/cli/mcp-cmd.ts`

- [ ] **Step 1: Write failing MCP adapter tests**

```typescript
// src/components/adapters/mcp.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerBuiltinMcpByName } from "./mcp.ts";
import { loadRegistry } from "../../cli/mcp-registry.ts";

let scratch = "";
let originalHome: string | undefined;
let originalFulcrumHome: string | undefined;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-mcp-adapter-"));
  originalHome = process.env["HOME"];
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["HOME"] = scratch;
  process.env["FULCRUM_HOME"] = `${scratch}/.fulcrum`;
  await Bun.write(`${scratch}/.codex/.keep`, "");
});

afterEach(async () => {
  if (originalHome === undefined) delete process.env["HOME"]; else process.env["HOME"] = originalHome;
  if (originalFulcrumHome === undefined) delete process.env["FULCRUM_HOME"]; else process.env["FULCRUM_HOME"] = originalFulcrumHome;
  await rm(scratch, { recursive: true, force: true });
});

describe("mcp component adapter", () => {
  test("registers builtin MCP by name", async () => {
    await registerBuiltinMcpByName("context7");
    const reg = await loadRegistry();
    expect(reg.servers.context7?.name).toBe("context7");
  });

  test("enables builtin MCP for one agent", async () => {
    await registerBuiltinMcpByName("github", { enabled: true, agents: ["codex"] });
    const config = await readFile(`${scratch}/.codex/config.toml`, "utf8");
    expect(config).toContain("[mcp_servers.github]");
    expect(config).toContain('bearer_token_env_var = "GITHUB_TOKEN"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test src/components/adapters/mcp.test.ts
```

Expected: FAIL because adapter does not exist.

- [ ] **Step 3: Implement MCP adapter**

```typescript
// src/components/adapters/mcp.ts
import { BUILTIN_MCPS } from "../../cli/mcp-builtins.ts";
import { applyToAgents, registerServer, removeFromAgents, setEnabled, type AgentId } from "../../cli/mcp-registry.ts";
import { installDeepwikiMcp, uninstallDeepwikiMcp } from "../../cli/mcp.ts";
import type { ComponentAction } from "../types.ts";

export async function registerBuiltinMcpByName(
  name: string,
  opts: { enabled?: boolean; agents?: readonly AgentId[]; dryRun?: boolean } = {},
): Promise<void> {
  const entry = BUILTIN_MCPS.find((builtin) => builtin.name === name);
  if (!entry) throw new Error(`unknown builtin MCP: ${name}`);
  await registerServer(entry.name, entry.spec);
  if (opts.enabled !== undefined) await setEnabled(entry.name, opts.enabled, { agents: opts.agents ? [...opts.agents] : undefined });
  await applyToAgents(entry.name, { agents: opts.agents, dryRun: opts.dryRun });
}

export async function applyMcpAction(action: ComponentAction, dryRun = false): Promise<void> {
  const name = String(action.payload?.["name"] ?? action.componentId.replace(/^mcp\./, ""));
  const agents = action.agentId ? [action.agentId as AgentId] : undefined;

  if (action.componentId === "mcp.deepwiki") {
    if (action.change === "remove" || action.change === "disable") await uninstallDeepwikiMcp({ dryRun });
    else await installDeepwikiMcp({ dryRun });
    return;
  }

  if (action.componentId === "mcp.registry") {
    for (const builtin of BUILTIN_MCPS) await registerServer(builtin.name, builtin.spec);
    return;
  }

  if (action.change === "remove") {
    await removeFromAgents(name, { agents, dryRun });
    return;
  }
  if (action.change === "disable") {
    await setEnabled(name, false, { agents });
    await applyToAgents(name, { agents, dryRun });
    return;
  }
  if (action.change === "enable") {
    await registerBuiltinMcpByName(name, { enabled: true, agents, dryRun });
    return;
  }
  if (action.change === "create-or-update") {
    await registerBuiltinMcpByName(name, { agents, dryRun });
  }
}
```

Update executor:

```typescript
if (action.kind === "mcp-registry-entry" || action.kind === "mcp-agent-config") {
  const { applyMcpAction } = await import("./adapters/mcp.ts");
  await applyMcpAction(action);
  return;
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
bun test src/components/adapters/mcp.test.ts src/cli/mcp-registry.test.ts src/cli/mcp-cmd.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/adapters/mcp.ts src/components/adapters/mcp.test.ts src/components/executor.ts src/cli/mcp-registry.ts src/cli/mcp-cmd.ts
git commit -m "feat(component): manage mcp lifecycle actions"
```

### Task 7: Adapters For Rules And Policy

**Files:**
- Create: `src/components/adapters/sentinel.ts`
- Create: `src/components/adapters/files.ts`
- Create: `src/components/adapters/sentinel.test.ts`
- Create: `src/components/adapters/files.test.ts`
- Modify: `src/components/executor.ts`
- Modify: `src/cli/install.ts`
- Modify: `src/cli/uninstall.ts`

- [ ] **Step 1: Export reusable rules and policy helpers**

From `src/cli/install.ts`, export:

```typescript
export async function installRulesBlocks(home: string, dryRun = false): Promise<void>
export async function installToolOutputPolicy(dryRun = false): Promise<void>
```

From `src/cli/uninstall.ts`, export:

```typescript
export async function removeRulesBlocks(home: string): Promise<void>
export async function removeToolOutputPolicy(purge: boolean): Promise<void>
```

Keep current CLI behavior unchanged by calling these helpers.

- [ ] **Step 2: Write failing sentinel adapter test**

```typescript
// src/components/adapters/sentinel.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyRulesAction } from "./sentinel.ts";

let scratch = "";
let originalHome: string | undefined;
let originalRepo: string | undefined;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-rules-adapter-"));
  originalHome = process.env["HOME"];
  originalRepo = process.env["FULCRUM_REPO_DIR"];
  process.env["HOME"] = scratch;
  process.env["FULCRUM_REPO_DIR"] = process.cwd();
  await Bun.write(`${scratch}/.codex/.keep`, "");
});

afterEach(async () => {
  if (originalHome === undefined) delete process.env["HOME"]; else process.env["HOME"] = originalHome;
  if (originalRepo === undefined) delete process.env["FULCRUM_REPO_DIR"]; else process.env["FULCRUM_REPO_DIR"] = originalRepo;
  await rm(scratch, { recursive: true, force: true });
});

describe("rules component adapter", () => {
  test("installs and removes Fulcrum rules sentinel block", async () => {
    await applyRulesAction("install", false);
    expect(await readFile(`${scratch}/.codex/AGENTS.md`, "utf8")).toContain("BEGIN FULCRUM RULES");
    await applyRulesAction("remove", false);
    expect(await readFile(`${scratch}/.codex/AGENTS.md`, "utf8")).not.toContain("BEGIN FULCRUM RULES");
  });
});
```

- [ ] **Step 3: Write failing policy adapter test**

```typescript
// src/components/adapters/files.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPolicyAction } from "./files.ts";

let scratch = "";
let originalFulcrumHome: string | undefined;
let originalRepo: string | undefined;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-policy-adapter-"));
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  originalRepo = process.env["FULCRUM_REPO_DIR"];
  process.env["FULCRUM_HOME"] = `${scratch}/.fulcrum`;
  process.env["FULCRUM_REPO_DIR"] = process.cwd();
});

afterEach(async () => {
  if (originalFulcrumHome === undefined) delete process.env["FULCRUM_HOME"]; else process.env["FULCRUM_HOME"] = originalFulcrumHome;
  if (originalRepo === undefined) delete process.env["FULCRUM_REPO_DIR"]; else process.env["FULCRUM_REPO_DIR"] = originalRepo;
  await rm(scratch, { recursive: true, force: true });
});

describe("policy component adapter", () => {
  test("installs tool-output policy", async () => {
    await applyPolicyAction("install", false);
    expect(await Bun.file(`${scratch}/.fulcrum/tool-output-policy.toml`).exists()).toBe(true);
  });
});
```

- [ ] **Step 4: Implement adapters**

```typescript
// src/components/adapters/sentinel.ts
import { installRulesBlocks } from "../../cli/install.ts";
import { removeRulesBlocks } from "../../cli/uninstall.ts";

export async function applyRulesAction(operation: "install" | "remove" | "enable" | "disable", dryRun: boolean): Promise<void> {
  const home = process.env["HOME"] ?? "";
  if (operation === "remove" || operation === "disable") {
    await removeRulesBlocks(home);
    return;
  }
  await installRulesBlocks(home, dryRun);
}
```

```typescript
// src/components/adapters/files.ts
import { installToolOutputPolicy } from "../../cli/install.ts";
import { removeToolOutputPolicy } from "../../cli/uninstall.ts";

export async function applyPolicyAction(operation: "install" | "remove" | "enable" | "disable", dryRun: boolean, purge = false): Promise<void> {
  if (operation === "remove" || operation === "disable") {
    await removeToolOutputPolicy(purge);
    return;
  }
  await installToolOutputPolicy(dryRun);
}
```

Update executor dispatch:

```typescript
if (action.kind === "sentinel-block") {
  const { applyRulesAction } = await import("./adapters/sentinel.ts");
  await applyRulesAction(action.operation, false);
  return;
}
if (action.kind === "policy-seed") {
  const { applyPolicyAction } = await import("./adapters/files.ts");
  await applyPolicyAction(action.operation, false);
  return;
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
bun test src/components/adapters/sentinel.test.ts src/components/adapters/files.test.ts src/cli/install.test.ts src/cli/uninstall.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/adapters/sentinel.ts src/components/adapters/files.ts src/components/adapters/sentinel.test.ts src/components/adapters/files.test.ts src/components/executor.ts src/cli/install.ts src/cli/uninstall.ts
git commit -m "feat(component): manage rules and policy surfaces"
```

### Task 8: Adapters For Skills And Vendor Packages

**Files:**
- Create: `src/components/adapters/vendor.ts`
- Create: `src/components/adapters/vendor.test.ts`
- Modify: `src/components/executor.ts`
- Modify: `src/cli/skills.ts`
- Modify: `src/cli/upstream-skills.ts`
- Modify: `src/cli/vendor-packages.ts`
- Modify: `src/cli/repomix-package.ts`
- Modify: `src/cli/install.ts`
- Modify: `src/cli/uninstall.ts`

- [ ] **Step 1: Write failing first-party-vs-mirror contract tests**

Add tests that lock the package mirroring contract before changing helpers. These tests must prove the component path keeps the current `fulcrum install` behavior for packages and skills.

```typescript
// src/components/adapters/vendor.test.ts
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyVendorAction, classifyVendorComponent } from "./vendor.ts";
import type { ComponentAction } from "../types.ts";
import * as proc from "../../utils/proc.ts";

let home: string;
let originalHome: string | undefined;
let originalFulcrumHome: string | undefined;
let originalRepoDir: string | undefined;

function action(componentId: string, change: ComponentAction["change"] = "create-or-update"): ComponentAction {
  return {
    id: `${componentId}:test`,
    componentId,
    surfaceId: `${componentId}:surface`,
    operation: change === "remove" ? "remove" : "install",
    kind: componentId.startsWith("skills.") ? "skill-sync" : "vendor-command",
    target: `test:${componentId}`,
    change,
    risk: "managed",
    reason: "test",
  };
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "fulcrum-vendor-adapter-"));
  originalHome = process.env["HOME"];
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  originalRepoDir = process.env["FULCRUM_REPO_DIR"];
  process.env["HOME"] = home;
  process.env["FULCRUM_HOME"] = join(home, ".fulcrum");
  process.env["FULCRUM_REPO_DIR"] = home;
});

afterEach(async () => {
  if (originalHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = originalHome;
  if (originalFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = originalFulcrumHome;
  if (originalRepoDir === undefined) delete process.env["FULCRUM_REPO_DIR"];
  else process.env["FULCRUM_REPO_DIR"] = originalRepoDir;
  await rm(home, { recursive: true, force: true });
});

describe("vendor component adapter", () => {
  test("classifies supported vendor components", () => {
    expect(classifyVendorComponent("skills.authored")).toBe("skills-authored");
    expect(classifyVendorComponent("skills.upstream")).toBe("skills-upstream");
    expect(classifyVendorComponent("package.caveman")).toBe("caveman");
    expect(classifyVendorComponent("package.repomix")).toBe("repomix");
    expect(classifyVendorComponent("package.cloudflare")).toBe("cloudflare");
    expect(classifyVendorComponent("package.superpowers")).toBe("superpowers");
  });

  test("Repomix package installs Claude plugins and mirrors non-Claude surfaces", async () => {
    await mkdir(join(home, ".claude"), { recursive: true });
    await mkdir(join(home, ".codex"), { recursive: true });
    await mkdir(join(home, ".gemini"), { recursive: true });
    await mkdir(join(home, ".config", "opencode"), { recursive: true });
    await mkdir(join(home, ".pi", "agent"), { recursive: true });
    await mkdir(join(home, ".claude", "plugins", "cache", "repomix", "repomix-commands", "1.0.2", "commands"), { recursive: true });
    await mkdir(join(home, ".claude", "plugins", "cache", "repomix", "repomix-explorer", "1.1.0", "agents"), { recursive: true });
    await writeFile(join(home, ".claude", "plugins", "cache", "repomix", "repomix-commands", "1.0.2", "commands", "pack-local.md"), "---\ndescription: Pack local\n---\n\nRun local repomix.\n");
    await writeFile(join(home, ".claude", "plugins", "cache", "repomix", "repomix-commands", "1.0.2", "commands", "pack-remote.md"), "---\ndescription: Pack remote\n---\n\nRun remote repomix.\n");
    await writeFile(join(home, ".claude", "plugins", "cache", "repomix", "repomix-explorer", "1.1.0", "agents", "explorer.md"), "---\nname: explorer\n---\n\nExplore with repomix.\n");

    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => cmd === "claude" ? "/usr/local/bin/claude" : null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    try {
      await applyVendorAction(action("package.repomix"), false);
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }

    expect(runSpy.mock.calls.map((call) => call[0])).toContainEqual(["claude", "plugin", "install", "repomix-mcp@repomix"]);
    expect(await readFile(join(home, ".codex", "skills", "repomix-pack-local", "SKILL.md"), "utf8")).toContain("Run local repomix.");
    expect(await readFile(join(home, ".gemini", "extensions", "repomix", "gemini-extension.json"), "utf8")).toContain("\"repomix\"");
    expect(await readFile(join(home, ".config", "opencode", "agents", "repomix-explorer.md"), "utf8")).toContain("Explore with repomix.");
    expect(await readFile(join(home, ".pi", "agent", "skills", "repomix-explorer", "SKILL.md"), "utf8")).toContain("Explore with repomix.");
  });

  test("Cloudflare package uses Claude plugin and mirrors only Cloudflare upstream skills to non-Claude agents", async () => {
    await mkdir(join(home, ".claude"), { recursive: true });
    await mkdir(join(home, ".codex", "skills"), { recursive: true });
    await mkdir(join(home, ".gemini"), { recursive: true });
    await mkdir(join(home, ".config", "opencode", "skills"), { recursive: true });
    await mkdir(join(home, ".pi", "agent", "skills"), { recursive: true });
    await mkdir(join(home, "skills"), { recursive: true });
    await writeFile(join(home, "skills", "upstream.lock"), [
      "[meta]",
      "schema_version = 1",
      "",
      "[skills.wrangler]",
      'source = "https://github.com/cloudflare/skills"',
      'subpath = "skills/wrangler"',
      'ref = "main"',
      'tree_sha = "0123456789abcdef0123456789abcdef01234567"',
      'license = "Apache-2.0"',
      'author_class = "tool-vendor"',
      'pinned_on = "2026-04-28"',
      'review_due = "2026-07-27"',
      'vendor_canonical_agents = ["claude-code"]',
      "",
      "[skills.graphify]",
      'source = "https://github.com/safishamsi/graphify"',
      'subpath = "graphify/skill.md"',
      'ref = "main"',
      'tree_sha = "89abcdef0123456789abcdef0123456789abcdef"',
      'license = "MIT"',
      'author_class = "tool-vendor"',
      'pinned_on = "2026-04-28"',
      'review_due = "2026-07-27"',
      "",
    ].join("\n"));

    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => cmd === "claude" ? "/usr/local/bin/claude" : null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    });
    try {
      await applyVendorAction(action("package.cloudflare"), true);
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
      logSpy.mockRestore();
    }

    expect(logs.some((line) => line.includes("claude plugin install cloudflare@cloudflare"))).toBe(true);
    expect(logs.some((line) => line.includes("wrangler"))).toBe(true);
    expect(logs.some((line) => line.includes("graphify"))).toBe(false);
    expect(await Bun.file(join(home, ".claude", "skills", "wrangler")).exists()).toBe(false);
  });

  test("Superpowers package mirrors Codex and falls back to Pi mirror only when pi binary is absent", async () => {
    await mkdir(join(home, ".codex"), { recursive: true });
    await mkdir(join(home, ".pi", "agent"), { recursive: true });
    await mkdir(join(home, ".fulcrum", "cache", "superpowers", "skills", "brainstorming"), { recursive: true });
    await writeFile(join(home, ".fulcrum", "cache", "superpowers", "skills", "brainstorming", "SKILL.md"), "---\nname: brainstorming\n---\n\nBrainstorm.\n");

    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    try {
      await applyVendorAction(action("package.superpowers"), false);
    } finally {
      whichSpy.mockRestore();
    }

    expect(await readFile(join(home, ".codex", "skills", "superpowers", "brainstorming", "SKILL.md"), "utf8")).toContain("Brainstorm.");
    expect(await readFile(join(home, ".pi", "agent", "skills", "superpowers", "brainstorming", "SKILL.md"), "utf8")).toContain("Brainstorm.");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun test src/components/adapters/vendor.test.ts
```

Expected: FAIL because `src/components/adapters/vendor.ts` does not exist and package-specific helpers are not exported.

- [ ] **Step 3: Export reusable package helpers**

Ensure these functions are exported and stable:

```typescript
// src/cli/skills.ts
export async function syncSkills(opts?: { dryRun?: boolean }): Promise<void>
export async function removeAuthoredSkills(opts?: { dryRun?: boolean }): Promise<void>

// src/cli/upstream-skills.ts
export async function syncUpstreamSkills(opts?: { dryRun?: boolean; updatePins?: boolean }): Promise<void>
export async function syncUpstreamSkillsBySource(source: string, opts?: { dryRun?: boolean; updatePins?: boolean; lockPath?: string }): Promise<void>
export async function syncUpstreamSkillsByNames(names: readonly string[], opts?: { dryRun?: boolean; updatePins?: boolean; lockPath?: string }): Promise<void>
export async function removeUpstreamSkills(opts?: { dryRun?: boolean; source?: string; names?: readonly string[] }): Promise<void>

// src/cli/vendor-packages.ts
export async function installCloudflarePackage(opts?: { dryRun?: boolean }): Promise<void>
export async function uninstallCloudflarePackage(opts?: { dryRun?: boolean }): Promise<void>
export async function installSuperpowersPackage(opts?: { dryRun?: boolean }): Promise<void>
export async function uninstallSuperpowersPackage(opts?: { dryRun?: boolean }): Promise<void>

// src/cli/repomix-package.ts
export async function installRepomixClaudePlugins(opts?: { dryRun?: boolean }): Promise<void>
export async function uninstallRepomixClaudePlugins(opts?: { dryRun?: boolean }): Promise<void>
export async function installRepomixPackageMirrors(opts?: { dryRun?: boolean }): Promise<void>
export async function uninstallRepomixPackageMirrors(opts?: { dryRun?: boolean }): Promise<void>

// src/cli/install.ts
export async function installCaveman(home: string, opts?: { dryRun?: boolean }): Promise<void>

// src/cli/uninstall.ts
export async function removeCavemanCopies(home: string, opts?: { dryRun?: boolean }): Promise<void>
```

Keep current aggregate functions by calling these exported units. Move Repomix Claude plugin installation/removal out of private install/uninstall helpers into `src/cli/repomix-package.ts` so `package.repomix` can install/remove the full Repomix package surface without requiring `mcp.registry`.

- [ ] **Step 4: Add upstream filtering tests**

```typescript
// src/cli/upstream-skills.test.ts
import { syncUpstreamSkillsBySource } from "./upstream-skills.ts";

test("syncUpstreamSkillsBySource installs only matching source entries", async () => {
  const lockPath = await writeLock([
    "[meta]",
    "schema_version = 1",
    "",
    "[skills.wrangler]",
    'source = "https://github.com/cloudflare/skills"',
    'subpath = "skills/wrangler"',
    'ref = "main"',
    'tree_sha = "0123456789abcdef0123456789abcdef01234567"',
    'license = "Apache-2.0"',
    'author_class = "tool-vendor"',
    'pinned_on = "2026-04-28"',
    'review_due = "2026-07-27"',
    'vendor_canonical_agents = ["claude-code"]',
    "",
    "[skills.graphify]",
    'source = "https://github.com/safishamsi/graphify"',
    'subpath = "graphify/skill.md"',
    'ref = "main"',
    'tree_sha = "89abcdef0123456789abcdef0123456789abcdef"',
    'license = "MIT"',
    'author_class = "tool-vendor"',
    'pinned_on = "2026-04-28"',
    'review_due = "2026-07-27"',
    "",
  ].join("\n"));

  await mkdir(join(TMP, ".codex", "skills"), { recursive: true });
  await mkdir(join(TMP, ".gemini"), { recursive: true });

  const logs: string[] = [];
  const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map((arg) => String(arg)).join(" "));
  });
  try {
    await syncUpstreamSkillsBySource("https://github.com/cloudflare/skills", { dryRun: true, lockPath });
  } finally {
    logSpy.mockRestore();
  }

  expect(logs.some((line) => line.includes("wrangler"))).toBe(true);
  expect(logs.some((line) => line.includes("graphify"))).toBe(false);
});
```

- [ ] **Step 5: Implement vendor adapter dispatcher**

```typescript
// src/components/adapters/vendor.ts
import { installCaveman } from "../../cli/install.ts";
import { removeCavemanCopies } from "../../cli/uninstall.ts";
import { removeAuthoredSkills, syncSkills } from "../../cli/skills.ts";
import {
  removeUpstreamSkills,
  syncUpstreamSkills,
  syncUpstreamSkillsBySource,
} from "../../cli/upstream-skills.ts";
import {
  installCloudflarePackage,
  installSuperpowersPackage,
  uninstallCloudflarePackage,
  uninstallSuperpowersPackage,
} from "../../cli/vendor-packages.ts";
import {
  installRepomixClaudePlugins,
  installRepomixPackageMirrors,
  uninstallRepomixClaudePlugins,
  uninstallRepomixPackageMirrors,
} from "../../cli/repomix-package.ts";
import type { ComponentAction } from "../types.ts";

type VendorComponent =
  | "skills-authored"
  | "skills-upstream"
  | "caveman"
  | "repomix"
  | "cloudflare"
  | "superpowers";

export function classifyVendorComponent(componentId: string): VendorComponent {
  if (componentId === "skills.authored") return "skills-authored";
  if (componentId === "skills.upstream") return "skills-upstream";
  if (componentId === "package.caveman") return "caveman";
  if (componentId === "package.repomix") return "repomix";
  if (componentId === "package.cloudflare") return "cloudflare";
  if (componentId === "package.superpowers") return "superpowers";
  throw new Error(`unsupported vendor component: ${componentId}`);
}

export async function applyVendorAction(action: ComponentAction, dryRun: boolean): Promise<void> {
  const kind = classifyVendorComponent(action.componentId);
  const installing = action.change === "create-or-update" || action.change === "enable";

  if (kind === "skills-authored") return installing ? syncSkills({ dryRun }) : removeAuthoredSkills({ dryRun });
  if (kind === "skills-upstream") return installing ? syncUpstreamSkills({ dryRun }) : removeUpstreamSkills({ dryRun });
  if (kind === "caveman") return installing
    ? installCaveman(process.env["HOME"] ?? "", { dryRun })
    : removeCavemanCopies(process.env["HOME"] ?? "", { dryRun });
  if (kind === "repomix") {
    if (installing) {
      await installRepomixClaudePlugins({ dryRun });
      await installRepomixPackageMirrors({ dryRun });
      return;
    }
    await uninstallRepomixClaudePlugins({ dryRun });
    await uninstallRepomixPackageMirrors({ dryRun });
    return;
  }
  if (kind === "cloudflare") {
    if (installing) {
      await installCloudflarePackage({ dryRun });
      await syncUpstreamSkillsBySource("https://github.com/cloudflare/skills", { dryRun });
      return;
    }
    await uninstallCloudflarePackage({ dryRun });
    await removeUpstreamSkills({ dryRun, source: "https://github.com/cloudflare/skills" });
    return;
  }
  return installing ? installSuperpowersPackage({ dryRun }) : uninstallSuperpowersPackage({ dryRun });
}
```

Update executor dispatch:

```typescript
if (action.kind === "skill-sync" || action.kind === "upstream-skill-sync" || action.kind === "vendor-command" || action.kind === "directory-copy" || action.kind === "file-copy") {
  const { applyVendorAction } = await import("./adapters/vendor.ts");
  await applyVendorAction(action, false);
  return;
}
```

- [ ] **Step 6: Verify component dry-run surfaces**

Run:

```bash
bun run --bun src/index.ts component install package.repomix --agent codex --dry-run
bun run --bun src/index.ts component install package.cloudflare --all-agents --dry-run
bun run --bun src/index.ts component remove package.superpowers --agent pi --dry-run
```

Expected:

```text
DRY RUN package.repomix:install:codex:install create-or-update vendor-command agent-repomix-surfaces
DRY RUN package.cloudflare:install:claude-code:install create-or-update vendor-command agent-cloudflare-surfaces
DRY RUN package.superpowers:install:pi:remove remove vendor-command agent-superpowers-surfaces
```

The exact action IDs may differ if the planner uses surface IDs, but output must show package component, agent scope, operation, `vendor-command`, and no filesystem writes.

- [ ] **Step 7: Run targeted tests**

Run:

```bash
bun test src/components/adapters/vendor.test.ts src/cli/skills.test.ts src/cli/upstream-skills.test.ts src/cli/vendor-packages.test.ts src/cli/repomix-package.test.ts src/cli/install.test.ts src/cli/uninstall.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/adapters/vendor.ts src/components/adapters/vendor.test.ts src/components/executor.ts src/cli/skills.ts src/cli/upstream-skills.ts src/cli/vendor-packages.ts src/cli/repomix-package.ts src/cli/install.ts src/cli/uninstall.ts
git commit -m "feat(component): manage skills and vendor packages"
```

### Task 9: Status Command And Doctor Integration

**Files:**
- Modify: `src/cli/component.ts`
- Modify: `src/cli/component.test.ts`
- Modify: `src/cli/doctor.ts`
- Modify: `src/cli/doctor.test.ts`

- [ ] **Step 1: Write failing status CLI test**

Add to `src/cli/component.test.ts`:

```typescript
test("status --json reports ledger component state", async () => {
  const { ComponentLedger } = await import("../components/ledger.ts");
  const ledger = ComponentLedger.open();
  ledger.recordComponent({ id: "hooks.format", kind: "hook", status: "installed" });
  ledger.close();

  await run(["status", "hooks.format", "--json"]);
  const parsed = JSON.parse(output.join("\n")) as { componentId: string; status: string };
  expect(parsed).toMatchObject({ componentId: "hooks.format", status: "installed" });
});
```

- [ ] **Step 2: Implement status**

In `src/cli/component.ts`:

```typescript
async function cmdStatus(args: string[]): Promise<void> {
  const id = args.find((arg) => !arg.startsWith("--"));
  const { ComponentLedger } = await import("../components/ledger.ts");
  const ledger = ComponentLedger.open();
  try {
    if (id) {
      const component = ledger.componentStatus(id);
      const payload = {
        componentId: id,
        status: component?.status ?? "not-installed",
        surfaces: ledger.surfacesForComponent(id),
      };
      if (hasJson(args)) printJson(payload);
      else console.log(`${payload.componentId}: ${payload.status}`);
      return;
    }
    const payload = ALL_COMPONENTS.map((component) => {
      const status = ledger.componentStatus(component.id);
      return { componentId: component.id, status: status?.status ?? "not-installed" };
    });
    if (hasJson(args)) printJson(payload);
    else for (const row of payload) console.log(`${row.componentId.padEnd(28)} ${row.status}`);
  } finally {
    ledger.close();
  }
}
```

Dispatch:

```typescript
if (sub === "status") return cmdStatus(args.slice(1));
```

- [ ] **Step 3: Write failing doctor test**

Add a doctor report assertion in `src/cli/doctor.test.ts`:

```typescript
test("doctor reports component lifecycle state", async () => {
  const { ComponentLedger } = await import("../components/ledger.ts");
  const ledger = ComponentLedger.open();
  ledger.recordComponent({ id: "hooks.format", kind: "hook", status: "installed" });
  ledger.close();

  const report = await buildReport({ json: true, probe: false });
  expect(report.components?.total).toBeGreaterThan(0);
  expect(report.components?.installed).toBeGreaterThan(0);
});
```

- [ ] **Step 4: Implement doctor component section**

Add to `DoctorReport`:

```typescript
components?: {
  total: number;
  installed: number;
  database: string;
};
```

Build it by opening `ComponentLedger`, counting catalog entries and installed ledger rows. If DB missing, report `installed: 0`.

- [ ] **Step 5: Run tests**

Run:

```bash
bun test src/cli/component.test.ts src/cli/doctor.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/cli/component.ts src/cli/component.test.ts src/cli/doctor.ts src/cli/doctor.test.ts
git commit -m "feat(component): report managed lifecycle state"
```

### Task 10: Compatibility Wrappers For Install And Uninstall

**Files:**
- Modify: `src/cli/install.ts`
- Modify: `src/cli/install.test.ts`
- Modify: `src/cli/uninstall.ts`
- Modify: `src/cli/uninstall.test.ts`

- [ ] **Step 1: Write failing install wrapper test**

Add to `src/cli/install.test.ts`:

```typescript
test("install dry-run delegates to component default profile when enabled", async () => {
  const calls: string[] = [];
  const original = console.log;
  console.log = (message?: unknown) => { calls.push(String(message ?? "")); };
  try {
    await run(["--dry-run"]);
  } finally {
    console.log = original;
  }
  expect(calls.join("\n")).toContain("profile.default");
});
```

During the transition this can first assert a compatibility note, then tighten to direct planner output once all surfaces are covered.

- [ ] **Step 2: Implement wrapper after all adapters pass**

In `src/cli/install.ts`, after parsing flags, replace procedural body with:

```typescript
const { planComponentOperation } = await import("../components/planner.ts");
const { executeComponentPlan } = await import("../components/executor.ts");
const profile = mcpDefaultMode === "all" ? "profile.verify-all" : "profile.default";
const plan = planComponentOperation({ operation: "install", target: profile });
await executeComponentPlan(plan, { dryRun: DRY_RUN });
if (withProject) {
  const { run: runInit } = await import("./init.ts");
  await runInit([withProject]);
}
```

Keep flags:

```text
--with-project
--dry-run
--no-skills
--no-upstream-skills
--no-default-mcps
--enable-all-mcps
```

Represent `--no-skills`, `--no-upstream-skills`, and `--no-default-mcps` as planner exclusions instead of ad hoc branches. Add planner option:

```typescript
exclude?: readonly string[];
```

Map:

```typescript
--no-skills            exclude ["skills.authored", "skills.upstream"]
--no-upstream-skills   exclude ["skills.upstream"]
--no-default-mcps      exclude ["mcp.context7"]
--enable-all-mcps      target "profile.verify-all"
```

- [ ] **Step 3: Write failing uninstall wrapper test**

Add to `src/cli/uninstall.test.ts`:

```typescript
test("uninstall dry-run delegates to component default profile removal", async () => {
  const calls: string[] = [];
  const original = console.log;
  console.log = (message?: unknown) => { calls.push(String(message ?? "")); };
  try {
    await run(["--dry-run"]);
  } finally {
    console.log = original;
  }
  expect(calls.join("\n")).toContain("profile.default");
});
```

- [ ] **Step 4: Implement uninstall wrapper**

In `src/cli/uninstall.ts`, after parsing flags:

```typescript
const { planComponentOperation } = await import("../components/planner.ts");
const { executeComponentPlan } = await import("../components/executor.ts");
const plan = planComponentOperation({ operation: "remove", target: "profile.default" });
await executeComponentPlan(plan, { dryRun: DRY_RUN, purge, keepState, includeCaveman });
```

Extend executor options:

```typescript
interface ExecuteOptions {
  dryRun?: boolean;
  purge?: boolean;
  keepState?: boolean;
  includeCaveman?: boolean;
}
```

Preserve current default: caveman remains installed unless `--include-caveman`.

- [ ] **Step 5: Run wrapper tests**

Run:

```bash
bun test src/cli/install.test.ts src/cli/uninstall.test.ts src/components/planner.test.ts src/components/executor.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/cli/install.ts src/cli/install.test.ts src/cli/uninstall.ts src/cli/uninstall.test.ts src/components/planner.ts src/components/executor.ts
git commit -m "refactor(component): route install through lifecycle engine"
```

### Task 11: Remove/Purge Modified-File Safety

**Files:**
- Modify: `src/components/ledger.ts`
- Modify: `src/components/executor.ts`
- Modify: `src/components/adapters/files.ts`
- Create: `src/components/remove-safety.test.ts`

- [ ] **Step 1: Write failing modified-file preservation test**

```typescript
// src/components/remove-safety.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPolicyAction } from "./adapters/files.ts";

let scratch = "";
let originalFulcrumHome: string | undefined;
let originalRepo: string | undefined;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-remove-safety-"));
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  originalRepo = process.env["FULCRUM_REPO_DIR"];
  process.env["FULCRUM_HOME"] = `${scratch}/.fulcrum`;
  process.env["FULCRUM_REPO_DIR"] = process.cwd();
});

afterEach(async () => {
  if (originalFulcrumHome === undefined) delete process.env["FULCRUM_HOME"]; else process.env["FULCRUM_HOME"] = originalFulcrumHome;
  if (originalRepo === undefined) delete process.env["FULCRUM_REPO_DIR"]; else process.env["FULCRUM_REPO_DIR"] = originalRepo;
  await rm(scratch, { recursive: true, force: true });
});

describe("component remove safety", () => {
  test("remove preserves modified policy unless purge is set", async () => {
    await applyPolicyAction("install", false);
    await Bun.write(`${scratch}/.fulcrum/tool-output-policy.toml`, "user modified\n");
    await applyPolicyAction("remove", false, false);
    expect(await readFile(`${scratch}/.fulcrum/tool-output-policy.toml`, "utf8")).toBe("user modified\n");
  });

  test("purge removes modified policy", async () => {
    await applyPolicyAction("install", false);
    await Bun.write(`${scratch}/.fulcrum/tool-output-policy.toml`, "user modified\n");
    await applyPolicyAction("remove", false, true);
    expect(await Bun.file(`${scratch}/.fulcrum/tool-output-policy.toml`).exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Implement preservation with existing policy compare**

Reuse current `removePolicy(purge)` behavior through `removeToolOutputPolicy(purge)`. Add ledger artifact hash recording later only if this test exposes missing coverage.

- [ ] **Step 3: Run safety test**

Run:

```bash
bun test src/components/remove-safety.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/remove-safety.test.ts src/components/ledger.ts src/components/executor.ts src/components/adapters/files.ts
git commit -m "test(component): preserve modified managed files"
```

### Task 12: Docs Update

**Files:**
- Modify: `docs/user-guide.md`
- Modify: `docs/developer-guide.md`
- Modify: `HANDOVER.md`

- [ ] **Step 1: Update user guide**

Replace the planned component lifecycle section with shipped CLI commands and examples:

```markdown
### Component lifecycle

Fulcrum manages agent OS components through `fulcrum component`.

Use `fulcrum install` for normal default setup. Use `fulcrum component` when you need one managed part:

```bash
fulcrum component list
fulcrum component info package.repomix
fulcrum component status package.repomix --json
fulcrum component install package.repomix --agent codex
fulcrum component remove package.repomix --agent codex --dry-run
fulcrum component disable mcp.github --all-agents
fulcrum component enable hooks.format --agent gemini
```

`remove` preserves modified user config by default. Use `--purge` only when you want Fulcrum-owned state and modified managed config removed.
```
```

- [ ] **Step 2: Update developer guide**

Replace planned component lifecycle CLI with architecture details:

```markdown
### Component lifecycle engine

`src/components/catalog.ts` declares every managed component and profile. `planner.ts` converts desired operations into action plans. `executor.ts` applies plans through adapters and records state in `~/.fulcrum/state/global/components.db`.

Adapters own surface-specific behavior:

- `adapters/hooks.ts` delegates to hook registration helpers.
- `adapters/mcp.ts` delegates to MCP registry and DeepWiki helpers.
- `adapters/sentinel.ts` manages rules sentinel blocks.
- `adapters/files.ts` manages policy files and remove-vs-purge behavior.
- `adapters/vendor.ts` delegates to skills, upstream skills, caveman, Repomix, Cloudflare, and Superpowers helpers.

Add new managed parts by adding a catalog entry, adapter support if the surface kind is new, planner tests, executor tests, and doctor status coverage.
```

- [ ] **Step 3: Update handover**

Point §7a to this plan and replace the one-line component item with:

```markdown
1. **Implement component lifecycle management.**
   Detailed plan: `docs/superpowers/plans/2026-04-29-component-lifecycle-management.md`.
   This is a Fulcrum feature, not a product rename: keep `fulcrum component ...` as the public surface and keep `fulcrum install` / `fulcrum uninstall` as default-profile wrappers. Build the catalog + planner + ledger + executor + adapters first, then migrate current procedural install/uninstall surfaces behind the engine.
```

- [ ] **Step 4: Run docs grep**

Run:

```bash
rg -n "fulcrum pkg|package manager brand" README.md HANDOVER.md docs/user-guide.md docs/developer-guide.md src
rg -n "component lifecycle" README.md HANDOVER.md docs/user-guide.md docs/developer-guide.md src
```

Expected: first command emits nothing; second command emits only references that point to `fulcrum component`.

- [ ] **Step 5: Commit**

```bash
git add docs/user-guide.md docs/developer-guide.md HANDOVER.md docs/superpowers/plans/2026-04-29-component-lifecycle-management.md
git commit -m "docs(component): plan lifecycle implementation"
```

### Task 13: Full Verification

**Files:**
- No edits.

- [ ] **Step 1: Run component-focused tests**

```bash
bun test \
  src/components/catalog.test.ts \
  src/components/planner.test.ts \
  src/components/ledger.test.ts \
  src/components/executor.test.ts \
  src/components/adapters/hooks.test.ts \
  src/components/adapters/mcp.test.ts \
  src/components/adapters/sentinel.test.ts \
  src/components/adapters/files.test.ts \
  src/components/adapters/vendor.test.ts \
  src/components/remove-safety.test.ts \
  src/cli/component.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run affected legacy tests**

```bash
bun test \
  src/cli/install.test.ts \
  src/cli/uninstall.test.ts \
  src/cli/hooks.test.ts \
  src/cli/mcp-registry.test.ts \
  src/cli/mcp-cmd.test.ts \
  src/cli/skills.test.ts \
  src/cli/upstream-skills.test.ts \
  src/cli/vendor-packages.test.ts \
  src/cli/repomix-package.test.ts \
  src/cli/doctor.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run full CI**

```bash
bun run ci
```

Expected:

```text
✓ install
✓ typecheck
✓ test
✓ build:all
✓ skills:lint
✓ compress:check
```

- [ ] **Step 4: Run dry-run smoke**

```bash
bun run src/index.ts component list --json
bun run src/index.ts component plan install profile.default --json
bun run src/index.ts component install hooks.format --agent codex --dry-run
bun run src/index.ts install --dry-run
bun run src/index.ts uninstall --dry-run
```

Expected:

```text
component list emits JSON
profile.default plan includes existing default surfaces
hook dry-run writes no files
install dry-run uses component plan
uninstall dry-run uses component plan
```

- [ ] **Step 5: Commit final verification fixes**

Only commit if verification required fixes:

```bash
git add <changed-files>
git commit -m "fix(component): satisfy lifecycle verification"
```

## Migration Notes

1. Do not move every install helper at once. First export reusable helpers from existing modules, then call them from adapters.
2. Keep current procedural behavior until a component adapter has passing tests.
3. The first component-backed real operations should be hooks and MCPs because they already have narrow enable/disable semantics.
4. Caveman and vendor packages are highest-risk because they call external CLIs and copy vendor trees. Move them after planner/ledger/executor behavior is proven.
5. `fulcrum install --dry-run` must stay useful throughout migration. If a surface is not migrated yet, the wrapper may call the legacy function for that surface until its adapter lands.
6. Do not use `~/.agents/` for Fulcrum-managed copies even though Codex now documents it as a user skill path. Fulcrum project rules still require per-agent paths to avoid cross-agent pollution.
7. Component state is Fulcrum-managed state, not a source of truth for vendor CLIs. Doctor should report drift when a vendor surface is absent but ledger says installed.
8. Keep `profile.default` behavior equal to current `fulcrum install` unless a flag explicitly changes it.

## Self-Review Checklist

- [ ] No `fulcrum pkg` command or alias exists.
- [ ] No rename away from Fulcrum.
- [ ] `fulcrum component` is the only new public command group.
- [ ] `fulcrum install` and `fulcrum uninstall` remain stable compatibility surfaces.
- [ ] Every production code task starts with a failing test.
- [ ] Removal preserves modified config unless `--purge`.
- [ ] Dry-run uses same planner as real execution.
- [ ] Doctor reports component lifecycle state.
- [ ] Full `bun run ci` passes.
