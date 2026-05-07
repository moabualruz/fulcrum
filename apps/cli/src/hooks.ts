// fulcrum hooks list / enable / disable.
//
// `enable <name>` applies the hook registration to *detected* agents' native
// config files by default, records the marker under
// ~/.fulcrum/hooks/enabled/<name>, and prints the per-agent registration
// snippet for reference.  Pass `--all` to write configs for all 5 supported
// agents regardless of whether their root dirs exist (useful for cross-machine
// setup or dotfiles repos).
//
// `disable <name>` removes the managed registration and marker state for
// detected agents (or all agents with `--all`).

import { mkdir, writeFile, unlink, readdir, readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { AGENTS } from "@/agents/registry.ts";
import type { AgentId } from "./mcp-registry.ts";

export type RecipeName = (typeof RECIPE_NAMES)[number];
type JsonAgentId = "claude-code" | "codex" | "gemini";
type TsAgentId = "opencode" | "pi";

interface NestedHookCommand {
  type: "command";
  command: string;
  timeout?: number;
}

interface NestedHookEntry {
  matcher?: string;
  hooks: NestedHookCommand[];
}

interface DirectHookEntry {
  type: "command";
  command: string;
}

interface JsonRecipeSpec {
  event: string;
  entry: NestedHookEntry | DirectHookEntry;
}

const RECIPE_NAMES = [
  "format",
  "lint-gate",
  "pm-policy",
  "test-on-edit",
  "audit-log",
  "index-check",
  "index-rebuild",
  "tool-output-router",
] as const;

const LABELS: Map<string, string> = new Map(AGENTS.map((agent) => [agent.id, agent.label]));

/** All 5 supported agent IDs — used when `--all` is passed. */
const ALL_AGENT_IDS: Set<AgentId> = new Set(AGENTS.map((a) => a.id as AgentId));

/**
 * Returns the set of agent IDs whose rootDir exists on disk.  Commands use
 * this to skip writing config files for agents that are not installed on the
 * current machine.  Pass `--all` to bypass this and target all agents.
 */
async function detectedAgents(home: string): Promise<Set<AgentId>> {
  const detected = new Set<AgentId>();
  for (const agent of AGENTS) {
    try {
      await stat(agent.rootDir(home));
      detected.add(agent.id as AgentId);
    } catch {
      // dir absent — agent not installed
    }
  }
  return detected;
}

const CLAUDE_RECIPES: Record<RecipeName, JsonRecipeSpec> = {
  "format": {
    event: "PostToolUse",
    entry: {
      matcher: "Write|Edit",
      hooks: [{ type: "command", command: "fulcrum hook format", timeout: 8000 }],
    },
  },
  "lint-gate": {
    event: "PostToolUse",
    entry: {
      matcher: "Write|Edit",
      hooks: [{ type: "command", command: "fulcrum hook lint-gate", timeout: 15000 }],
    },
  },
  "pm-policy": {
    event: "PreToolUse",
    entry: {
      matcher: "Bash",
      hooks: [{ type: "command", command: "fulcrum hook pm-policy", timeout: 3000 }],
    },
  },
  "test-on-edit": {
    event: "PostToolUse",
    entry: {
      matcher: "Write|Edit",
      hooks: [{ type: "command", command: "fulcrum hook test-on-edit", timeout: 5000 }],
    },
  },
  "audit-log": {
    event: "PostToolUse",
    entry: {
      matcher: "Bash",
      hooks: [{ type: "command", command: "fulcrum hook audit-log", timeout: 2000 }],
    },
  },
  "index-check": {
    event: "SessionStart",
    entry: {
      hooks: [{ type: "command", command: "fulcrum hook index-check", timeout: 5000 }],
    },
  },
  "index-rebuild": {
    event: "Stop",
    entry: {
      hooks: [{ type: "command", command: "fulcrum hook index-rebuild", timeout: 60000 }],
    },
  },
  "tool-output-router": {
    event: "PostToolUse",
    entry: {
      matcher: ".*",
      hooks: [{ type: "command", command: "fulcrum hook tool-output-router", timeout: 8000 }],
    },
  },
};

const CODEX_RECIPES: Record<RecipeName, JsonRecipeSpec> = {
  "format": {
    event: "PostToolUse",
    entry: { hooks: [{ type: "command", command: "fulcrum hook format" }] },
  },
  "lint-gate": {
    event: "PostToolUse",
    entry: { hooks: [{ type: "command", command: "fulcrum hook lint-gate" }] },
  },
  "pm-policy": {
    event: "PreToolUse",
    entry: { hooks: [{ type: "command", command: "fulcrum hook pm-policy" }] },
  },
  "test-on-edit": {
    event: "PostToolUse",
    entry: { hooks: [{ type: "command", command: "fulcrum hook test-on-edit" }] },
  },
  "audit-log": {
    event: "PostToolUse",
    entry: { hooks: [{ type: "command", command: "fulcrum hook audit-log" }] },
  },
  "index-check": {
    event: "SessionStart",
    entry: { hooks: [{ type: "command", command: "fulcrum hook index-check" }] },
  },
  "index-rebuild": {
    event: "Stop",
    entry: { hooks: [{ type: "command", command: "fulcrum hook index-rebuild" }] },
  },
  "tool-output-router": {
    event: "PostToolUse",
    entry: { hooks: [{ type: "command", command: "fulcrum hook tool-output-router" }] },
  },
};

const GEMINI_RECIPES: Record<RecipeName, JsonRecipeSpec> = {
  "format": {
    event: "AfterTool",
    entry: { type: "command", command: "fulcrum hook format" },
  },
  "lint-gate": {
    event: "AfterTool",
    entry: { type: "command", command: "fulcrum hook lint-gate" },
  },
  "pm-policy": {
    event: "BeforeTool",
    entry: { type: "command", command: "fulcrum hook pm-policy" },
  },
  "test-on-edit": {
    event: "AfterTool",
    entry: { type: "command", command: "fulcrum hook test-on-edit" },
  },
  "audit-log": {
    event: "AfterTool",
    entry: { type: "command", command: "fulcrum hook audit-log" },
  },
  "index-check": {
    event: "SessionStart",
    entry: { type: "command", command: "fulcrum hook index-check" },
  },
  "index-rebuild": {
    event: "SessionEnd",
    entry: { type: "command", command: "fulcrum hook index-rebuild" },
  },
  "tool-output-router": {
    event: "AfterTool",
    entry: { type: "command", command: "fulcrum hook tool-output-router" },
  },
};

function homeFulcrum(): string {
  return process.env["FULCRUM_HOME"] ?? `${process.env["HOME"]}/.fulcrum`;
}

function markerPath(name: RecipeName): string {
  return `${homeFulcrum()}/hooks/enabled/${name}`;
}

function snippetPath(name: string): string[] {
  // Look in repo first (when invoked from a clone), then in installed pool.
  const repo = process.env["FULCRUM_REPO_DIR"] ?? "";
  const home = homeFulcrum();
  const candidates: string[] = [];
  if (repo) candidates.push(`${repo}/hooks/recipes/${name}.snippet.md`);
  candidates.push(`${home}/hooks/snippets/${name}.snippet.md`);
  return candidates;
}

function jsonPath(agentId: JsonAgentId): string {
  const home = process.env["HOME"] ?? "";
  switch (agentId) {
    case "claude-code":
      return `${home}/.claude/settings.json`;
    case "codex":
      return `${home}/.codex/hooks.json`;
    case "gemini":
      return `${home}/.gemini/settings.json`;
  }
}

function tsPath(agentId: TsAgentId, recipe: RecipeName): string {
  const home = process.env["HOME"] ?? "";
  switch (agentId) {
    case "opencode":
      return `${home}/.config/opencode/plugins/fulcrum-${recipe}.ts`;
    case "pi":
      return `${home}/.pi/agent/extensions/fulcrum-${recipe}.ts`;
  }
}

function labelFor(agentId: string): string {
  return LABELS.get(agentId) ?? agentId;
}

export function isRecipeName(name: string): name is RecipeName {
  return (RECIPE_NAMES as readonly string[]).includes(name);
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readText(p: string): Promise<string> {
  if (!(await exists(p))) return "";
  return await readFile(p, "utf8");
}

async function writeTextIfChanged(path: string, data: string): Promise<boolean> {
  if (await exists(path)) {
    const current = await readFile(path, "utf8");
    if (current === data) return false;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
  return true;
}

async function removeIfExists(path: string): Promise<boolean> {
  if (!(await exists(path))) return false;
  await unlink(path);
  return true;
}

async function listEnabled(): Promise<Set<string>> {
  const dir = `${homeFulcrum()}/hooks/enabled`;
  try {
    const items = await readdir(dir);
    return new Set(items);
  } catch {
    return new Set();
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function commandFor(recipe: RecipeName): string {
  return `fulcrum hook ${recipe}`;
}

function nestedCommand(entry: unknown): string | null {
  if (!isPlainObject(entry)) return null;
  const hooks = entry["hooks"];
  if (!Array.isArray(hooks)) return null;
  for (const hook of hooks) {
    if (!isPlainObject(hook)) continue;
    const cmd = hook["command"];
    if (typeof cmd === "string" && cmd.startsWith("fulcrum hook ")) {
      return cmd;
    }
  }
  return null;
}

function directCommand(entry: unknown): string | null {
  if (!isPlainObject(entry)) return null;
  const type = entry["type"];
  const cmd = entry["command"];
  if (type === "command" && typeof cmd === "string" && cmd.startsWith("fulcrum hook ")) {
    return cmd;
  }
  return null;
}

async function readJsonRoot(file: string): Promise<Record<string, unknown> | null> {
  if (!(await exists(file))) return {};
  try {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeJsonIfChanged(file: string, root: Record<string, unknown>): Promise<boolean> {
  const next = JSON.stringify(root, null, 2) + "\n";
  return writeTextIfChanged(file, next);
}

async function updateNestedJsonHook(
  file: string,
  spec: JsonRecipeSpec,
  recipe: RecipeName,
  label: string,
  enabled: boolean,
): Promise<void> {
  const root = await readJsonRoot(file);
  if (!root) {
    console.log(`     ✗ ${label} config is not valid JSON; skipped: ${file}`);
    return;
  }

  const hooksValue = root["hooks"];
  let hooks: Record<string, unknown>;
  if (hooksValue === undefined) {
    hooks = {};
  } else if (isPlainObject(hooksValue)) {
    hooks = hooksValue;
  } else {
    console.log(`     ✗ ${label} hooks block is not an object; skipped: ${file}`);
    return;
  }

  const eventValue = hooks[spec.event];
  let entries: unknown[];
  if (eventValue === undefined) {
    entries = [];
  } else if (Array.isArray(eventValue)) {
    entries = eventValue;
  } else {
    console.log(`     ✗ ${label} ${spec.event} hooks are not an array; skipped: ${file}`);
    return;
  }

  const expected = commandFor(recipe);
  const filtered = entries.filter((entry) => nestedCommand(entry) !== expected);
  if (enabled) {
    filtered.push(spec.entry);
  }

  if (filtered.length > 0) {
    hooks[spec.event] = filtered;
  } else {
    delete hooks[spec.event];
  }

  if (Object.keys(hooks).length > 0) {
    root["hooks"] = hooks;
  } else {
    delete root["hooks"];
  }

  if (Object.keys(root).length === 0) {
    if (await removeIfExists(file)) {
      console.log(`     - ${label} hook config removed: ${file}`);
    } else {
      console.log(`     · ${label} hook config not present`);
    }
    return;
  }

  const changed = await writeJsonIfChanged(file, root);
  if (changed) {
    console.log(`     ${enabled ? "✓" : "-"} ${label} hook config updated: ${file}`);
  } else {
    console.log(`     · ${label} hook config already up to date: ${file}`);
  }
}

async function updateDirectJsonHook(
  file: string,
  spec: JsonRecipeSpec,
  recipe: RecipeName,
  label: string,
  enabled: boolean,
): Promise<void> {
  const root = await readJsonRoot(file);
  if (!root) {
    console.log(`     ✗ ${label} config is not valid JSON; skipped: ${file}`);
    return;
  }

  const hooksValue = root["hooks"];
  let hooks: Record<string, unknown>;
  if (hooksValue === undefined) {
    hooks = {};
  } else if (isPlainObject(hooksValue)) {
    hooks = hooksValue;
  } else {
    console.log(`     ✗ ${label} hooks block is not an object; skipped: ${file}`);
    return;
  }

  const eventValue = hooks[spec.event];
  let entries: unknown[];
  if (eventValue === undefined) {
    entries = [];
  } else if (Array.isArray(eventValue)) {
    entries = eventValue;
  } else {
    console.log(`     ✗ ${label} ${spec.event} hooks are not an array; skipped: ${file}`);
    return;
  }

  const expected = commandFor(recipe);
  const filtered = entries.filter((entry) => directCommand(entry) !== expected);
  if (enabled) {
    filtered.push(spec.entry);
  }

  if (filtered.length > 0) {
    hooks[spec.event] = filtered;
  } else {
    delete hooks[spec.event];
  }

  if (Object.keys(hooks).length > 0) {
    root["hooks"] = hooks;
  } else {
    delete root["hooks"];
  }

  if (Object.keys(root).length === 0) {
    if (await removeIfExists(file)) {
      console.log(`     - ${label} hook config removed: ${file}`);
    } else {
      console.log(`     · ${label} hook config not present`);
    }
    return;
  }

  const changed = await writeJsonIfChanged(file, root);
  if (changed) {
    console.log(`     ${enabled ? "✓" : "-"} ${label} hook config updated: ${file}`);
  } else {
    console.log(`     · ${label} hook config already up to date: ${file}`);
  }
}

function renderOpenCodeRecipe(recipe: RecipeName): string {
  switch (recipe) {
    case "format":
      return [
        `export const FulcrumPlugin = async ({ $ }) => ({`,
        `  "tool.execute.after": async ({ $, tool, input }) => {`,
        `    if (tool === "edit" || tool === "write") {`,
        `      await $({ env: { HOOK_INPUT: JSON.stringify({ tool_input: input }) } })\`fulcrum hook format\``,
        `    }`,
        `  },`,
        `})`,
        ``,
      ].join("\n");
    case "lint-gate":
      return [
        `export const FulcrumPlugin = async ({ $ }) => ({`,
        `  "tool.execute.after": async ({ $, tool, input }) => {`,
        `    if (tool !== "edit" && tool !== "write") return`,
        `    try {`,
        `      await $({ env: { HOOK_INPUT: JSON.stringify({ tool_input: input }) } })\`fulcrum hook lint-gate\``,
        `    } catch {`,
        `      throw new Error("lint-gate: violations - fix before continuing")`,
        `    }`,
        `  },`,
        `})`,
        ``,
      ].join("\n");
    case "pm-policy":
      return [
        `export const FulcrumPlugin = async ({ $ }) => ({`,
        `  "tool.execute.before": async ({ $, tool, input }) => {`,
        `    if (tool !== "bash") return`,
        `    try {`,
        `      await $({ env: { HOOK_INPUT: JSON.stringify({ tool_input: input }) } })\`fulcrum hook pm-policy\``,
        `    } catch (e) {`,
        `      return { deny: true, reason: String(e) }`,
        `    }`,
        `  },`,
        `})`,
        ``,
      ].join("\n");
    case "test-on-edit":
      return [
        `export const FulcrumPlugin = async ({ $ }) => ({`,
        `  "tool.execute.after": async ({ $, tool, input }) => {`,
        `    if (tool !== "edit" && tool !== "write") return`,
        `    await $({ env: { HOOK_INPUT: JSON.stringify({ tool_input: input }) } })\`fulcrum hook test-on-edit\``,
        `  },`,
        `})`,
        ``,
      ].join("\n");
    case "audit-log":
      return [
        `export const FulcrumPlugin = async ({ $ }) => ({`,
        `  "tool.execute.after": async ({ $, tool, input, output }) => {`,
        `    if (tool !== "bash") return`,
        `    await $({ env: { HOOK_INPUT: JSON.stringify({ tool_input: input, tool_response: output }) } })\`fulcrum hook audit-log\``,
        `  },`,
        `})`,
        ``,
      ].join("\n");
    case "index-check":
      return [
        `export const FulcrumPlugin = async ({ $ }) => ({`,
        `  "session.created": async () => { await $\`fulcrum hook index-check\` },`,
        `})`,
        ``,
      ].join("\n");
    case "index-rebuild":
      return [
        `export const FulcrumPlugin = async ({ $ }) => ({`,
        `  "session.idle": async () => { await $\`fulcrum hook index-rebuild\` },`,
        `})`,
        ``,
      ].join("\n");
    case "tool-output-router":
      return [
        `export const FulcrumPlugin = async ({ $ }) => ({`,
        `  "tool.execute.after": async ({ $, tool, input, output }) => {`,
        `    await $({ env: { HOOK_INPUT: JSON.stringify({ tool_name: tool, tool_input: input, tool_response: output }) } })\`fulcrum hook tool-output-router\``,
        `  },`,
        `})`,
        ``,
      ].join("\n");
  }
}

function renderPiRecipe(recipe: RecipeName): string {
  switch (recipe) {
    case "format":
      return [
        `import { execSync } from "child_process"`,
        `pi.on("tool_result", (e) => {`,
        `  if (e.tool_name !== "edit" && e.tool_name !== "write") return`,
        `  execSync("fulcrum hook format", { input: JSON.stringify(e) })`,
        `})`,
        ``,
      ].join("\n");
    case "lint-gate":
      return [
        `import { execSync } from "child_process"`,
        `pi.on("tool_result", (e) => {`,
        `  if (e.tool_name !== "edit" && e.tool_name !== "write") return`,
        `  try {`,
        `    execSync("fulcrum hook lint-gate", { input: JSON.stringify(e) })`,
        `  } catch {`,
        `    return { block: true, reason: "lint-gate: violations" }`,
        `  }`,
        `})`,
        ``,
      ].join("\n");
    case "pm-policy":
      return [
        `import { execSync } from "child_process"`,
        `pi.on("tool_call", (e) => {`,
        `  if (e.tool_name !== "bash") return`,
        `  try {`,
        `    execSync("fulcrum hook pm-policy", { input: JSON.stringify(e) })`,
        `  } catch (err: any) {`,
        `    return { block: true, reason: err.stderr?.toString() ?? "pm-policy" }`,
        `  }`,
        `})`,
        ``,
      ].join("\n");
    case "test-on-edit":
      return [
        `import { execSync } from "child_process"`,
        `pi.on("tool_result", (e) => {`,
        `  if (e.tool_name !== "edit" && e.tool_name !== "write") return`,
        `  execSync("fulcrum hook test-on-edit", { input: JSON.stringify(e) })`,
        `})`,
        ``,
      ].join("\n");
    case "audit-log":
      return [
        `import { execSync } from "child_process"`,
        `pi.on("tool_result", (e) => {`,
        `  if (e.tool_name !== "bash") return`,
        `  execSync("fulcrum hook audit-log", { input: JSON.stringify(e) })`,
        `})`,
        ``,
      ].join("\n");
    case "index-check":
      return [
        `import { execSync } from "child_process"`,
        `pi.on("session_start", () => execSync("fulcrum hook index-check"))`,
        ``,
      ].join("\n");
    case "index-rebuild":
      return [
        `import { execSync } from "child_process"`,
        `pi.on("session_shutdown", () => execSync("fulcrum hook index-rebuild"))`,
        ``,
      ].join("\n");
    case "tool-output-router":
      return [
        `import { execSync } from "child_process"`,
        `pi.on("tool_result", (e) => {`,
        `  execSync("fulcrum hook tool-output-router", { input: JSON.stringify(e) })`,
        `})`,
        ``,
      ].join("\n");
  }
}

async function enableJsonHook(agentId: JsonAgentId, recipe: RecipeName): Promise<void> {
  const label = labelFor(agentId);
  const file = jsonPath(agentId);
  const spec = agentId === "claude-code"
    ? CLAUDE_RECIPES[recipe]
    : agentId === "codex"
      ? CODEX_RECIPES[recipe]
      : GEMINI_RECIPES[recipe];

  if (agentId === "claude-code" || agentId === "codex") {
    await updateNestedJsonHook(file, spec, recipe, label, true);
  } else {
    await updateDirectJsonHook(file, spec, recipe, label, true);
  }
}

async function disableJsonHook(agentId: JsonAgentId, recipe: RecipeName): Promise<void> {
  const label = labelFor(agentId);
  const file = jsonPath(agentId);
  const spec = agentId === "claude-code"
    ? CLAUDE_RECIPES[recipe]
    : agentId === "codex"
      ? CODEX_RECIPES[recipe]
      : GEMINI_RECIPES[recipe];

  if (agentId === "claude-code" || agentId === "codex") {
    await updateNestedJsonHook(file, spec, recipe, label, false);
  } else {
    await updateDirectJsonHook(file, spec, recipe, label, false);
  }
}

async function enableTsHook(agentId: TsAgentId, recipe: RecipeName): Promise<void> {
  const label = labelFor(agentId);
  const file = tsPath(agentId, recipe);
  const body = agentId === "opencode" ? renderOpenCodeRecipe(recipe) : renderPiRecipe(recipe);
  const changed = await writeTextIfChanged(file, body);
  if (changed) {
    console.log(`     ✓ ${label} hook file updated: ${file}`);
  } else {
    console.log(`     · ${label} hook file already up to date: ${file}`);
  }
}

async function disableTsHook(agentId: TsAgentId, recipe: RecipeName): Promise<void> {
  const label = labelFor(agentId);
  const file = tsPath(agentId, recipe);
  if (await removeIfExists(file)) {
    console.log(`     - ${label} hook file removed: ${file}`);
  } else {
    console.log(`     · ${label} hook file not present: ${file}`);
  }
}

async function enableRecipe(name: RecipeName, targetAgents: Set<AgentId>): Promise<void> {
  for (const agentId of (["claude-code", "codex", "gemini"] as JsonAgentId[])) {
    if (targetAgents.has(agentId)) {
      await enableJsonHook(agentId, name);
    } else {
      console.log(`     · skip ${labelFor(agentId)} (not detected)`);
    }
  }
  for (const agentId of (["opencode", "pi"] as TsAgentId[])) {
    if (targetAgents.has(agentId)) {
      await enableTsHook(agentId, name);
    } else {
      console.log(`     · skip ${labelFor(agentId)} (not detected)`);
    }
  }
}

async function disableRecipe(name: RecipeName, targetAgents: Set<AgentId>): Promise<void> {
  for (const agentId of (["claude-code", "codex", "gemini"] as JsonAgentId[])) {
    if (targetAgents.has(agentId)) {
      await disableJsonHook(agentId, name);
    } else {
      console.log(`     · skip ${labelFor(agentId)} (not detected)`);
    }
  }
  for (const agentId of (["opencode", "pi"] as TsAgentId[])) {
    if (targetAgents.has(agentId)) {
      await disableTsHook(agentId, name);
    } else {
      console.log(`     · skip ${labelFor(agentId)} (not detected)`);
    }
  }
}

export async function removeAllHookRegistrations(opts: { dryRun?: boolean } = {}): Promise<void> {
  const home = process.env["HOME"] ?? "";
  const target = await detectedAgents(home);
  for (const name of RECIPE_NAMES) {
    if (opts.dryRun === true) {
      console.log(`     [dry-run] would disable hook recipe: ${name}`);
      continue;
    }
    await disableRecipe(name, target);
  }
}

async function writeMarker(name: RecipeName): Promise<void> {
  const markerDir = `${homeFulcrum()}/hooks/enabled`;
  await mkdir(markerDir, { recursive: true });
  await writeFile(markerPath(name), "");
}

async function removeMarker(name: RecipeName): Promise<void> {
  const marker = markerPath(name);
  if (await exists(marker)) {
    await unlink(marker);
  }
}

export async function enableHookRecipe(name: RecipeName, targetAgents: Set<AgentId>): Promise<void> {
  await enableRecipe(name, targetAgents);
  await writeMarker(name);
}

export async function disableHookRecipe(name: RecipeName, targetAgents: Set<AgentId>): Promise<void> {
  await disableRecipe(name, targetAgents);
  await removeMarker(name);
}

async function cmdList(args: string[] = []): Promise<void> {
  const enabled = await listEnabled();
  if (args.includes("--json")) {
    const recipes = RECIPE_NAMES.map((name) => ({
      name,
      enabled: enabled.has(name),
      marker: markerPath(name),
    }));
    console.log(JSON.stringify(recipes, null, 2));
    return;
  }

  console.log("Available hooks (subcommands of `fulcrum hook <name>`):");
  for (const name of RECIPE_NAMES) {
    const mark = enabled.has(name) ? "✓" : " ";
    console.log(`  ${mark} ${name}`);
  }
  console.log(`\n${enabled.size} of ${RECIPE_NAMES.length} marked enabled. Marker dir: ${homeFulcrum()}/hooks/enabled/`);
  console.log("`enable <name>` applies the per-agent registration and prints the snippet.");
}

async function cmdEnable(name: string | undefined, allAgents: boolean): Promise<void> {
  if (!name) {
    console.error("usage: fulcrum hooks enable <name> [--all]");
    process.exit(2);
  }
  if (!isRecipeName(name)) {
    console.error(`fulcrum hooks: unknown recipe '${name}'. List available with: fulcrum hooks list`);
    process.exit(2);
  }

  const home = process.env["HOME"] ?? "";
  const target = allAgents ? ALL_AGENT_IDS : await detectedAgents(home);
  await enableHookRecipe(name, target);
  console.log(`Marked enabled: ${markerPath(name)}`);

  // Print snippet (try repo, fall back to installed pool).
  let snippet = "";
  for (const p of snippetPath(name)) {
    if (await exists(p)) {
      snippet = await readText(p);
      break;
    }
  }
  if (!snippet) {
    console.log("(no registration snippet documented — see docs/hooks.md §6 for the cross-agent mapping)");
    return;
  }
  console.log("\n── Registration snippet (paste into each agent's config) ──");
  process.stdout.write(snippet);
}

async function cmdDisable(name: string | undefined, allAgents: boolean): Promise<void> {
  if (!name) {
    console.error("usage: fulcrum hooks disable <name> [--all]");
    process.exit(2);
  }
  if (!isRecipeName(name)) {
    console.error(`fulcrum hooks: unknown recipe '${name}'. List available with: fulcrum hooks list`);
    process.exit(2);
  }

  const home = process.env["HOME"] ?? "";
  const target = allAgents ? ALL_AGENT_IDS : await detectedAgents(home);
  await disableHookRecipe(name, target);
  console.log(`Marked disabled: ${markerPath(name)}`);
}

export async function run(args: string[]): Promise<void> {
  const sub = args[0] ?? "list";
  switch (sub) {
    case "list":
      return cmdList(args.slice(1));
    case "enable": {
      const allAgents = args.includes("--all");
      const name = args.find((a) => a !== "enable" && !a.startsWith("--"));
      return cmdEnable(name, allAgents);
    }
    case "disable": {
      const allAgents = args.includes("--all");
      const name = args.find((a) => a !== "disable" && !a.startsWith("--"));
      return cmdDisable(name, allAgents);
    }
    default:
      console.error(`fulcrum hooks: unknown subcommand '${sub}'`);
      process.exit(2);
  }
}
