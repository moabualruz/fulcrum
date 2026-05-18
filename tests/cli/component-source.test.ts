import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../../apps/cli/src/component.ts";
import { ComponentLedger } from "@platform-core/application/component-lifecycle/ledger.ts";

let scratch: string;
let previousHome: string | undefined;
let previousFulcrumHome: string | undefined;

async function captureRun(args: string[]): Promise<{ stdout: string; error?: Error }> {
  let stdout = "";
  const originalLog = console.log;
  console.log = (...parts: unknown[]) => {
    stdout += `${parts.map(String).join(" ")}\n`;
  };
  try {
    await run(args);
    return { stdout };
  } catch (error) {
    return { stdout, error: error as Error };
  } finally {
    console.log = originalLog;
  }
}

async function runMain(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn([
    process.execPath,
    "run",
    "apps/cli/src/main.ts",
    ...args,
  ], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      HOME: process.env["HOME"]!,
      FULCRUM_HOME: process.env["FULCRUM_HOME"]!,
    },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-component-source-"));
  previousHome = process.env["HOME"];
  previousFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["HOME"] = join(scratch, "home");
  process.env["FULCRUM_HOME"] = join(scratch, "fulcrum-home");
  await mkdir(process.env["HOME"]!, { recursive: true });
});

afterEach(async () => {
  if (previousHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = previousHome;
  if (previousFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = previousFulcrumHome;
  await rm(scratch, { recursive: true, force: true });
});

describe("component CLI source command", () => {
  it("prints help, lists components, and describes one component in text and JSON", async () => {
    expect((await captureRun([])).stdout).toContain("fulcrum component");

    const listJson = await captureRun(["list", "--json"]);
    const list = JSON.parse(listJson.stdout) as Array<{ id: string; defaultProfile: boolean }>;
    expect(list.some((row) => row.id === "rules.global" && row.defaultProfile)).toBe(true);

    const infoText = await captureRun(["info", "policy.tool-output"]);
    expect(infoText.stdout).toContain("id: policy.tool-output");
    expect(infoText.stdout).toContain("policy.tool-output:file");

    const infoJson = await captureRun(["info", "rules.global", "--json"]);
    expect(JSON.parse(infoJson.stdout).surfaces[0].kind).toBe("sentinel-block");
  });

  it("plans scoped and all-agent component operations with validation errors", async () => {
    const scoped = await captureRun(["plan", "install", "rules.global", "--agent", "codex", "--json"]);
    const scopedPlan = JSON.parse(scoped.stdout);
    expect(scopedPlan.agents).toEqual(["codex"]);
    expect(scopedPlan.actions).toHaveLength(1);
    expect(scopedPlan.actions[0].agentId).toBe("codex");

    const all = await captureRun(["plan", "disable", "policy.tool-output", "--all-agents", "--json"]);
    const allPlan = JSON.parse(all.stdout);
    expect(allPlan.warnings).toContain("policy.tool-output does not support disable");
    expect(allPlan.actions[0].change).toBe("noop");

    expect((await captureRun(["plan", "wat", "rules.global"])).error?.message).toContain("usage:");
    expect((await captureRun(["plan", "install", "rules.global", "--agent"])).error?.message).toContain("missing value");
    expect((await captureRun(["plan", "install", "rules.global", "--agent", "nope"])).error?.message).toContain("unknown agent");
  });

  it("applies component dry-run plans without mutating lifecycle status", async () => {
    const dryRun = await captureRun(["install", "rules.global", "--agent", "codex", "--dry-run", "--json"]);
    const plan = JSON.parse(dryRun.stdout.slice(0, dryRun.stdout.indexOf("\nDRY RUN")));

    expect(plan.target).toBe("rules.global");
    expect(plan.actions[0]).toMatchObject({
      componentId: "rules.global",
      agentId: "codex",
      change: "create-or-update",
      target: "agent-rules-files",
    });
    expect(dryRun.stdout).toContain("DRY RUN rules.global:sentinel:codex:install create-or-update sentinel-block agent-rules-files");

    const status = await captureRun(["status", "rules.global", "--json"]);
    expect(JSON.parse(status.stdout)).toMatchObject({
      componentId: "rules.global",
      status: "not-installed",
      ledgerExists: false,
    });
  });

  it("routes plural components alias through main for status JSON", async () => {
    const result = await runMain(["components", "status", "--json"]);
    const payload = JSON.parse(result.stdout) as Array<{ componentId: string; status: string }>;

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(payload.some((row) => row.componentId === "rules.global")).toBe(true);
  });

  it("reports ledger-backed status including missing native roots", async () => {
    const ledger = ComponentLedger.open();
    ledger.recordComponent({ id: "policy.tool-output", kind: "policy", status: "installed" });
    ledger.recordSurface({
      id: "policy.tool-output:file",
      componentId: "policy.tool-output",
      kind: "policy-seed",
      target: "~/.fulcrum/tool-output-policy.toml",
      ownerKey: "fulcrum:policy:tool-output",
      removePolicy: "keep-modified",
    });
    ledger.recordComponent({ id: "rules.global", kind: "rules", status: "installed" });
    ledger.recordSurface({
      id: "rules.global:codex",
      componentId: "rules.global",
      agentId: "codex",
      kind: "sentinel-block",
      target: "~/.codex/AGENTS.md",
      ownerKey: "FULCRUM RULES",
      removePolicy: "sentinel-only",
    });
    ledger.close();

    const missing = await captureRun(["status", "policy.tool-output", "--json"]);
    expect(JSON.parse(missing.stdout).status).toBe("missing-native-root");

    await mkdir(join(process.env["HOME"]!, ".codex"), { recursive: true });
    const filtered = await captureRun(["status", "rules.global", "--agent", "codex", "--json"]);
    const payload = JSON.parse(filtered.stdout);
    expect(payload.componentId).toBe("rules.global");
    expect(payload.surfaces).toHaveLength(1);
    expect(payload.surfaces[0].agentId).toBe("codex");

    const list = await captureRun(["status", "--json"]);
    expect(JSON.parse(list.stdout).some((row: { componentId: string; status: string }) =>
      row.componentId === "rules.global" && row.status === "installed"
    )).toBe(true);
  });

  it("validates command argument shape before applying plans", async () => {
    expect((await captureRun(["info"])).error?.message).toContain("usage:");
    expect((await captureRun(["info", "nope"])).error?.message).toContain("unknown component");
    expect((await captureRun(["list", "--wat"])).error?.message).toContain("unknown option");
    expect((await captureRun(["install"])).error?.message).toContain("usage:");
    expect((await captureRun(["enable", "rules.global", "--purge"])).error?.message).toContain("unknown option");
    expect((await captureRun(["status", "--agent", "bad"])).error?.message).toContain("unknown agent");
    expect((await captureRun(["wat"])).error?.message).toContain("unknown component command");
  });
});
