// Fulcrum Pi extension — wires every fulcrum hook into Pi's event API.
// Drop this file at ~/.pi/agent/extensions/fulcrum.ts (global) or
// .pi/extensions/fulcrum.ts (project), then reload Pi (or `/reload`).
//
// Requires the `fulcrum` binary on PATH (installed via scripts/install.sh).
//
// Pi has no MCP support — entries for `mcp__*` in the tool-output policy
// simply never fire. Otherwise, mirrors the OpenCode shim 1:1.

import { execSync } from "node:child_process";

const ENABLED = new Set<string>([
  "index-check",
  "index-rebuild",
  "format",
  "lint-gate",
  "pm-policy",
  "test-on-edit",
  "audit-log",
  "tool-output-router",
]);

declare const pi: {
  on: (event: string, handler: (e: any) => unknown) => void;
};

function runHook(name: string, event: unknown): void {
  if (!ENABLED.has(name)) return;
  execSync(`fulcrum hook ${name}`, { input: JSON.stringify(event) });
}

// SessionStart
pi.on("session_start", () => {
  if (ENABLED.has("index-check")) execSync("fulcrum hook index-check");
});

// Stop
pi.on("session_shutdown", () => {
  if (ENABLED.has("index-rebuild")) execSync("fulcrum hook index-rebuild");
});

// PreToolUse — return { block: true, reason } to deny
pi.on("tool_call", (e) => {
  if (e?.tool_name !== "bash") return;
  try {
    runHook("pm-policy", { tool_name: "Bash", tool_input: e.tool_input });
  } catch (err: any) {
    return { block: true, reason: err?.stderr?.toString() ?? "pm-policy" };
  }
  return undefined;
});

// PostToolUse — multiple recipes per event
pi.on("tool_result", (e) => {
  const tool = e?.tool_name ?? "";
  const env = { tool_name: tool, tool_input: e?.tool_input, tool_response: e?.tool_response };

  if (tool === "edit" || tool === "write") {
    runHook("format", env);
    try {
      runHook("lint-gate", env);
    } catch (err: any) {
      return { block: true, reason: err?.stderr?.toString() ?? "lint-gate" };
    }
    runHook("test-on-edit", env);
  }

  if (tool === "bash") {
    runHook("audit-log", env);
  }

  runHook("tool-output-router", env);
  return undefined;
});
