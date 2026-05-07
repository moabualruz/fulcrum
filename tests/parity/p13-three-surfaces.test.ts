/**
 * P13#17 — Three-Surfaces Parity Matrix for Pillar 13 (API + Webhooks).
 *
 * Verifies that each of the 12 P13 domains has coverage across:
 *   - Web:  SvelteKit route or page file exists
 *   - CLI:  `fulcrum <domain> <verb> --json` module registered
 *   - TUI:  tRPC procedure reachable via createLocalCaller (in-process smoke)
 *
 * Acceptance criteria (from issue 17):
 *   - tasks / docs / sprints / memories / runs / artifacts / repos /
 *     search / notify / audit / webhooks / connectors — all 12 domains.
 *   - bun run ci includes these parity tests; exits non-zero on any surface failure.
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

function cliModuleRegistered(domain: string): boolean {
  // generated-domains.ts is the authoritative CLI registry for P13 domains
  const { GENERATED_DOMAIN_COMMANDS } = require("../../apps/cli/src/generated-domains.ts");
  return (GENERATED_DOMAIN_COMMANDS as readonly string[]).includes(domain);
}

// ─── Web surface matrix ──────────────────────────────────────────────────────

describe("P13 Web surface — route files exist", () => {
  it("tasks — /tasks/[id] route (task detail page)", () => {
    // Tasks surface lives at /tasks/[id] — list view is embedded in boards/projects
    const path = join(ROOT, "apps/web/src/routes/tasks/[id]/+page.svelte");
    expect(existsSync(path)).toBe(true);
  });

  it("docs — /docs route", () => {
    expect(webRouteExists("docs")).toBe(true);
  });

  it("sprints — /boards route (sprint board lives under boards)", () => {
    expect(webRouteExists("boards")).toBe(true);
  });

  it("memories — /memory route", () => {
    expect(webRouteExists("memory")).toBe(true);
  });

  it("runs — /runs route", () => {
    expect(webRouteExists("runs")).toBe(true);
  });

  it("artifacts — /artifacts route", () => {
    expect(webRouteExists("artifacts")).toBe(true);
  });

  it("repos — /repos route", () => {
    expect(webRouteExists("repos")).toBe(true);
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

  it("webhooks — settings/integrations/webhooks route", () => {
    expect(webRouteExists("settings", "integrations", "webhooks")).toBe(true);
  });

  it("connectors — projects/[id]/settings/connectors route", () => {
    // Check via direct path since it's under a dynamic segment
    const path = join(ROOT, "apps/web/src/routes/projects/[id]/settings/connectors/+page.server.ts");
    expect(existsSync(path)).toBe(true);
  });
});

// ─── CLI surface matrix ──────────────────────────────────────────────────────

describe("P13 CLI surface — domain commands registered in generated-domains", () => {
  it("tasks registered", () => {
    expect(cliModuleRegistered("tasks")).toBe(true);
  });

  it("docs registered", () => {
    expect(cliModuleRegistered("docs")).toBe(true);
  });

  it("sprints registered", () => {
    expect(cliModuleRegistered("sprints")).toBe(true);
  });

  it("memories registered", () => {
    expect(cliModuleRegistered("memories")).toBe(true);
  });

  it("runs registered", () => {
    expect(cliModuleRegistered("runs")).toBe(true);
  });

  it("artifacts registered", () => {
    expect(cliModuleRegistered("artifacts")).toBe(true);
  });

  it("repos registered", () => {
    expect(cliModuleRegistered("repos")).toBe(true);
  });

  it("search registered", () => {
    expect(cliModuleRegistered("search")).toBe(true);
  });

  it("notify registered", () => {
    expect(cliModuleRegistered("notify")).toBe(true);
  });

  it("audit registered", () => {
    expect(cliModuleRegistered("audit")).toBe(true);
  });

  it("webhooks registered", () => {
    expect(cliModuleRegistered("webhooks")).toBe(true);
  });

  it("connectors registered", () => {
    expect(cliModuleRegistered("connectors")).toBe(true);
  });
});

// ─── CLI --json format smoke ─────────────────────────────────────────────────

describe("P13 CLI surface — --json format functions produce valid JSON", () => {
  it("connectors formatConnectorsList --json", async () => {
    const { formatConnectorsList } = await import("@fulcrum/cli/connectors.ts");
    const result = formatConnectorsList([], true);
    expect(() => JSON.parse(result)).not.toThrow();
    expect(JSON.parse(result)).toEqual([]);
  });

  it("sprints CLI module exports run function", async () => {
    const mod = await import("@fulcrum/cli/sprints.ts");
    expect(typeof mod.run).toBe("function");
  });

  it("notify CLI module exports run function", async () => {
    const mod = await import("@fulcrum/cli/notify.ts");
    expect(typeof mod.run).toBe("function");
  });
});

// ─── TUI surface matrix — screen files exist ─────────────────────────────────

describe("P13 TUI surface — screen modules exist", () => {
  const screensDir = join(ROOT, "apps/tui/src/screens");

  it("tasks — task-list screen", () => {
    expect(existsSync(join(screensDir, "task-list.ts"))).toBe(true);
  });

  it("docs — docs-reader-editor screen", () => {
    expect(existsSync(join(screensDir, "docs-reader-editor.ts"))).toBe(true);
  });

  it("sprints — sprints screen", () => {
    expect(existsSync(join(screensDir, "sprints.ts"))).toBe(true);
  });

  it("memories — memory-browser screen", () => {
    expect(existsSync(join(screensDir, "memory-browser.ts"))).toBe(true);
  });

  it("runs — runs screen", () => {
    expect(existsSync(join(screensDir, "runs.ts"))).toBe(true);
  });

  it("artifacts — artifacts screen", () => {
    expect(existsSync(join(screensDir, "artifacts.ts"))).toBe(true);
  });

  it("repos — repos screen", () => {
    expect(existsSync(join(screensDir, "repos.ts"))).toBe(true);
  });

  it("search — search screen", () => {
    expect(existsSync(join(screensDir, "search.ts"))).toBe(true);
  });

  it("notify — notifications screen", () => {
    expect(existsSync(join(screensDir, "notifications.ts"))).toBe(true);
  });

  it("audit — audit screen", () => {
    expect(existsSync(join(screensDir, "audit.ts"))).toBe(true);
  });

  it("webhooks — webhooks screen (P13 stub)", () => {
    expect(existsSync(join(screensDir, "webhooks.ts"))).toBe(true);
  });

  it("connectors — connectors screen (P13 stub)", () => {
    expect(existsSync(join(screensDir, "connectors.ts"))).toBe(true);
  });
});

// ─── TUI surface matrix — tRPC procedures reachable via createLocalCaller ────

describe("P13 TUI surface — tRPC procedures reachable in-process", () => {
  it("tasks.list procedure exists on appRouter", async () => {
    const { createLocalCaller } = await import("@fulcrum/cli/local-caller.ts");
    const caller = await createLocalCaller();
    expect(typeof caller.tasks.list).toBe("function");
  });

  it("sprints.list procedure exists on appRouter", async () => {
    const { createLocalCaller } = await import("@fulcrum/cli/local-caller.ts");
    const caller = await createLocalCaller();
    expect(typeof caller.sprints.list).toBe("function");
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

  it("artifacts.list procedure exists on appRouter", async () => {
    const { createLocalCaller } = await import("@fulcrum/cli/local-caller.ts");
    const caller = await createLocalCaller();
    expect(typeof caller.artifacts.list).toBe("function");
  });

  it("repos.list procedure exists on appRouter", async () => {
    const { createLocalCaller } = await import("@fulcrum/cli/local-caller.ts");
    const caller = await createLocalCaller();
    expect(typeof caller.repos.list).toBe("function");
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

  it("docs.list procedure exists on appRouter", async () => {
    const { createLocalCaller } = await import("@fulcrum/cli/local-caller.ts");
    const caller = await createLocalCaller();
    expect(typeof caller.docs.list).toBe("function");
  });
});
