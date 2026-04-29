import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installPiDeepwikiAdapter } from "./mcp.ts";

let TMP: string;
let originalHome: string | undefined;

beforeEach(async () => {
  TMP = await mkdtemp(join(tmpdir(), "fulcrum-mcp-"));
  originalHome = process.env["HOME"];
  process.env["HOME"] = TMP;
});

afterEach(async () => {
  if (originalHome !== undefined) process.env["HOME"] = originalHome;
  else delete process.env["HOME"];
  await rm(TMP, { recursive: true, force: true });
});

describe("Pi DeepWiki MCP adapter", () => {
  test("install updates existing DeepWiki entry to direct tools", async () => {
    const agentDir = join(TMP, ".pi", "agent");
    await mkdir(agentDir, { recursive: true });
    await writeFile(join(agentDir, "settings.json"), JSON.stringify({ packages: ["npm:pi-mcp-adapter"] }));
    await writeFile(join(agentDir, "mcp.json"), JSON.stringify({
      mcpServers: {
        deepwiki: { url: "https://mcp.deepwiki.com/mcp" },
      },
    }));

    await installPiDeepwikiAdapter();

    const piMcp = JSON.parse(await readFile(join(agentDir, "mcp.json"), "utf8"));
    expect(piMcp.mcpServers.deepwiki.url).toBe("https://mcp.deepwiki.com/mcp");
    expect(piMcp.mcpServers.deepwiki.directTools).toBe(true);
  });
});
