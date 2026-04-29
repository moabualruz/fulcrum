// vendor-installs.ts — run vendor-canonical AGENT-INTEGRATION installers for
// each detected agent during `fulcrum init <dir>`.
//
// Scope: per-agent skill / plugin / extension / hook installs whose vendor
// publishes a CLI installer (`graphify install --platform <agent>`,
// `npx skills add <pkg>`, `pi-mcp-adapter init`). Project-INDEX builds
// (`graphify update .`, `repomix --compress`) live in `project-index.ts` —
// different concern.
//
// Rules:
//   - Never pass --output / path-override flags.
//   - Never spawn interactive auth flows (context7 is deferred).
//   - Never write hook registrations or skill files here — vendor CLIs do that.
//   - Live pattern-matchers (rg, fd, ast-grep, bat, jq, …) need NO install
//     command beyond the BYO toolchain; they are not handled here.
//   - Fail-soft per tool: log warning and continue on any error.

import { stat } from "node:fs/promises";
import { AGENTS } from "../agents/registry.ts";
import { which, run as runProc } from "../utils/proc.ts";
import { stripVendorRuleBlocks } from "./install.ts";

async function isDir(p: string): Promise<boolean> {
  try { return (await stat(p)).isDirectory(); } catch { return false; }
}

/** Run a vendor command, log warning on failure, never throw. */
async function vendorRun(
  label: string,
  cmd: string[],
  cwd: string,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) {
    console.log(`  [dry-run] would run: ${cmd.join(" ")}  (cwd=${cwd})`);
    return;
  }
  try {
    const r = await runProc(cmd, { cwd });
    if (r.exit !== 0) {
      console.warn(`  ⚠ ${label} failed (exit ${r.exit}): ${r.stderr.trim() || r.stdout.trim()}`);
    } else {
      console.log(`  ✓ ${label}`);
    }
  } catch (e) {
    console.warn(`  ⚠ ${label} error: ${String(e)}`);
  }
}

/** Detect which agent IDs are present on this machine. */
async function detectedAgentIds(home: string): Promise<Set<string>> {
  const detected = new Set<string>();
  for (const agent of AGENTS) {
    if (await isDir(agent.rootDir(home))) {
      detected.add(agent.id);
    }
  }
  return detected;
}

/**
 * Run vendor-canonical integrations for every detected agent.
 *
 * @param dir   Project directory (cwd for vendor commands).
 * @param home  User home directory (used for agent detection).
 * @param opts  { dryRun }
 */
export async function runVendorIntegrations(
  dir: string,
  home: string,
  opts: { dryRun: boolean },
): Promise<void> {
  const { dryRun } = opts;
  const detected = await detectedAgentIds(home);

  const hasGraphify = !!(await which("graphify"));
  const hasNpx = !!(await which("npx"));
  const hasClaude = !!(await which("claude"));
  const hasPi = !!(await which("pi"));

  console.log("\nVendor integrations:");

  // ── graphify ──────────────────────────────────────────────────────────────
  // Run per-agent. NEVER pass --output or any path override.
  if (hasGraphify) {
    if (detected.has("claude-code")) {
      await vendorRun("graphify: Claude Code", ["graphify", "claude", "install"], dir, dryRun);
    }
    if (detected.has("codex")) {
      await vendorRun("graphify: Codex CLI", ["graphify", "install", "--platform", "codex"], dir, dryRun);
    }
    if (detected.has("opencode")) {
      await vendorRun("graphify: OpenCode", ["graphify", "install", "--platform", "opencode"], dir, dryRun);
    }
    if (detected.has("gemini")) {
      await vendorRun("graphify: Gemini CLI", ["graphify", "install", "--platform", "gemini"], dir, dryRun);
    }
    if (detected.has("pi")) {
      // Pi is not supported by the graphify CLI; upstream vendor does not list it.
      // Upstream skill copy (via upstream-skills.ts) covers the fallback.
      console.log("  · graphify: Pi not supported by graphify CLI; skipping (file copy via upstream skills covers fallback)");
    }
    // NOTE: project-index BUILD (`graphify update .`) runs in project-index.ts,
    // not here. This module only handles per-agent integration installers.
  } else {
    console.log("  · graphify not on PATH — skipping graphify integrations");
  }

  // ── caveman ───────────────────────────────────────────────────────────────
  // Single canonical command; skills.sh auto-detects the agent from cwd/env.
  // The -a flag is NOT passed — vendor's auto-detect is the canonical path.
  if (hasNpx) {
    await vendorRun(
      "caveman: npx skills add JuliusBrussee/caveman",
      ["npx", "skills", "add", "JuliusBrussee/caveman"],
      dir,
      dryRun,
    );
  } else {
    console.log("  · npx not on PATH — skipping caveman skills add (install covers per-agent caveman)");
  }

  // ── ast-grep/agent-skill ──────────────────────────────────────────────────
  // Single canonical command; auto-detects agent.
  if (hasNpx) {
    await vendorRun(
      "ast-grep: npx skills add ast-grep/agent-skill",
      ["npx", "skills", "add", "ast-grep/agent-skill"],
      dir,
      dryRun,
    );
  }

  // ── tavily skills ─────────────────────────────────────────────────────────
  // Single canonical command covers all 7 tavily skills.
  if (hasNpx) {
    await vendorRun(
      "tavily: npx skills add https://github.com/tavily-ai/skills",
      ["npx", "skills", "add", "https://github.com/tavily-ai/skills"],
      dir,
      dryRun,
    );
  }

  // ── repomix ───────────────────────────────────────────────────────────────
  // Claude Code plugins handled by install.ts (W2 logic — 3 plugins via
  // `claude plugin install`). MCP registration via mcp-registry for all agents.
  // Project-index BUILD (`repomix --compress`) lives in project-index.ts.
  if (hasClaude && detected.has("claude-code")) {
    console.log("  · repomix: Claude Code plugins handled by fulcrum install (W2)");
  }

  // ── context7 ─────────────────────────────────────────────────────────────
  // OAuth setup is interactive; never spawn it here. Print deferred note.
  console.log("  · context7: OAuth setup is interactive; run manually: `npx ctx7 setup --claude` (or --cursor / --opencode)");

  // ── pi-mcp-adapter ────────────────────────────────────────────────────────
  // Runs `pi install npm:pi-mcp-adapter` (already in mcp.ts) then
  // `pi-mcp-adapter init` per upstream README to scan + import configs.
  if (detected.has("pi") && hasPi) {
    await vendorRun(
      "pi-mcp-adapter: pi install npm:pi-mcp-adapter",
      ["pi", "install", "npm:pi-mcp-adapter"],
      dir,
      dryRun,
    );
    await vendorRun(
      "pi-mcp-adapter: pi-mcp-adapter init",
      ["pi-mcp-adapter", "init"],
      dir,
      dryRun,
    );
  } else if (detected.has("pi") && !hasPi) {
    console.log("  · pi detected but pi binary not on PATH — skipping pi-mcp-adapter init");
  }

  // ── Strip duplicate vendor rule blocks ────────────────────────────────────
  // Vendor CLIs (e.g. `graphify install`) write rule text directly into each
  // agent's primary rules file. The same text lives in rules/AGENTS.md and is
  // spliced into the FULCRUM sentinel block by `fulcrum install`. Strip the
  // duplicates that live outside the sentinel so agents don't load the rule
  // twice. Runs AFTER vendor commands so hooks/settings written by the vendor
  // (PreToolUse, hooks.json) are preserved — only the rule TEXT block is removed.
  console.log("\nStripping duplicate vendor rule blocks (outside FULCRUM sentinel):");
  for (const agent of AGENTS) {
    const rulesFile = agent.rulesFile(home);
    await stripVendorRuleBlocks(rulesFile, dryRun);
  }
}
