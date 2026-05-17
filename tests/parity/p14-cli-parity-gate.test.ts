/**
 * P14#13 — CLI Performance and Parity Gate.
 *
 * Verifies that each of the 15 P14 domains has coverage across:
 *   - Web:  SvelteKit route or page file exists
 *   - CLI:  domain command registered in GENERATED_DOMAIN_COMMANDS
 *   - TUI:  tRPC procedure reachable via createLocalCaller (in-process smoke)
 *
 * Acceptance criteria (from issue 13):
 *   - projects / tasks / docs / memory / runs / repos / artifacts / search /
 *     notify / audit / routing / skills / webhooks / connectors / flags
 *     — all 15 domains × 3 surfaces = 45 checks green.
 *   - hyperfine startup cold/warm p95 gates documented (CI-measured separately
 *     via scripts/ci/perf-gate.ts; this file wires the structural checks).
 *   - bun run type-check exits 0 with full consolidated router.
 */

import { describe, it, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

// ─── helpers ────────────────────────────────────────────────────────────────

const ROOT = join(import.meta.dir, "../..");

function webRouteExists(...segments: string[]): boolean {
  const base = join(ROOT, "apps/web/src/routes", ...segments);
  return (
    existsSync(join(base, "+page.svelte")) ||
    existsSync(join(base, "+page.server.ts")) ||
    existsSync(join(base, "+layout.svelte"))
  );
}

function cliDomainRegistered(domain: string): boolean {
  const { GENERATED_DOMAIN_COMMANDS } = require("../../apps/cli/src/generated-domains.ts");
  return (GENERATED_DOMAIN_COMMANDS as readonly string[]).includes(domain);
}

function tuiScreenExists(screen: string): boolean {
  return existsSync(join(ROOT, "apps/tui/src/screens", `${screen}.ts`));
}

// ─── 1. Web surface (15 domains) ────────────────────────────────────────────

describe("P14 Web surface — route files exist", () => {
  it("projects — /projects route", () => {
    expect(webRouteExists("projects")).toBe(true);
  });

  it("tasks — /tasks/[id] route", () => {
    const path = join(ROOT, "apps/web/src/routes/tasks/[id]/+page.svelte");
    expect(existsSync(path)).toBe(true);
  });

  it("docs — /docs route", () => {
    expect(webRouteExists("docs")).toBe(true);
  });

  it("memory — /memory route", () => {
    expect(webRouteExists("memory")).toBe(true);
  });

  it("runs — /runs route", () => {
    expect(webRouteExists("runs")).toBe(true);
  });

  it("repos — /repos route", () => {
    expect(webRouteExists("repos")).toBe(true);
  });

  it("artifacts — /artifacts route", () => {
    expect(webRouteExists("artifacts")).toBe(true);
  });

  it("search — /search route", () => {
    expect(webRouteExists("search")).toBe(true);
  });

  it("notify — /inbox route (notification inbox)", () => {
    expect(webRouteExists("inbox")).toBe(true);
  });

  it("audit — /audit route", () => {
    expect(webRouteExists("audit")).toBe(true);
  });

  it("routing — settings/routing route", () => {
    expect(webRouteExists("settings", "routing")).toBe(true);
  });

  it("skills — settings/skills route", () => {
    expect(webRouteExists("settings", "skills")).toBe(true);
  });

  it("webhooks — settings/integrations/webhooks route", () => {
    expect(webRouteExists("settings", "integrations", "webhooks")).toBe(true);
  });

  it("connectors — projects/[id]/settings/connectors route", () => {
    const path = join(ROOT, "apps/web/src/routes/projects/[id]/settings/connectors/+page.server.ts");
    expect(existsSync(path)).toBe(true);
  });

  it("flags — settings/flags route", () => {
    expect(webRouteExists("settings", "flags")).toBe(true);
  });
});

// ─── 2. CLI surface (15 domains) ────────────────────────────────────────────

describe("P14 CLI surface — domain commands registered in generated-domains", () => {
  it("projects registered", () => {
    expect(cliDomainRegistered("projects")).toBe(true);
  });

  it("tasks registered", () => {
    expect(cliDomainRegistered("tasks")).toBe(true);
  });

  it("docs registered", () => {
    expect(cliDomainRegistered("docs")).toBe(true);
  });

  it("memories registered (memory domain)", () => {
    // memory domain exposed as 'memories' in CLI registry
    expect(cliDomainRegistered("memories")).toBe(true);
  });

  it("runs registered", () => {
    expect(cliDomainRegistered("runs")).toBe(true);
  });

  it("repos registered", () => {
    expect(cliDomainRegistered("repos")).toBe(true);
  });

  it("artifacts registered", () => {
    expect(cliDomainRegistered("artifacts")).toBe(true);
  });

  it("search registered", () => {
    expect(cliDomainRegistered("search")).toBe(true);
  });

  it("notify registered", () => {
    expect(cliDomainRegistered("notify")).toBe(true);
  });

  it("audit registered", () => {
    expect(cliDomainRegistered("audit")).toBe(true);
  });

  it("routing registered", () => {
    expect(cliDomainRegistered("routing")).toBe(true);
  });

  it("fulcrum_skills registered (skills domain)", () => {
    // skills exposed as 'fulcrum_skills' in CLI registry
    expect(cliDomainRegistered("fulcrum_skills")).toBe(true);
  });

  it("webhooks registered", () => {
    expect(cliDomainRegistered("webhooks")).toBe(true);
  });

  it("connectors registered", () => {
    expect(cliDomainRegistered("connectors")).toBe(true);
  });

  it("flags registered", () => {
    expect(cliDomainRegistered("flags")).toBe(true);
  });
});

// ─── 3. TUI surface (15 domains) ────────────────────────────────────────────

describe("P14 TUI surface — screen modules exist", () => {
  it("projects — projects screen", () => {
    expect(tuiScreenExists("projects")).toBe(true);
  });

  it("tasks — task-list screen", () => {
    expect(tuiScreenExists("task-list")).toBe(true);
  });

  it("docs — docs-reader-editor screen", () => {
    expect(tuiScreenExists("docs-reader-editor")).toBe(true);
  });

  it("memory — memory-browser screen", () => {
    expect(tuiScreenExists("memory-browser")).toBe(true);
  });

  it("runs — runs screen", () => {
    expect(tuiScreenExists("runs")).toBe(true);
  });

  it("repos — repos screen", () => {
    expect(tuiScreenExists("repos")).toBe(true);
  });

  it("artifacts — artifacts screen", () => {
    expect(tuiScreenExists("artifacts")).toBe(true);
  });

  it("search — search screen", () => {
    expect(tuiScreenExists("search")).toBe(true);
  });

  it("notify — notifications screen", () => {
    expect(tuiScreenExists("notifications")).toBe(true);
  });

  it("audit — audit screen", () => {
    expect(tuiScreenExists("audit")).toBe(true);
  });

  it("routing — routing-rules screen", () => {
    expect(tuiScreenExists("routing-rules")).toBe(true);
  });

  it("skills — skills screen", () => {
    expect(tuiScreenExists("skills")).toBe(true);
  });

  it("webhooks — webhooks screen", () => {
    expect(tuiScreenExists("webhooks")).toBe(true);
  });

  it("connectors — connectors screen", () => {
    expect(tuiScreenExists("connectors")).toBe(true);
  });

  it("flags — flags screen", () => {
    expect(tuiScreenExists("flags")).toBe(true);
  });
});

// ─── 4. TUI tRPC in-process smoke (key procedures) ──────────────────────────

describe("P14 TUI tRPC — procedures reachable via createLocalCaller", () => {
  it("projects.list procedure exists on appRouter", async () => {
    const { createLocalCaller } = await import("@fulcrum/cli/local-caller.ts");
    const caller = await createLocalCaller();
    expect(typeof caller.projects.list).toBe("function");
  });

  it("tasks.list procedure exists on appRouter", async () => {
    const { createLocalCaller } = await import("@fulcrum/cli/local-caller.ts");
    const caller = await createLocalCaller();
    expect(typeof caller.tasks.list).toBe("function");
  });

  it("docs.list procedure exists on appRouter", async () => {
    const { createLocalCaller } = await import("@fulcrum/cli/local-caller.ts");
    const caller = await createLocalCaller();
    expect(typeof caller.docs.list).toBe("function");
  });

  it("memories.list procedure exists on appRouter", async () => {
    const { createLocalCaller } = await import("@fulcrum/cli/local-caller.ts");
    const caller = await createLocalCaller();
    expect(typeof caller.memories.list).toBe("function");
  });

  it("runs.list procedure exists on appRouter", async () => {
    const { createLocalCaller } = await import("@fulcrum/cli/local-caller.ts");
    const caller = await createLocalCaller();
    expect(typeof caller.agent_runs.list).toBe("function");
  });

  it("repos.list procedure exists on appRouter", async () => {
    const { createLocalCaller } = await import("@fulcrum/cli/local-caller.ts");
    const caller = await createLocalCaller();
    expect(typeof caller.repos.list).toBe("function");
  });

  it("artifacts.list procedure exists on appRouter", async () => {
    const { createLocalCaller } = await import("@fulcrum/cli/local-caller.ts");
    const caller = await createLocalCaller();
    expect(typeof caller.artifacts.list).toBe("function");
  });

  it("search.query procedure exists on appRouter", async () => {
    const { createLocalCaller } = await import("@fulcrum/cli/local-caller.ts");
    const caller = await createLocalCaller();
    expect(typeof caller.search.query).toBe("function");
  });

  it("notify.list procedure exists on appRouter", async () => {
    const { createLocalCaller } = await import("@fulcrum/cli/local-caller.ts");
    const caller = await createLocalCaller();
    expect(typeof caller.notify.list).toBe("function");
  });

  it("audit.query procedure exists on appRouter", async () => {
    const { createLocalCaller } = await import("@fulcrum/cli/local-caller.ts");
    const caller = await createLocalCaller();
    expect(typeof caller.audit.query).toBe("function");
  });

  it("routing.list procedure exists on appRouter", async () => {
    const { createLocalCaller } = await import("@fulcrum/cli/local-caller.ts");
    const caller = await createLocalCaller();
    expect(typeof caller.routing.list).toBe("function");
  });

  it("skills.list procedure exists on appRouter (via fulcrum_skills alias)", async () => {
    const { createLocalCaller } = await import("@fulcrum/cli/local-caller.ts");
    const caller = await createLocalCaller();
    // skills exposed both as 'skills' and 'fulcrum_skills'
    expect(typeof caller.fulcrum_skills.list).toBe("function");
  });

  it("webhooks.list procedure exists on appRouter", async () => {
    const { createLocalCaller } = await import("@fulcrum/cli/local-caller.ts");
    const caller = await createLocalCaller();
    expect(typeof caller.webhooks.list).toBe("function");
  });

  it("connectors.list procedure exists on appRouter", async () => {
    const { createLocalCaller } = await import("@fulcrum/cli/local-caller.ts");
    const caller = await createLocalCaller();
    expect(typeof caller.connectors.list).toBe("function");
  });

  it("flags.list procedure exists on appRouter", async () => {
    const { createLocalCaller } = await import("@fulcrum/cli/local-caller.ts");
    const caller = await createLocalCaller();
    expect(typeof caller.flags.list).toBe("function");
  });
});
