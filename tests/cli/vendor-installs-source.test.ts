import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  runAstGrepIntegration,
  runPiMcpAdapterIntegration,
  runTavilyIntegration,
  runVendorIntegrations,
} from "../../apps/cli/src/vendor-installs.ts";

const originalPath = process.env.PATH;
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;

async function fakeBin(dir: string, name: string, body = "exit 0"): Promise<void> {
  const file = join(dir, name);
  await writeFile(file, `#!/bin/sh\n${body}\n`);
  await chmod(file, 0o755);
}

async function withFakePath(names: readonly string[]): Promise<string> {
  const bin = await mkdtemp(join(tmpdir(), "fulcrum-vendor-bin-"));
  for (const name of names) await fakeBin(bin, name);
  process.env.PATH = `${bin}:${originalPath ?? ""}`;
  return bin;
}

async function captureLogs(fn: () => Promise<unknown>): Promise<{ logs: string[]; warnings: string[] }> {
  const logs: string[] = [];
  const warnings: string[] = [];
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  await fn();
  return { logs, warnings };
}

afterEach(() => {
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
});

describe("vendor integration installers", () => {
    const home = await mkdtemp(join(tmpdir(), "fulcrum-vendor-home-"));
    await mkdir(join(home, ".claude"), { recursive: true });
    await mkdir(join(home, ".codex"), { recursive: true });
    await mkdir(join(home, ".gemini"), { recursive: true });
    await mkdir(join(home, ".config/opencode"), { recursive: true });
    await mkdir(join(home, ".pi/agent"), { recursive: true });

    const result = await captureLogs(async () => {
    });

    expect(result.warnings).toEqual([]);
  });

    const bin = process.env.PATH!.split(":")[0]!;
    await mkdir(join(home, ".codex"), { recursive: true });

    const result = await captureLogs(async () => {
    });

    expect(result.logs).toEqual([]);
  });

  test("ast-grep and tavily use the real npx detection path and dry-run their canonical skill installers", async () => {
    await withFakePath(["npx"]);
    const dir = await mkdtemp(join(tmpdir(), "fulcrum-vendor-npx-"));

    const result = await captureLogs(async () => {
      expect(await runAstGrepIntegration(dir, true)).toBe(true);
      expect(await runTavilyIntegration(dir, true)).toBe(true);
    });

    const output = result.logs.join("\n");
    expect(output).toContain("npx skills add ast-grep/agent-skill");
    expect(output).toContain("npx skills add https://github.com/tavily-ai/skills");
    expect(result.warnings).toEqual([]);
  });

  test("pi adapter fail-softs failed install and dry-runs both required commands", async () => {
    const home = await mkdtemp(join(tmpdir(), "fulcrum-vendor-pi-home-"));
    await mkdir(join(home, ".pi/agent"), { recursive: true });

    await withFakePath(["pi", "pi-mcp-adapter"]);
    const bin = process.env.PATH!.split(":")[0]!;
    await fakeBin(bin, "pi", "echo pi install failed >&2\nexit 5");
    const failed = await captureLogs(async () => {
      expect(await runPiMcpAdapterIntegration(home, home, false)).toBe(false);
    });
    expect(failed.warnings.join("\n")).toContain("pi-mcp-adapter: pi install npm:pi-mcp-adapter failed (exit 5): pi install failed");

    await withFakePath(["pi", "pi-mcp-adapter"]);
    const dryRun = await captureLogs(async () => {
      expect(await runPiMcpAdapterIntegration(home, home, true)).toBe(true);
    });
    expect(dryRun.logs.join("\n")).toContain("pi install npm:pi-mcp-adapter");
    expect(dryRun.logs.join("\n")).toContain("pi-mcp-adapter init");
  });

  test("full vendor integration dry-run keeps deferred context7 and strip-rule steps visible", async () => {
    const home = await mkdtemp(join(tmpdir(), "fulcrum-vendor-full-home-"));
    await mkdir(join(home, ".codex"), { recursive: true });
    await mkdir(join(home, ".pi/agent"), { recursive: true });

    const result = await captureLogs(async () => {
      await runVendorIntegrations(home, home, { dryRun: true });
    });

    const output = result.logs.join("\n");
    expect(output).toContain("Vendor integrations:");
    expect(output).toContain("caveman handled by fulcrum install per-agent mirrors");
    expect(output).toContain("context7: OAuth setup is interactive");
    expect(output).toContain("Stripping duplicate vendor rule blocks");
  });
});
