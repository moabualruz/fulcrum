// Tests for fulcrum doctor --json Pi MCP adapter fields.

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let TMP: string;

beforeAll(async () => {
  TMP = await mkdtemp(join(tmpdir(), "fulcrum-doctor-test-"));
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

async function runDoctor(home: string): Promise<Record<string, unknown>> {
  const proc = Bun.spawn(["bun", "src/index.ts", "doctor", "--json"], {
    cwd: "/Users/mkh/workspace/fulcrum",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, HOME: home },
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return JSON.parse(out) as Record<string, unknown>;
}

describe("doctor --json piMcpAdapter field", () => {
  test("both false when ~/.pi/agent does not exist", async () => {
    const home = join(TMP, "no-pi");
    await mkdir(home, { recursive: true });
    const report = await runDoctor(home);
    const adapter = report["piMcpAdapter"] as Record<string, unknown>;
    expect(adapter).toBeDefined();
    expect(adapter["adapterPresent"]).toBe(false);
    expect(adapter["deepwikiPresent"]).toBe(false);
  });

  test("adapterPresent true when pi-mcp-adapter in packages", async () => {
    const home = join(TMP, "pi-adapter-present");
    await mkdir(`${home}/.pi/agent`, { recursive: true });
    await writeFile(
      `${home}/.pi/agent/settings.json`,
      JSON.stringify({ packages: ["npm:pi-mcp-adapter", "npm:context-mode"] }),
    );
    const report = await runDoctor(home);
    const adapter = report["piMcpAdapter"] as Record<string, unknown>;
    expect(adapter["adapterPresent"]).toBe(true);
    expect(adapter["deepwikiPresent"]).toBe(false);
  });

  test("deepwikiPresent true when deepwiki in mcp.json", async () => {
    const home = join(TMP, "pi-deepwiki-present");
    await mkdir(`${home}/.pi/agent`, { recursive: true });
    await writeFile(
      `${home}/.pi/agent/settings.json`,
      JSON.stringify({ packages: ["npm:pi-mcp-adapter"] }),
    );
    await writeFile(
      `${home}/.pi/agent/mcp.json`,
      JSON.stringify({ mcpServers: { deepwiki: { url: "https://mcp.deepwiki.com/mcp" } } }),
    );
    const report = await runDoctor(home);
    const adapter = report["piMcpAdapter"] as Record<string, unknown>;
    expect(adapter["adapterPresent"]).toBe(true);
    expect(adapter["deepwikiPresent"]).toBe(true);
  });

  test("both false when settings.json and mcp.json are empty objects", async () => {
    const home = join(TMP, "pi-empty-configs");
    await mkdir(`${home}/.pi/agent`, { recursive: true });
    await writeFile(`${home}/.pi/agent/settings.json`, JSON.stringify({}));
    await writeFile(`${home}/.pi/agent/mcp.json`, JSON.stringify({}));
    const report = await runDoctor(home);
    const adapter = report["piMcpAdapter"] as Record<string, unknown>;
    expect(adapter["adapterPresent"]).toBe(false);
    expect(adapter["deepwikiPresent"]).toBe(false);
  });

  test("report includes verdict field", async () => {
    const home = join(TMP, "pi-verdict");
    await mkdir(home, { recursive: true });
    const report = await runDoctor(home);
    expect(["ok", "warning", "error"]).toContain(report["verdict"] as string);
  });
});
