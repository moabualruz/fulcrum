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

async function runDoctor(home: string, extraEnv: Record<string, string | undefined> = {}): Promise<Record<string, unknown>> {
  const baseEnv: Record<string, string | undefined> = { ...process.env, HOME: home };
  // Default-isolate the two caveman env knobs so tests are not influenced by
  // the developer's actual environment. Callers can override either.
  delete baseEnv["XDG_CONFIG_HOME"];
  delete baseEnv["CAVEMAN_DEFAULT_MODE"];
  for (const [k, v] of Object.entries(extraEnv)) {
    if (v === undefined) delete baseEnv[k];
    else baseEnv[k] = v;
  }
  const proc = Bun.spawn(["bun", "src/index.ts", "doctor", "--json"], {
    cwd: "/Users/mkh/workspace/fulcrum",
    stdout: "pipe",
    stderr: "pipe",
    env: baseEnv as Record<string, string>,
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

describe("doctor --json caveman section", () => {
  test("defaultMode='' source=default when no config + no env", async () => {
    const home = join(TMP, "caveman-default");
    await mkdir(home, { recursive: true });
    const report = await runDoctor(home);
    const cm = report["caveman"] as Record<string, unknown>;
    expect(cm["defaultMode"]).toBe("");
    expect(cm["defaultModeSource"]).toBe("default");
    expect(cm["configPath"]).toBe("");
  });

  test("reads defaultMode from ~/.config/caveman/config.json (source=file)", async () => {
    const home = join(TMP, "caveman-file");
    const cfgDir = `${home}/.config/caveman`;
    await mkdir(cfgDir, { recursive: true });
    await writeFile(`${cfgDir}/config.json`, JSON.stringify({ defaultMode: "ultra" }));
    const report = await runDoctor(home);
    const cm = report["caveman"] as Record<string, unknown>;
    expect(cm["defaultMode"]).toBe("ultra");
    expect(cm["defaultModeSource"]).toBe("file");
    expect(cm["configPath"]).toBe(`${cfgDir}/config.json`);
  });

  test("env CAVEMAN_DEFAULT_MODE overrides config (source=env)", async () => {
    const home = join(TMP, "caveman-env");
    const cfgDir = `${home}/.config/caveman`;
    await mkdir(cfgDir, { recursive: true });
    await writeFile(`${cfgDir}/config.json`, JSON.stringify({ defaultMode: "ultra" }));
    const report = await runDoctor(home, { CAVEMAN_DEFAULT_MODE: "lite" });
    const cm = report["caveman"] as Record<string, unknown>;
    expect(cm["defaultMode"]).toBe("lite");
    expect(cm["defaultModeSource"]).toBe("env");
  });

  test("malformed config JSON reported with source=malformed", async () => {
    const home = join(TMP, "caveman-malformed");
    const cfgDir = `${home}/.config/caveman`;
    await mkdir(cfgDir, { recursive: true });
    await writeFile(`${cfgDir}/config.json`, "{ not json");
    const report = await runDoctor(home);
    const cm = report["caveman"] as Record<string, unknown>;
    expect(cm["defaultModeSource"]).toBe("malformed");
  });

  test("XDG_CONFIG_HOME wins over $HOME/.config when set", async () => {
    const home = join(TMP, "caveman-xdg-home");
    const xdg = join(TMP, "caveman-xdg");
    await mkdir(`${xdg}/caveman`, { recursive: true });
    await mkdir(home, { recursive: true });
    await writeFile(`${xdg}/caveman/config.json`, JSON.stringify({ defaultMode: "wenyan-full" }));
    const report = await runDoctor(home, { XDG_CONFIG_HOME: xdg });
    const cm = report["caveman"] as Record<string, unknown>;
    expect(cm["defaultMode"]).toBe("wenyan-full");
    expect(cm["configPath"]).toBe(`${xdg}/caveman/config.json`);
  });

  test("per-agent installed flag reflects cavemanInstallDir presence", async () => {
    const home = join(TMP, "caveman-per-agent");
    await mkdir(`${home}/.codex/skills/caveman`, { recursive: true });
    await mkdir(`${home}/.gemini/extensions/caveman`, { recursive: true });
    const report = await runDoctor(home);
    const cm = report["caveman"] as Record<string, unknown>;
    const agents = cm["agents"] as Array<Record<string, unknown>>;
    const byLabel = new Map(agents.map((a) => [a["label"], a["installed"]]));
    expect(byLabel.get("Codex CLI")).toBe(true);
    expect(byLabel.get("Gemini CLI")).toBe(true);
    expect(byLabel.get("Claude Code")).toBe(false);
    expect(byLabel.get("OpenCode")).toBe(false);
    expect(byLabel.get("Pi CLI")).toBe(false);
  });
});
