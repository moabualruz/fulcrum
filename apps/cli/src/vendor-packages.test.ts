import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  installCloudflarePackage,
  installSuperpowersPackage,
  uninstallCloudflarePackage,
  uninstallSuperpowersPackage,
} from "./vendor-packages.ts";
import * as proc from "@/utils/proc.ts";
import { isEnabled, loadRegistry } from "./mcp-registry.ts";

let TMP: string;
let originalHome: string | undefined;
let originalFulcrumHome: string | undefined;

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

beforeEach(async () => {
  TMP = await mkdtemp(join(tmpdir(), "fulcrum-vendor-packages-"));
  originalHome = process.env["HOME"];
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["HOME"] = TMP;
  process.env["FULCRUM_HOME"] = join(TMP, ".fulcrum");

  const skill = join(TMP, ".fulcrum", "cache", "superpowers", "skills", "brainstorming");
  await mkdir(skill, { recursive: true });
  await writeFile(join(skill, "SKILL.md"), "---\nname: brainstorming\ndescription: Brainstorm\n---\n\nUse structured brainstorming.\n");
  await writeFile(join(skill, "SKILL.original.md"), "---\nname: brainstorming\n---\nsource backup\n");
  await mkdir(join(TMP, ".fulcrum", "cache", "superpowers", "skills", "_archive", "old"), { recursive: true });
  await writeFile(join(TMP, ".fulcrum", "cache", "superpowers", "skills", "_archive", "old", "SKILL.md"), "---\nname: old\n---\n");
  await mkdir(join(TMP, ".fulcrum", "cache", "superpowers", "commands"), { recursive: true });
  await writeFile(join(TMP, ".fulcrum", "cache", "superpowers", "commands", "plan.md"), "Plan command\n");
  await mkdir(join(TMP, ".fulcrum", "cache", "superpowers", "agents"), { recursive: true });
  await writeFile(join(TMP, ".fulcrum", "cache", "superpowers", "agents", "reviewer.md"), "Review agent\n");
  await mkdir(join(TMP, ".fulcrum", "cache", "superpowers", "hooks"), { recursive: true });
  await writeFile(join(TMP, ".fulcrum", "cache", "superpowers", "hooks", "session-start.sh"), "#!/bin/sh\n");
  await mkdir(join(TMP, ".fulcrum", "cache", "superpowers", "scripts"), { recursive: true });
  await writeFile(join(TMP, ".fulcrum", "cache", "superpowers", "scripts", "tool.sh"), "#!/bin/sh\n");
  await mkdir(join(TMP, ".fulcrum", "cache", "superpowers", "assets"), { recursive: true });
  await writeFile(join(TMP, ".fulcrum", "cache", "superpowers", "assets", "logo.txt"), "logo\n");
  await writeFile(join(TMP, ".fulcrum", "cache", "superpowers", "NOTICE"), "notice\n");
  await writeFile(join(TMP, ".fulcrum", "cache", "superpowers", "README.backup.md"), "backup\n");
  await mkdir(join(TMP, ".fulcrum", "cache", "superpowers", "dist"), { recursive: true });
  await writeFile(join(TMP, ".fulcrum", "cache", "superpowers", "dist", "bundle.js"), "built\n");
});

afterEach(async () => {
  if (originalHome !== undefined) process.env["HOME"] = originalHome;
  else delete process.env["HOME"];
  if (originalFulcrumHome !== undefined) process.env["FULCRUM_HOME"] = originalFulcrumHome;
  else delete process.env["FULCRUM_HOME"];
  await rm(TMP, { recursive: true, force: true });
});

describe("vendor capability packages", () => {
  test("dry-run Cloudflare install previews Claude commands without claude on PATH", async () => {
    await mkdir(join(TMP, ".claude"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    try {
      await installCloudflarePackage({ dryRun: true });
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
      logSpy.mockRestore();
    }
    expect(runSpy.mock.calls).toHaveLength(0);
    expect(logs).toContain("     [dry-run] would run: claude plugin marketplace add cloudflare/skills");
    expect(logs).toContain("     [dry-run] would run: claude plugin install cloudflare@cloudflare");
  });

  test("dry-run Superpowers install previews Gemini and Pi commands without CLIs on PATH", async () => {
    await mkdir(join(TMP, ".gemini"), { recursive: true });
    await mkdir(join(TMP, ".pi", "agent"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    try {
      await installSuperpowersPackage({ dryRun: true });
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
      logSpy.mockRestore();
    }
    expect(runSpy.mock.calls).toHaveLength(0);
    expect(logs).toContain("     [dry-run] would run: gemini extensions install https://github.com/obra/superpowers --consent --skip-settings");
    expect(logs).toContain("     [dry-run] would run: pi install https://github.com/obra/superpowers");
    expect(logs).toContain("     [dry-run] would run: pi install npm:@tintinweb/pi-subagents");
    expect(logs).toContain("     [dry-run] would run: pi install npm:@uadgj/pi-superpowers-support");
  });

  test("dry-run vendor uninstall previews native commands without CLIs on PATH", async () => {
    await mkdir(join(TMP, ".claude"), { recursive: true });
    await mkdir(join(TMP, ".gemini", "extensions", "superpowers"), { recursive: true });
    await mkdir(join(TMP, ".pi", "agent"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    try {
      await uninstallCloudflarePackage({ dryRun: true });
      await uninstallSuperpowersPackage({ dryRun: true });
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
      logSpy.mockRestore();
    }
    expect(runSpy.mock.calls).toHaveLength(0);
    expect(logs).toContain("     [dry-run] would run: claude plugin uninstall cloudflare@cloudflare");
    expect(logs).toContain("     [dry-run] would run: claude plugin uninstall superpowers@claude-plugins-official");
    expect(logs).toContain("     [dry-run] would run: gemini extensions uninstall superpowers");
    expect(logs).toContain("     [dry-run] would run: pi remove https://github.com/obra/superpowers");
  });

  test("dry-run Superpowers mirror reports clone plan and unavailable writes when source cache is absent", async () => {
    await rm(join(TMP, ".fulcrum", "cache", "superpowers"), { recursive: true, force: true });
    await mkdir(join(TMP, ".codex"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    try {
      await installSuperpowersPackage({ dryRun: true });
    } finally {
      whichSpy.mockRestore();
      logSpy.mockRestore();
    }
    expect(logs).toContain(`     [dry-run] would clone/update https://github.com/obra/superpowers → ${join(TMP, ".fulcrum", "cache", "superpowers")}`);
    expect(logs).toContain(`     [dry-run] would mkdir: ${join(TMP, ".codex", "skills", "superpowers")}`);
    expect(logs).toContain("     [dry-run] Superpowers skills mirror plan unavailable until source cache exists");
  });

  test("uninstall preserves user-installed Cloudflare Claude plugin when Fulcrum marker is absent", async () => {
    await mkdir(join(TMP, ".claude"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue("/usr/local/bin/claude");
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    try {
      await uninstallCloudflarePackage();
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
      logSpy.mockRestore();
    }
    expect(runSpy.mock.calls).toHaveLength(0);
    expect(logs).toContain("     · skip Cloudflare Claude plugin uninstall (Fulcrum marker not present)");
  });

  test("uninstall preserves user-installed Superpowers native packages when Fulcrum markers are absent", async () => {
    await mkdir(join(TMP, ".claude"), { recursive: true });
    await mkdir(join(TMP, ".gemini", "extensions", "superpowers"), { recursive: true });
    await writeFile(join(TMP, ".gemini", "extensions", "superpowers", "extension.json"), "{}\n");
    await mkdir(join(TMP, ".config", "opencode"), { recursive: true });
    await writeFile(join(TMP, ".config", "opencode", "opencode.json"), JSON.stringify({
      plugin: ["superpowers@git+https://github.com/obra/superpowers.git"],
    }, null, 2) + "\n");
    await mkdir(join(TMP, ".pi", "agent"), { recursive: true });
    await writeFile(join(TMP, ".pi", "agent", "settings.json"), JSON.stringify({
      packages: ["https://github.com/obra/superpowers"],
    }, null, 2) + "\n");
    const whichSpy = spyOn(proc, "which").mockResolvedValue("/usr/local/bin/tool");
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    try {
      await uninstallSuperpowersPackage();
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
    expect(runSpy.mock.calls).toHaveLength(0);
    const opencode = JSON.parse(await readFile(join(TMP, ".config", "opencode", "opencode.json"), "utf8"));
    expect(opencode.plugin).toContain("superpowers@git+https://github.com/obra/superpowers.git");
    expect(await Bun.file(join(TMP, ".gemini", "extensions", "superpowers", "extension.json")).exists()).toBe(true);
  });

  test("uninstall preserves user-owned Superpowers mirrors when Fulcrum markers are absent", async () => {
    await mkdir(join(TMP, ".codex", "skills", "superpowers"), { recursive: true });
    await writeFile(join(TMP, ".codex", "skills", "superpowers", "README.md"), "user copy\n");
    await mkdir(join(TMP, ".pi", "agent", "skills", "superpowers"), { recursive: true });
    await writeFile(join(TMP, ".pi", "agent", "skills", "superpowers", "README.md"), "user copy\n");

    await uninstallSuperpowersPackage();

    expect(await readFile(join(TMP, ".codex", "skills", "superpowers", "README.md"), "utf8")).toContain("user copy");
    expect(await readFile(join(TMP, ".pi", "agent", "skills", "superpowers", "README.md"), "utf8")).toContain("user copy");
  });

  test("installs only the Cloudflare Claude plugin for the Cloudflare package", async () => {
    await mkdir(join(TMP, ".claude"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => cmd === "claude" ? "/usr/local/bin/claude" : null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    let calls: unknown[][] = [];
    try {
      await installCloudflarePackage();
      calls = runSpy.mock.calls.map((call) => call[0]);
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
    expect(calls).toEqual([
      ["claude", "plugin", "marketplace", "add", "cloudflare/skills"],
      ["claude", "plugin", "install", "cloudflare@cloudflare"],
    ]);
  });

  test("mirrors full Cloudflare package payload for non-Claude fallbacks", async () => {
    const cache = join(TMP, ".fulcrum", "cache", "cloudflare-skills");
    await mkdir(join(cache, "skills", "wrangler"), { recursive: true });
    await writeFile(join(cache, "skills", "wrangler", "SKILL.md"), "---\nname: wrangler\n---\nUse wrangler.\n");
    await mkdir(join(cache, "mcp"), { recursive: true });
    await writeFile(join(cache, "mcp", "servers.json"), "{}\n");
    await mkdir(join(cache, "scripts"), { recursive: true });
    await writeFile(join(cache, "scripts", "setup.sh"), "#!/bin/sh\n");
    await mkdir(join(cache, ".claude-plugin"), { recursive: true });
    await writeFile(join(cache, ".claude-plugin", "plugin.json"), "{\"name\":\"cloudflare\"}\n");
    await mkdir(join(cache, "vendor"), { recursive: true });
    await writeFile(join(cache, "vendor", "generated.txt"), "generated\n");
    await writeFile(join(cache, "NOTICE"), "notice\n");
    await writeFile(join(cache, "README.original.md"), "backup\n");
    await mkdir(join(cache, ".github"), { recursive: true });
    await writeFile(join(cache, ".github", "workflow.yml"), "source-only\n");
    await mkdir(join(TMP, ".codex"), { recursive: true });
    await mkdir(join(TMP, ".gemini"), { recursive: true });
    await mkdir(join(TMP, ".config", "opencode"), { recursive: true });
    await mkdir(join(TMP, ".pi", "agent"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    try {
      await installCloudflarePackage();
    } finally {
      whichSpy.mockRestore();
    }

    for (const mirror of [
      join(TMP, ".codex", "plugins", "cache", "cloudflare", "cloudflare", "1.0.0"),
      join(TMP, ".gemini", "extensions", "cloudflare"),
      join(TMP, ".config", "opencode", "packages", "cloudflare"),
      join(TMP, ".pi", "agent", "packages", "cloudflare"),
    ]) {
      expect(await readFile(join(mirror, "skills", "wrangler", "SKILL.md"), "utf8")).toContain("Use wrangler.");
      expect(await readFile(join(mirror, "mcp", "servers.json"), "utf8")).toContain("{}");
      expect(await readFile(join(mirror, "scripts", "setup.sh"), "utf8")).toContain("#!/bin/sh");
      expect(await readFile(join(mirror, ".claude-plugin", "plugin.json"), "utf8")).toContain("cloudflare");
      expect(await readFile(join(mirror, "vendor", "generated.txt"), "utf8")).toContain("generated");
      expect(await readFile(join(mirror, "NOTICE"), "utf8")).toContain("notice");
      expect(await Bun.file(join(mirror, "README.original.md")).exists()).toBe(false);
      expect(await Bun.file(join(mirror, ".github", "workflow.yml")).exists()).toBe(false);
      const metadata = JSON.parse(await readFile(join(mirror, "fulcrum-package-mirror.json"), "utf8"));
      expect(metadata.package).toBe("cloudflare");
      expect(metadata.mirroredSurfaces).toContain("mcp");
      expect(metadata.mirroredSurfaces).toContain("tools");
      expect(metadata.unknownAssets).toContain("NOTICE");
      expect(metadata.unknownAssets).toContain("vendor");
    }
  });

  test("adapts Cloudflare package MCP manifest as disabled native config for fallback agents", async () => {
    const cache = join(TMP, ".fulcrum", "cache", "cloudflare-skills");
    await mkdir(join(cache, "skills", "wrangler"), { recursive: true });
    await writeFile(join(cache, "skills", "wrangler", "SKILL.md"), "---\nname: wrangler\n---\nUse wrangler.\n");
    await writeFile(join(cache, ".mcp.json"), JSON.stringify({
      mcpServers: {
        "cloudflare-api": {
          type: "http",
          url: "https://mcp.cloudflare.com/mcp",
        },
        "cloudflare-docs": {
          type: "http",
          url: "https://docs.mcp.cloudflare.com/mcp",
        },
      },
    }, null, 2) + "\n");
    await mkdir(join(TMP, ".codex"), { recursive: true });
    await mkdir(join(TMP, ".gemini"), { recursive: true });
    await mkdir(join(TMP, ".config", "opencode"), { recursive: true });
    await mkdir(join(TMP, ".pi", "agent"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    try {
      await installCloudflarePackage();
    } finally {
      whichSpy.mockRestore();
    }

    const reg = await loadRegistry();
    expect(reg.servers["cloudflare-api"]?.url).toBe("https://mcp.cloudflare.com/mcp");
    for (const agentId of ["codex", "gemini", "opencode", "pi"] as const) {
      expect(isEnabled(reg.servers["cloudflare-api"]!, agentId)).toBe(false);
      expect(isEnabled(reg.servers["cloudflare-docs"]!, agentId)).toBe(false);
    }

    const codexConfig = await readFile(join(TMP, ".codex", "config.toml"), "utf8");
    expect(codexConfig).toContain("[mcp_servers.cloudflare-api]");
    expect(codexConfig).toContain("enabled = false");

    const geminiEnablement = JSON.parse(await readFile(join(TMP, ".gemini", "mcp-server-enablement.json"), "utf8")) as {
      "cloudflare-api"?: { enabled: boolean };
    };
    expect(geminiEnablement["cloudflare-api"]?.enabled).toBe(false);

    const opencode = JSON.parse(await readFile(join(TMP, ".config", "opencode", "opencode.json"), "utf8")) as {
      mcp?: Record<string, Record<string, unknown>>;
    };
    expect(opencode.mcp?.["cloudflare-api"]?.enabled).toBe(false);
    expect(await Bun.file(join(TMP, ".pi", "agent", "mcp.json")).exists()).toBe(false);
  });

  test("preserves package MCP auth env hints in disabled native config", async () => {
    const cache = join(TMP, ".fulcrum", "cache", "cloudflare-skills");
    await mkdir(cache, { recursive: true });
    await mkdir(join(cache, "skills"), { recursive: true });
    await writeFile(join(cache, ".mcp.json"), JSON.stringify({
      mcpServers: {
        "cloudflare-api": {
          type: "http",
          url: "https://mcp.cloudflare.com/mcp",
          headers: {
            Authorization: "Bearer ${CLOUDFLARE_API_TOKEN}",
          },
        },
      },
    }, null, 2) + "\n");
    await mkdir(join(TMP, ".codex"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    try {
      await installCloudflarePackage({ agents: ["codex"] });
    } finally {
      whichSpy.mockRestore();
    }

    const reg = await loadRegistry();
    expect(reg.servers["cloudflare-api"]?.auth_env_vars).toEqual(["CLOUDFLARE_API_TOKEN"]);
    const codexConfig = await readFile(join(TMP, ".codex", "config.toml"), "utf8");
    expect(codexConfig).toContain('bearer_token_env_var = "CLOUDFLARE_API_TOKEN"');
    expect(codexConfig).toContain("enabled = false");
  });

  test("merges package MCP visibility across agent-scoped installs", async () => {
    const cache = join(TMP, ".fulcrum", "cache", "cloudflare-skills");
    await mkdir(join(cache, "skills"), { recursive: true });
    await writeFile(join(cache, ".mcp.json"), JSON.stringify({
      mcpServers: {
        "cloudflare-api": {
          type: "http",
          url: "https://mcp.cloudflare.com/mcp",
        },
      },
    }, null, 2) + "\n");
    await mkdir(join(TMP, ".codex"), { recursive: true });
    await mkdir(join(TMP, ".gemini"), { recursive: true });
    await mkdir(join(TMP, ".config", "opencode"), { recursive: true });
    await mkdir(join(TMP, ".pi", "agent"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    try {
      await installCloudflarePackage({ agents: ["codex"] });
      await installCloudflarePackage({ agents: ["gemini"] });
      await installCloudflarePackage({ agents: ["opencode"] });
      await installCloudflarePackage({ agents: ["pi"] });
    } finally {
      whichSpy.mockRestore();
    }

    const reg = await loadRegistry();
    expect(reg.servers["cloudflare-api"]?.agent_visibility.codex).toBe(true);
    expect(reg.servers["cloudflare-api"]?.agent_visibility.gemini).toBe(true);
    expect(reg.servers["cloudflare-api"]?.agent_visibility.opencode).toBe(true);
    expect(reg.servers["cloudflare-api"]?.agent_visibility.pi).toBe(true);
  });

  test("agent-scoped Cloudflare uninstall preserves package MCP visibility for remaining agents", async () => {
    const cache = join(TMP, ".fulcrum", "cache", "cloudflare-skills");
    await mkdir(join(cache, "skills"), { recursive: true });
    await writeFile(join(cache, ".mcp.json"), JSON.stringify({
      mcpServers: {
        "cloudflare-api": {
          type: "http",
          url: "https://mcp.cloudflare.com/mcp",
        },
      },
    }, null, 2) + "\n");
    await mkdir(join(TMP, ".codex"), { recursive: true });
    await mkdir(join(TMP, ".gemini"), { recursive: true });
    await mkdir(join(TMP, ".config", "opencode"), { recursive: true });
    await mkdir(join(TMP, ".pi", "agent"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    try {
      await installCloudflarePackage();
      await uninstallCloudflarePackage({ agents: ["codex"] });
    } finally {
      whichSpy.mockRestore();
    }

    const reg = await loadRegistry();
    expect(reg.servers["cloudflare-api"]?.agent_visibility.codex).toBe(false);
    expect(reg.servers["cloudflare-api"]?.agent_visibility.gemini).toBe(true);
    expect(reg.servers["cloudflare-api"]?.agent_visibility.opencode).toBe(true);
    expect(reg.servers["cloudflare-api"]?.agent_visibility.pi).toBe(true);
    expect(await Bun.file(join(TMP, ".fulcrum", "state", "global", "cloudflare-mirrors.installed")).exists()).toBe(true);
    const codexConfig = await readFile(join(TMP, ".codex", "config.toml"), "utf8");
    expect(codexConfig).not.toContain("cloudflare-api");
  });

  test("adapts Cloudflare package skills into native loadable skill paths for fallback agents", async () => {
    const cache = join(TMP, ".fulcrum", "cache", "cloudflare-skills");
    await mkdir(join(cache, "skills", "wrangler"), { recursive: true });
    await writeFile(join(cache, "skills", "wrangler", "SKILL.md"), "---\nname: wrangler\n---\nUse wrangler.\n");
    await writeFile(join(cache, "skills", "wrangler", "SKILL.original.md"), "source backup\n");
    await mkdir(join(cache, "skills", "_archive", "old"), { recursive: true });
    await writeFile(join(cache, "skills", "_archive", "old", "SKILL.md"), "---\nname: old\n---\n");
    await mkdir(join(TMP, ".codex"), { recursive: true });
    await mkdir(join(TMP, ".gemini"), { recursive: true });
    await mkdir(join(TMP, ".config", "opencode"), { recursive: true });
    await mkdir(join(TMP, ".pi", "agent"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    try {
      await installCloudflarePackage();
    } finally {
      whichSpy.mockRestore();
    }

    for (const skillPath of [
      join(TMP, ".codex", "skills", "cloudflare", "wrangler", "SKILL.md"),
      join(TMP, ".gemini", "extensions", "cloudflare", "skills", "wrangler", "SKILL.md"),
      join(TMP, ".config", "opencode", "skills", "cloudflare", "wrangler", "SKILL.md"),
      join(TMP, ".pi", "agent", "skills", "cloudflare", "wrangler", "SKILL.md"),
    ]) {
      expect(await readFile(skillPath, "utf8")).toContain("Use wrangler.");
      expect(await Bun.file(skillPath.replace(/SKILL\.md$/, "SKILL.original.md")).exists()).toBe(false);
    }
    const geminiExtension = JSON.parse(await readFile(join(TMP, ".gemini", "extensions", "cloudflare", "gemini-extension.json"), "utf8"));
    expect(geminiExtension.name).toBe("cloudflare");
    expect(await Bun.file(join(TMP, ".codex", "skills", "cloudflare", "_archive", "old", "SKILL.md")).exists()).toBe(false);
  });

  test("does not overwrite top-level user-owned loadable skill names", async () => {
    const cache = join(TMP, ".fulcrum", "cache", "cloudflare-skills");
    await mkdir(join(cache, "skills", "wrangler"), { recursive: true });
    await writeFile(join(cache, "skills", "wrangler", "SKILL.md"), "---\nname: wrangler\n---\nUse wrangler.\n");
    await mkdir(join(TMP, ".codex"), { recursive: true });
    await mkdir(join(TMP, ".codex", "skills", "cloudflare", "wrangler"), { recursive: true });
    await writeFile(join(TMP, ".codex", "skills", "cloudflare", "wrangler", "SKILL.md"), "user-owned\n");
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    try {
      await installCloudflarePackage({ agents: ["codex"] });
    } finally {
      whichSpy.mockRestore();
    }

    expect(await readFile(join(TMP, ".codex", "skills", "cloudflare", "wrangler", "SKILL.md"), "utf8")).toBe("user-owned\n");
  });

  test("uninstall removes adapted Cloudflare package MCP and loadable skill surfaces", async () => {
    const cache = join(TMP, ".fulcrum", "cache", "cloudflare-skills");
    await mkdir(join(cache, "skills", "wrangler"), { recursive: true });
    await writeFile(join(cache, "skills", "wrangler", "SKILL.md"), "---\nname: wrangler\n---\nUse wrangler.\n");
    await writeFile(join(cache, ".mcp.json"), JSON.stringify({
      mcpServers: {
        "cloudflare-api": {
          type: "http",
          url: "https://mcp.cloudflare.com/mcp",
        },
        "cloudflare-docs": {
          type: "http",
          url: "https://docs.mcp.cloudflare.com/mcp",
        },
      },
    }, null, 2) + "\n");
    await mkdir(join(TMP, ".codex"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    try {
      await installCloudflarePackage();
      await uninstallCloudflarePackage();
    } finally {
      whichSpy.mockRestore();
    }

    const reg = await loadRegistry();
    expect(reg.servers["cloudflare-api"]).toBeUndefined();
    expect(reg.servers["cloudflare-docs"]?.default_enabled).toBe(false);
    expect(await Bun.file(join(TMP, ".codex", "skills", "cloudflare", "wrangler", "SKILL.md")).exists()).toBe(false);
    const codexConfig = await Bun.file(join(TMP, ".codex", "config.toml")).exists()
      ? await readFile(join(TMP, ".codex", "config.toml"), "utf8")
      : "";
    expect(codexConfig).not.toContain("cloudflare-api");
  });

  test("uninstalls only the Cloudflare Claude plugin for the Cloudflare package", async () => {
    await mkdir(join(TMP, ".claude"), { recursive: true });
    await mkdir(join(TMP, ".claude", "plugins", "cache", "cloudflare"), { recursive: true });
    await mkdir(join(TMP, ".claude", "plugins", "marketplaces", "cloudflare"), { recursive: true });
    await mkdir(join(TMP, ".fulcrum", "state", "global"), { recursive: true });
    await writeFile(join(TMP, ".fulcrum", "state", "global", "cloudflare-claude.installed"), "installed\n");
    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => cmd === "claude" ? "/usr/local/bin/claude" : null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    let calls: unknown[][] = [];
    try {
      await uninstallCloudflarePackage();
      calls = runSpy.mock.calls.map((call) => call[0]);
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
    expect(calls).toEqual([
      ["claude", "plugin", "uninstall", "cloudflare@cloudflare"],
    ]);
    expect(await Bun.file(join(TMP, ".claude", "plugins", "cache", "cloudflare")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".claude", "plugins", "marketplaces", "cloudflare")).exists()).toBe(false);
  });

  test("installs Superpowers package surfaces without Cloudflare", async () => {
    await mkdir(join(TMP, ".claude"), { recursive: true });
    await mkdir(join(TMP, ".codex"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => cmd === "claude" ? "/usr/local/bin/claude" : null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    let calls: unknown[][] = [];
    try {
      await installSuperpowersPackage();
      calls = runSpy.mock.calls.map((call) => call[0]);
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
    expect(calls).toContainEqual(["claude", "plugin", "install", "superpowers@claude-plugins-official"]);
    expect(calls).not.toContainEqual(["claude", "plugin", "install", "cloudflare@cloudflare"]);
    expect(await readFile(join(TMP, ".codex", "skills", "superpowers", "brainstorming", "SKILL.md"), "utf8"))
      .toContain("Use structured brainstorming.");
    expect(await Bun.file(join(TMP, ".codex", "skills", "superpowers", "brainstorming", "SKILL.original.md")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".codex", "skills", "superpowers", "_archive", "old", "SKILL.md")).exists()).toBe(false);
  });

  test("mirrors full Superpowers package payload for Codex fallback", async () => {
    await mkdir(join(TMP, ".codex"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    try {
      await installSuperpowersPackage();
    } finally {
      whichSpy.mockRestore();
    }

    const mirror = join(TMP, ".codex", "plugins", "cache", "superpowers", "superpowers", "1.0.0");
    expect(await readFile(join(mirror, "skills", "brainstorming", "SKILL.md"), "utf8")).toContain("Use structured brainstorming.");
    expect(await readFile(join(mirror, "commands", "plan.md"), "utf8")).toContain("Plan command");
    expect(await readFile(join(mirror, "agents", "reviewer.md"), "utf8")).toContain("Review agent");
    expect(await readFile(join(mirror, "hooks", "session-start.sh"), "utf8")).toContain("#!/bin/sh");
    expect(await readFile(join(mirror, "scripts", "tool.sh"), "utf8")).toContain("#!/bin/sh");
    expect(await readFile(join(mirror, "assets", "logo.txt"), "utf8")).toContain("logo");
    expect(await readFile(join(mirror, "NOTICE"), "utf8")).toContain("notice");
    expect(await readFile(join(mirror, "dist", "bundle.js"), "utf8")).toContain("built");
    expect(await Bun.file(join(mirror, "README.backup.md")).exists()).toBe(false);

    const metadata = JSON.parse(await readFile(join(mirror, "fulcrum-package-mirror.json"), "utf8"));
    expect(metadata.package).toBe("superpowers");
    expect(metadata.targetAgent).toBe("codex");
    expect(metadata.mirroredSurfaces).toContain("tools");
    expect(metadata.mirroredSurfaces).toContain("hooks");
    expect(metadata.unknownAssets).toContain("NOTICE");
    expect(metadata.unknownAssets).toContain("dist");
  });

  test("uninstalls Superpowers package surfaces without Cloudflare", async () => {
    await mkdir(join(TMP, ".claude"), { recursive: true });
    await mkdir(join(TMP, ".claude", "plugins", "cache", "claude-plugins-official", "superpowers"), { recursive: true });
    await mkdir(join(TMP, ".fulcrum", "state", "global"), { recursive: true });
    await writeFile(join(TMP, ".fulcrum", "state", "global", "superpowers-claude.installed"), "installed\n");
    await writeFile(join(TMP, ".fulcrum", "state", "global", "superpowers-codex-mirror.installed"), "installed\n");
    await mkdir(join(TMP, ".codex", "skills", "superpowers", "brainstorming"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => cmd === "claude" ? "/usr/local/bin/claude" : null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    let calls: unknown[][] = [];
    try {
      await uninstallSuperpowersPackage();
      calls = runSpy.mock.calls.map((call) => call[0]);
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
    expect(calls).toContainEqual(["claude", "plugin", "uninstall", "superpowers@claude-plugins-official"]);
    expect(calls).not.toContainEqual(["claude", "plugin", "uninstall", "cloudflare@cloudflare"]);
    expect(await Bun.file(join(TMP, ".codex", "skills", "superpowers")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".claude", "plugins", "cache", "claude-plugins-official", "superpowers")).exists()).toBe(false);
  });

  test("mirrors Superpowers full skills for Codex/Pi and registers OpenCode plugin", async () => {
    await mkdir(join(TMP, ".codex"), { recursive: true });
    await mkdir(join(TMP, ".pi", "agent"), { recursive: true });
    await mkdir(join(TMP, ".config", "opencode"), { recursive: true });

    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    try {
      await installSuperpowersPackage();
    } finally {
      whichSpy.mockRestore();
    }

    expect(await readFile(join(TMP, ".codex", "skills", "superpowers", "brainstorming", "SKILL.md"), "utf8"))
      .toContain("Use structured brainstorming.");
    expect(await readFile(join(TMP, ".pi", "agent", "skills", "superpowers", "brainstorming", "SKILL.md"), "utf8"))
      .toContain("Use structured brainstorming.");
    const opencode = JSON.parse(await readFile(join(TMP, ".config", "opencode", "opencode.json"), "utf8"));
    expect(opencode.plugin).toContain("superpowers@git+https://github.com/obra/superpowers.git");
  });

  test("mirrors full Superpowers package payload for Pi fallback when pi is unavailable", async () => {
    await mkdir(join(TMP, ".pi", "agent"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    try {
      await installSuperpowersPackage();
    } finally {
      whichSpy.mockRestore();
    }

    const mirror = join(TMP, ".pi", "agent", "packages", "superpowers");
    expect(await readFile(join(mirror, "skills", "brainstorming", "SKILL.md"), "utf8")).toContain("Use structured brainstorming.");
    expect(await readFile(join(mirror, "commands", "plan.md"), "utf8")).toContain("Plan command");
    expect(await readFile(join(mirror, "agents", "reviewer.md"), "utf8")).toContain("Review agent");
    expect(await readFile(join(mirror, "hooks", "session-start.sh"), "utf8")).toContain("#!/bin/sh");
    expect(await readFile(join(mirror, "scripts", "tool.sh"), "utf8")).toContain("#!/bin/sh");
    expect(await readFile(join(mirror, "dist", "bundle.js"), "utf8")).toContain("built");
    expect(await Bun.file(join(mirror, "README.backup.md")).exists()).toBe(false);

    const metadata = JSON.parse(await readFile(join(mirror, "fulcrum-package-mirror.json"), "utf8"));
    expect(metadata.package).toBe("superpowers");
    expect(metadata.targetAgent).toBe("pi");
    expect(metadata.unsupported.commands).toContain("not auto-loaded");
    expect(metadata.unsupported.tools).toContain("not auto-executed");
  });

  test("uninstalls mirrored Superpowers package surfaces", async () => {
    await mkdir(join(TMP, ".codex"), { recursive: true });
    await mkdir(join(TMP, ".pi", "agent"), { recursive: true });
    await mkdir(join(TMP, ".config", "opencode"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    try {
      await installSuperpowersPackage();

      await uninstallSuperpowersPackage();
    } finally {
      whichSpy.mockRestore();
    }

    expect(await Bun.file(join(TMP, ".codex", "skills", "superpowers")).exists()).toBe(false);
    expect(await pathExists(join(TMP, ".codex", "plugins", "cache", "superpowers"))).toBe(false);
    expect(await Bun.file(join(TMP, ".pi", "agent", "skills", "superpowers")).exists()).toBe(false);
    const opencode = JSON.parse(await readFile(join(TMP, ".config", "opencode", "opencode.json"), "utf8"));
    expect(opencode.plugin).toBeUndefined();
  });

  test("uninstalls mirrored Cloudflare Codex package cache root", async () => {
    const cache = join(TMP, ".fulcrum", "cache", "cloudflare-skills");
    await mkdir(join(cache, "skills", "wrangler"), { recursive: true });
    await writeFile(join(cache, "skills", "wrangler", "SKILL.md"), "---\nname: wrangler\n---\nUse wrangler.\n");
    await mkdir(join(TMP, ".codex"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    try {
      await installCloudflarePackage();
      await uninstallCloudflarePackage();
    } finally {
      whichSpy.mockRestore();
    }

    expect(await pathExists(join(TMP, ".codex", "plugins", "cache", "cloudflare"))).toBe(false);
  });

  test("uses Pi packages for Superpowers when pi is available", async () => {
    await mkdir(join(TMP, ".pi", "agent"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => cmd === "pi" ? "/usr/local/bin/pi" : null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    let calls: unknown[][] = [];
    try {
      await installSuperpowersPackage();
      calls = runSpy.mock.calls.map((call) => call[0]);
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
    expect(calls).toContainEqual(["pi", "install", "https://github.com/obra/superpowers"]);
    expect(calls).toContainEqual(["pi", "install", "npm:@tintinweb/pi-subagents"]);
    expect(calls).toContainEqual(["pi", "install", "npm:@uadgj/pi-superpowers-support"]);
    expect(await Bun.file(join(TMP, ".pi", "agent", "skills", "superpowers")).exists()).toBe(false);
  });

  test("does not reinstall existing Superpowers Gemini extension", async () => {
    await mkdir(join(TMP, ".gemini", "extensions", "superpowers"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue("/usr/local/bin/gemini");
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 1, stdout: "", stderr: "already installed" });
    try {
      await installSuperpowersPackage();
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
    expect(runSpy.mock.calls).not.toContainEqual([
      ["gemini", "extensions", "install", "https://github.com/obra/superpowers", "--consent", "--skip-settings"],
      { timeoutMs: 60_000 },
    ]);
  });
});
