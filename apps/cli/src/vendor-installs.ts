// vendor-installs.ts — run vendor-canonical AGENT-INTEGRATION installers for
// each detected agent during `fulcrum init <dir>`.
//
// Scope: per-agent skill / plugin / extension / hook installs whose vendor
// `npx skills add <pkg>`, `pi-mcp-adapter init`). Project-INDEX builds
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
import { AGENTS } from "@execution-orchestration/interface/agent-catalog.ts";
import type { AgentId } from "./mcp-registry.ts";
import { which, run as runProc } from "@platform-core/application/runtime-support/process-runner.ts";
import { getComponent } from "@platform-core/application/component-lifecycle/catalog.ts";
import { ComponentLedger } from "@platform-core/application/component-lifecycle/ledger.ts";
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
): Promise<boolean> {
  if (dryRun) {
    console.log(`  [dry-run] would run: ${cmd.join(" ")}  (cwd=${cwd})`);
    return true;
  }
  try {
    const r = await runProc(cmd, { cwd });
    if (r.exit !== 0) {
      console.warn(`  ⚠ ${label} failed (exit ${r.exit}): ${r.stderr.trim() || r.stdout.trim()}`);
      return false;
    } else {
      console.log(`  ✓ ${label}`);
      return true;
    }
  } catch (e) {
    console.warn(`  ⚠ ${label} error: ${String(e)}`);
    return false;
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

function recordVendorComponent(componentId: string, agentIds: readonly AgentId[] = []): void {
  const component = getComponent(componentId);
  if (component === null) return;
  const ledger = ComponentLedger.open();
  try {
    ledger.recordComponent({ id: component.id, kind: component.kind, status: "installed" });
    for (const surface of component.surfaces) {
      if (agentIds.length === 0) {
        ledger.recordSurface({
          id: surface.id,
          componentId: component.id,
          kind: surface.kind,
          target: surface.target,
          ownerKey: surface.ownerKey,
          desiredEnabled: true,
          removePolicy: surface.removePolicy,
        });
        continue;
      }
      for (const agentId of agentIds) {
        ledger.recordSurface({
          id: `${surface.id}:${agentId}`,
          componentId: component.id,
          agentId,
          kind: surface.kind,
          target: surface.target,
          ownerKey: surface.ownerKey,
          desiredEnabled: true,
          removePolicy: surface.removePolicy,
        });
      }
    }
  } finally {
    ledger.close();
  }
}

export async function runGraphifyIntegration(
  dir: string,
  home: string,
  dryRun: boolean,
): Promise<boolean> {
  const detected = await detectedAgentIds(home);
  const hasGraphify = !!(await which("graphify"));
  const installedAgents: AgentId[] = [];

  if (hasGraphify) {
    if (detected.has("claude-code")) {
      if (await vendorRun("graphify: Claude Code", ["graphify", "claude", "install"], dir, dryRun)) {
        installedAgents.push("claude-code");
      }
    }
    if (detected.has("codex")) {
      if (await vendorRun("graphify: Codex CLI", ["graphify", "install", "--platform", "codex"], dir, dryRun)) {
        installedAgents.push("codex");
      }
    }
    if (detected.has("opencode")) {
      if (await vendorRun("graphify: OpenCode", ["graphify", "install", "--platform", "opencode"], dir, dryRun)) {
        installedAgents.push("opencode");
      }
    }
    if (detected.has("gemini")) {
      if (await vendorRun("graphify: Gemini CLI", ["graphify", "install", "--platform", "gemini"], dir, dryRun)) {
        installedAgents.push("gemini");
      }
    }
    if (detected.has("pi")) {
      console.log("  · graphify: Pi not supported by graphify CLI; skipping (file copy via upstream skills covers fallback)");
    }
    if (!dryRun && installedAgents.length > 0) {
      recordVendorComponent("package.graphify", installedAgents);
    }
    return installedAgents.length > 0;
  }

  console.log("  · graphify not on PATH — skipping graphify integrations");
  return false;
}

export async function runAstGrepIntegration(dir: string, dryRun: boolean): Promise<boolean> {
  const hasNpx = !!(await which("npx"));
  if (!hasNpx) return false;
  const ok = await vendorRun(
    "ast-grep: npx skills add ast-grep/agent-skill",
    ["npx", "skills", "add", "ast-grep/agent-skill"],
    dir,
    dryRun,
  );
  if (ok && !dryRun) {
    recordVendorComponent("package.ast-grep");
  }
  return ok;
}

export async function runTavilyIntegration(dir: string, dryRun: boolean): Promise<boolean> {
  const hasNpx = !!(await which("npx"));
  if (!hasNpx) return false;
  const ok = await vendorRun(
    "tavily: npx skills add https://github.com/tavily-ai/skills",
    ["npx", "skills", "add", "https://github.com/tavily-ai/skills"],
    dir,
    dryRun,
  );
  if (ok && !dryRun) {
    recordVendorComponent("package.tavily");
  }
  return ok;
}

export async function runPiMcpAdapterIntegration(
  dir: string,
  home: string,
  dryRun: boolean,
): Promise<boolean> {
  const detected = await detectedAgentIds(home);
  const hasPi = !!(await which("pi"));
  if (detected.has("pi") && hasPi) {
    const installOk = await vendorRun(
      "pi-mcp-adapter: pi install npm:pi-mcp-adapter",
      ["pi", "install", "npm:pi-mcp-adapter"],
      dir,
      dryRun,
    );
    const initOk = await vendorRun(
      "pi-mcp-adapter: pi-mcp-adapter init",
      ["pi-mcp-adapter", "init"],
      dir,
      dryRun,
    );
    if (installOk && initOk && !dryRun) {
      recordVendorComponent("package.pi-mcp-adapter", ["pi"]);
    }
    return installOk && initOk;
  }
  if (detected.has("pi") && !hasPi) {
    console.log("  · pi detected but pi binary not on PATH — skipping pi-mcp-adapter init");
  }
  return false;
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

  console.log("\nVendor integrations:");

  // Run per-agent. NEVER pass --output or any path override.
  // not here. This module only handles per-agent integration installers.

  // Caveman is installed by `fulcrum install`, not `fulcrum init`: Codex,
  // OpenCode, and Pi need per-agent mirrors and Codex needs plugin surfaces.
  console.log("  · caveman handled by fulcrum install per-agent mirrors");

  // ── ast-grep/agent-skill ──────────────────────────────────────────────────
  // Single canonical command; auto-detects agent.
  await runAstGrepIntegration(dir, dryRun);

  // ── tavily skills ─────────────────────────────────────────────────────────
  // Single canonical command covers all 7 tavily skills.
  await runTavilyIntegration(dir, dryRun);

  // ── context7 ─────────────────────────────────────────────────────────────
  // OAuth setup is interactive; never spawn it here. Print deferred note.
  console.log("  · context7: OAuth setup is interactive; run manually: `npx ctx7 setup --claude` (or --cursor / --opencode)");

  // ── pi-mcp-adapter ────────────────────────────────────────────────────────
  // Runs `pi install npm:pi-mcp-adapter` (already in mcp.ts) then
  // `pi-mcp-adapter init` per upstream README to scan + import configs.
  await runPiMcpAdapterIntegration(dir, home, dryRun);

  // ── Strip duplicate vendor rule blocks ────────────────────────────────────
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
