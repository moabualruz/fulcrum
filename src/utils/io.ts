// I/O helpers shared across hook subcommands.

import type { HookEvent } from "../types.ts";

/**
 * Read the full stdin as a HookEvent. If stdin is empty (e.g. invoked without
 * a hook envelope), returns {}.
 */
export async function readHookEvent(): Promise<HookEvent> {
  const text = await Bun.stdin.text();
  if (process.env["FULCRUM_DEBUG"]) process.stderr.write(`[io] stdin=${JSON.stringify(text)}\n`);
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as HookEvent;
  } catch (e) {
    if (process.env["FULCRUM_DEBUG"]) process.stderr.write(`[io] parse err: ${(e as Error).message}\n`);
    return {};
  }
}

/**
 * Project slug from $CLAUDE_PROJECT_DIR or $PWD basename, suitable for state paths.
 */
export function projectSlug(): string {
  const dir = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
  const parts = dir.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] ?? "unknown";
}

/**
 * Ensure ~/.fulcrum/state/<project>/ exists and return the path.
 */
export async function stateDir(project = projectSlug()): Promise<string> {
  const home = process.env["HOME"] ?? "";
  const dir = `${home}/.fulcrum/state/${project}`;
  await Bun.$`mkdir -p ${dir}`.quiet();
  return dir;
}

/**
 * Extract the leaf tool name from an event. For Bash, derive from the first
 * non-flag token in tool_input.command; otherwise return tool_name unchanged.
 */
export function deriveTool(event: HookEvent): string {
  const name = event.tool_name ?? "";
  if (name !== "Bash") return name;
  const cmd = event.tool_input?.command ?? "";
  const tok = cmd
    .split(/\s+/)
    .find((t) => t && !t.startsWith("-")) ?? "";
  return tok.split("/").pop() ?? name;
}
