// Tests for fulcrum mcp CLI verbs (mcp-cmd.ts).
// Uses scratch HOME dirs; no real $HOME touched.

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./mcp-cmd.ts";
import { loadRegistry, registerServer, DEFAULT_GITHUB_SERVER, DEFAULT_REPOMIX_SERVER } from "./mcp-registry.ts";

let TMP: string;
let origHome: string | undefined;
let origFulcrumHome: string | undefined;

beforeEach(async () => {
  TMP = await mkdtemp(join(tmpdir(), "fulcrum-mcp-cmd-"));
  origHome = process.env["HOME"];
  origFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["HOME"] = TMP;
  process.env["FULCRUM_HOME"] = join(TMP, ".fulcrum");
});

afterEach(async () => {
  if (origHome !== undefined) process.env["HOME"] = origHome;
  else delete process.env["HOME"];
  if (origFulcrumHome !== undefined) process.env["FULCRUM_HOME"] = origFulcrumHome;
  else delete process.env["FULCRUM_HOME"];
  await rm(TMP, { recursive: true, force: true });
});

// Capture console output.
function captureConsole(): { logs: string[]; restore: () => void } {
  const logs: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
  return { logs, restore: () => { console.log = orig; } };
}

// ── list ─────────────────────────────────────────────────────────────────────

describe("fulcrum mcp list", () => {
  test("empty registry prints no-servers message", async () => {
    const { logs, restore } = captureConsole();
    try {
      await run(["list"]);
      expect(logs.some((l) => l.includes("No MCP servers"))).toBe(true);
    } finally {
      restore();
    }
  });

  test("--json returns valid JSON array", async () => {
    await registerServer("github", DEFAULT_GITHUB_SERVER);
    const { logs, restore } = captureConsole();
    try {
      await run(["list", "--json"]);
      const parsed = JSON.parse(logs.join("")) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      const entry = parsed[0] as Record<string, unknown>;
      expect(entry["name"]).toBe("github");
      expect(entry["transport"]).toBe("http");
    } finally {
      restore();
    }
  });

  test("human list shows registered servers", async () => {
    await registerServer("repomix", DEFAULT_REPOMIX_SERVER);
    const { logs, restore } = captureConsole();
    try {
      await run(["list"]);
      const combined = logs.join("\n");
      expect(combined).toContain("repomix");
      expect(combined).toContain("yamadashy");
    } finally {
      restore();
    }
  });
});

// ── register ─────────────────────────────────────────────────────────────────

describe("fulcrum mcp register", () => {
  test("registers http server via CLI", async () => {
    const { restore } = captureConsole();
    try {
      await run(["register", "myserver", "--http", "https://example.com/mcp", "--vendor", "example", "--description", "test server"]);
    } finally {
      restore();
    }
    const reg = await loadRegistry();
    expect(reg.servers["myserver"]).toBeDefined();
    expect(reg.servers["myserver"]!.url).toBe("https://example.com/mcp");
    expect(reg.servers["myserver"]!.transport).toBe("http");
  });

  test("registers stdio server via CLI", async () => {
    const { restore } = captureConsole();
    try {
      await run(["register", "myserver2", "--stdio", "npx my-pkg --mcp", "--vendor", "mypkg"]);
    } finally {
      restore();
    }
    const reg = await loadRegistry();
    const s = reg.servers["myserver2"]!;
    expect(s.transport).toBe("stdio");
    expect(s.command).toBe("npx my-pkg --mcp");
  });

  test("--auth-env flag captures env var names", async () => {
    const { restore } = captureConsole();
    try {
      await run(["register", "myserver3", "--http", "https://x.com/mcp", "--auth-env", "MY_TOKEN"]);
    } finally {
      restore();
    }
    const reg = await loadRegistry();
    expect(reg.servers["myserver3"]!.auth_env_vars).toContain("MY_TOKEN");
  });
});

// ── unregister ───────────────────────────────────────────────────────────────

describe("fulcrum mcp unregister", () => {
  test("removes server from registry", async () => {
    await registerServer("github", DEFAULT_GITHUB_SERVER);
    const { restore } = captureConsole();
    try {
      await run(["unregister", "github"]);
    } finally {
      restore();
    }
    const reg = await loadRegistry();
    expect(reg.servers["github"]).toBeUndefined();
  });
});

// ── enable / disable ─────────────────────────────────────────────────────────

describe("fulcrum mcp enable/disable", () => {
  test("enable sets flag in registry", async () => {
    await registerServer("github", DEFAULT_GITHUB_SERVER);
    const { restore } = captureConsole();
    try {
      await run(["enable", "github", "--agent", "codex"]);
    } finally {
      restore();
    }
    const reg = await loadRegistry();
    expect(reg.servers["github"]!.enabled["codex"]).toBe(true);
  });

  test("disable clears flag in registry", async () => {
    await registerServer("github", DEFAULT_GITHUB_SERVER);
    const { restore } = captureConsole();
    try {
      await run(["enable", "github", "--agent", "codex"]);
      await run(["disable", "github", "--agent", "codex"]);
    } finally {
      restore();
    }
    const reg = await loadRegistry();
    expect(reg.servers["github"]!.enabled["codex"]).toBe(false);
  });

  test("disable --agent removes only that agent's native config", async () => {
    await mkdir(join(TMP, ".codex"), { recursive: true });
    await mkdir(join(TMP, ".pi", "agent"), { recursive: true });
    await writeFile(join(TMP, ".pi", "agent", "settings.json"), JSON.stringify({ packages: ["npm:pi-mcp-adapter"] }));
    await registerServer("github", DEFAULT_GITHUB_SERVER);
    const { restore } = captureConsole();
    try {
      await run(["enable", "github", "--agent", "codex", "--agent", "pi"]);
      await run(["disable", "github", "--agent", "codex"]);
    } finally {
      restore();
    }

    const codex = await readFile(join(TMP, ".codex", "config.toml"), "utf8");
    const pi = JSON.parse(await readFile(join(TMP, ".pi", "agent", "mcp.json"), "utf8")) as {
      mcpServers?: Record<string, unknown>;
    };
    expect(codex).not.toContain("[mcp_servers.github]");
    expect(pi.mcpServers?.github).toBeDefined();
  });
});
