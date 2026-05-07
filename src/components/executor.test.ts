import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ComponentLedger } from "./ledger.ts";
import { planComponentOperation } from "./planner.ts";
import { executeComponentPlan } from "./executor.ts";
import { loadRegistry } from "@fulcrum/cli/mcp-registry.ts";
import type { ComponentPlan } from "./types.ts";

let scratch = "";
let originalHome: string | undefined;
let originalFulcrumHome: string | undefined;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-component-executor-"));
  originalHome = process.env["HOME"];
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["HOME"] = scratch;
  process.env["FULCRUM_HOME"] = join(scratch, ".fulcrum");
});

afterEach(async () => {
  if (originalHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = originalHome;
  if (originalFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = originalFulcrumHome;
  await rm(scratch, { recursive: true, force: true });
});

describe("component executor", () => {
  test("dry-run prints actions and writes no hooks.json or ledger component state", async () => {
    await mkdir(join(scratch, ".codex"), { recursive: true });
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));

    try {
      await executeComponentPlan(
        planComponentOperation({ operation: "install", target: "hooks.format", agents: ["codex"] }),
        { dryRun: true },
      );
    } finally {
      console.log = originalLog;
    }

    expect(logs.join("\n")).toContain("DRY RUN");
    expect(logs.join("\n")).toContain("hooks.format:registration:codex:install");
    expect(await Bun.file(join(scratch, ".codex", "hooks.json")).exists()).toBe(false);

    const ledger = ComponentLedger.open();
    expect(ledger.componentStatus("hooks.format")).toBeNull();
    ledger.close();
  });

  test("dry-run vendor package plan writes no ledger state and prints action", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));

    try {
      await executeComponentPlan(
        planComponentOperation({ operation: "install", target: "package.superpowers", agents: ["codex"] }),
        { dryRun: true },
      );
    } finally {
      console.log = originalLog;
    }

    expect(logs.join("\n")).toContain("DRY RUN");
    expect(logs.join("\n")).toContain("package.superpowers:install:codex:install");

    const ledger = ComponentLedger.open();
    expect(ledger.componentStatus("package.superpowers")).toBeNull();
    ledger.close();
  });

  test("dry-run default profile applies each global vendor helper once", async () => {
    await mkdir(join(scratch, ".claude"), { recursive: true });
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));

    try {
      await executeComponentPlan(
        planComponentOperation({
          operation: "install",
          target: "profile.default",
          agents: ["claude-code", "codex", "gemini", "opencode", "pi"],
        }),
        { dryRun: true },
      );
    } finally {
      console.log = originalLog;
    }

    const cloudflareInstalls = logs.filter((line) =>
      line.includes("[dry-run] would run: claude plugin install cloudflare@cloudflare")
    );
    expect(logs.join("\n")).toContain("DRY RUN package.cloudflare:install:claude-code:install");
    expect(logs.join("\n")).toContain("DRY RUN package.cloudflare:install:pi:install");
    expect(cloudflareInstalls).toHaveLength(1);
  });

  test("remove plan can preserve caveman when compatibility wrapper excludes it", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));

    try {
      await executeComponentPlan(
        planComponentOperation({
          operation: "remove",
          target: "profile.default",
          agents: ["codex"],
        }),
        { dryRun: true, includeCaveman: false },
      );
    } finally {
      console.log = originalLog;
    }

    expect(logs.join("\n")).not.toContain("package.caveman");
    expect(logs.join("\n")).toContain("skills.authored");
  });

  test("executes hook plan from planner and records ledger state", async () => {
    await mkdir(join(scratch, ".codex"), { recursive: true });
    const plan = planComponentOperation({
      operation: "install",
      target: "hooks.format",
      agents: ["codex"],
    });

    await executeComponentPlan(plan);

    expect(await Bun.file(join(scratch, ".codex", "hooks.json")).exists()).toBe(true);
    const ledger = ComponentLedger.open();
    expect(ledger.componentStatus("hooks.format")).toMatchObject({
      id: "hooks.format",
      kind: "hook",
      status: "installed",
    });
    expect(ledger.surfacesForComponent("hooks.format")).toEqual([
      {
        id: "hooks.format:registration:codex",
        component_id: "hooks.format",
        agent_id: "codex",
        kind: "hook-registration",
        target: "hook:format",
      },
    ]);
    ledger.close();
  });

  test("executes MCP registry plan and records ledger state", async () => {
    const plan = planComponentOperation({
      operation: "install",
      target: "mcp.context7",
      agents: ["codex"],
    });

    await executeComponentPlan(plan);

    const reg = await loadRegistry();
    expect(reg.servers["context7"]).toBeDefined();

    const ledger = ComponentLedger.open();
    expect(ledger.componentStatus("mcp.context7")).toMatchObject({
      id: "mcp.context7",
      kind: "mcp",
      status: "installed",
    });
    ledger.close();
  });

  test("executes rules and policy plans through adapters", async () => {
    await mkdir(join(scratch, ".codex"), { recursive: true });

    await executeComponentPlan(
      planComponentOperation({ operation: "install", target: "rules.global", agents: ["codex"] }),
    );
    await executeComponentPlan(
      planComponentOperation({ operation: "install", target: "policy.tool-output", agents: ["codex"] }),
    );

    expect(await readText(join(scratch, ".codex", "AGENTS.md"))).toContain(
      "<!-- BEGIN FULCRUM RULES -->",
    );
    expect(await Bun.file(join(scratch, ".fulcrum", "tool-output-policy.toml")).exists()).toBe(true);
  });

  test("failed adapter action records error step without successful component or surface state", async () => {
    await mkdir(join(scratch, ".codex"), { recursive: true });
    const plan = planComponentOperation({
      operation: "install",
      target: "hooks.format",
      agents: ["codex"],
    });
    plan.actions[0]!.payload = { recipe: "missing-recipe" };

    await expect(executeComponentPlan(plan)).rejects.toThrow("unknown hook recipe: missing-recipe");

    expect(await Bun.file(join(scratch, ".codex", "hooks.json")).exists()).toBe(false);
    const ledger = ComponentLedger.open();
    expect(ledger.componentStatus("hooks.format")).toBeNull();
    expect(ledger.surfacesForComponent("hooks.format")).toEqual([]);
    ledger.close();

    const db = new Database(join(scratch, ".fulcrum", "state", "global", "components.db"), {
      readonly: true,
    });
    const steps = db
      .query<{ status: string; error: string | null }, []>(
        "SELECT status, error FROM operation_steps ORDER BY action_id",
      )
      .all();
    db.close();
    expect(steps).toEqual([
      {
        status: "error",
        error: "unknown hook recipe: missing-recipe",
      },
    ]);
  });

  test("unsupported kind throws clear message", async () => {
    const plan: ComponentPlan = {
      operation: "install",
      target: "fake.component",
      profile: null,
      agents: ["codex"],
      warnings: [],
      actions: [
        {
          id: "fake:codex:install",
          componentId: "fake.component",
          surfaceId: "fake:surface",
          agentId: "codex",
          operation: "install",
          kind: "json-patch",
          target: "fake",
          change: "create-or-update",
          risk: "managed",
          reason: "fake action",
        },
      ],
    };

    await expect(executeComponentPlan(plan)).rejects.toThrow(
      "unsupported component surface kind: json-patch",
    );
  });
});

async function readText(path: string): Promise<string> {
  return Bun.file(path).text();
}
