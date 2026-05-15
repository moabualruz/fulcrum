// I/O helpers shared across hook subcommands.

import type { HookEvent } from "./hook-types.ts";

/**
 * Truncate input to ~80 chars, removing newlines for one-liner output.
 */
function truncateInput(text: string, maxLen = 80): string {
  return text.replace(/\s+/g, " ").slice(0, maxLen);
}

/**
 * Read the full stdin as a HookEvent. If stdin is empty (e.g. invoked without
 * a hook envelope), returns {}.
 *
 * On parse failure, emits a one-liner to stderr unconditionally:
 *   fulcrum hook <name>: envelope parse failed (<reason>): <first-80-chars>
 *
 * If FULCRUM_DEBUG is set, also logs full envelope + stack trace.
 *
 * The hook name can be passed explicitly or retrieved from FULCRUM_HOOK_NAME env var.
 */
export async function readHookEvent(): Promise<HookEvent> {
  const hookName = process.env["FULCRUM_HOOK_NAME"] ?? "hook";
  const text = await Bun.stdin.text();
  if (process.env["FULCRUM_DEBUG"]) process.stderr.write(`[io] stdin=${JSON.stringify(text)}\n`);

  if (!text.trim()) {
    // Empty stdin is allowed (no-op); only log if explicitly in debug mode
    if (process.env["FULCRUM_DEBUG"]) process.stderr.write(`[io] empty stdin\n`);
    return {};
  }

  try {
    return JSON.parse(text) as HookEvent;
  } catch (e) {
    // Unconditional one-liner on parse failure
    const reason = "invalid JSON";
    const truncated = truncateInput(text);
    process.stderr.write(`fulcrum hook ${hookName}: envelope parse failed (${reason}): ${truncated}\n`);

    // Verbose debug log if requested
    if (process.env["FULCRUM_DEBUG"]) {
      process.stderr.write(`[io] parse err: ${(e as Error).message}\n`);
      process.stderr.write(`[io] full text: ${JSON.stringify(text)}\n`);
    }
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
 *
 * Pi adapter proxy shape: tool_name="mcp" with tool_input.server and tool_input.tool
 * are normalised to mcp__<server>__<tool> to match the canonical policy key format.
 */
export function deriveTool(event: HookEvent): string {
  const name = event.tool_name ?? "";

  // Pi adapter proxy shape: mcp(server, tool, ...) → mcp__<server>__<tool>
  if (name === "mcp") {
    const inp = event.tool_input ?? {};
    const server = inp["server"] ?? inp["serverName"] ?? "";
    const tool = inp["tool"] ?? inp["toolName"] ?? "";
    if (typeof server === "string" && typeof tool === "string" && server && tool) {
      return `mcp__${server}__${tool}`;
    }
    return name;
  }

  if (name !== "Bash") return name;
  const cmd = event.tool_input?.command ?? "";
  const tok = cmd
    .split(/\s+/)
    .find((t) => t && !t.startsWith("-")) ?? "";
  return tok.split("/").pop() ?? name;
}
