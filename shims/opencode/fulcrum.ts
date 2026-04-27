// Fulcrum OpenCode plugin — wires every fulcrum hook into OpenCode's plugin
// surface. Drop this file at ~/.config/opencode/plugins/fulcrum.ts (global)
// or .opencode/plugins/fulcrum.ts (project).
//
// Requires the `fulcrum` binary on PATH (installed via scripts/install.sh).
//
// Customize the `ENABLED` set below to opt in / out per recipe; OpenCode
// loads this file on session start, so changes take effect next session.

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

interface ShellTag {
  // OpenCode's shell template tag — passed in as $.
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  (opts: { env?: Record<string, string>; input?: string }): (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
}

interface PluginContext { $: ShellTag }

type ToolEvent = { tool: string; input: unknown; output?: unknown };

async function runHook($: ShellTag, name: string, event: object): Promise<void> {
  if (!ENABLED.has(name)) return;
  await $({ input: JSON.stringify(event) })`fulcrum hook ${name}`;
}

export const FulcrumPlugin = async ({ $ }: PluginContext) => ({
  // SessionStart equivalents
  "session.created": async () => {
    if (ENABLED.has("index-check")) await $`fulcrum hook index-check`;
  },

  // Stop / SessionEnd equivalents
  "session.idle": async () => {
    if (ENABLED.has("index-rebuild")) await $`fulcrum hook index-rebuild`;
  },

  // PreToolUse — refusing here returns { deny: true } to OpenCode.
  "tool.execute.before": async (e: ToolEvent) => {
    if (e.tool !== "bash") return;
    try {
      await runHook($, "pm-policy", { tool_name: "Bash", tool_input: e.input });
    } catch (err) {
      return { deny: true, reason: String(err) };
    }
    return undefined;
  },

  // PostToolUse — multiple recipes route off the same event.
  "tool.execute.after": async (e: ToolEvent) => {
    const env = { tool_name: e.tool, tool_input: e.input, tool_response: e.output };

    // Edits → format + lint-gate + test-on-edit
    if (e.tool === "edit" || e.tool === "write") {
      await runHook($, "format", env);
      try {
        await runHook($, "lint-gate", env);
      } catch (err) {
        throw new Error(`lint-gate: ${String(err)}`);
      }
      await runHook($, "test-on-edit", env);
    }

    // Bash → audit-log
    if (e.tool === "bash") {
      await runHook($, "audit-log", env);
    }

    // Universal → tool-output-router (last so other recipes see raw output)
    await runHook($, "tool-output-router", env);
  },
});
