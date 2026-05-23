import { describe, expect, test } from "bun:test";

import {
  CHAT_PANE_FOOTER_MODE,
  ChatPaneScreen,
  createInlineAiAssistPane,
  defaultAiAssistScope,
  renderTaskAiAssistStartScreen,
  type ChatPaneCaller,
} from "./ai-assist-session.ts";
import { Renderer } from "../renderer.ts";
import { FakeTTY } from "../testing/fake-tty.ts";

describe("AI Assist task session screen", () => {
  test("renders TUI start verb and assembled task context", () => {
    const output = renderTaskAiAssistStartScreen({
      task: { id: "task-3", title: "Wire task drawer", description: "Start from task row" },
      agent: "codex",
      route: "review",
      workspacePath: "/workspace/fulcrum",
    });

    expect(output).toContain("AI Assist");
    expect(output).toContain("Task: Wire task drawer");
    expect(output).toContain("Route: review");
    expect(output).toContain("Session: ai-task-3-review");
    expect(output).toContain(":ai start <task-id>");
  });
});

/** A recording `ChatPaneCaller` so tests assert the dispatched calls. */
function recordingCaller(reply?: Partial<Awaited<ReturnType<ChatPaneCaller["sendMessage"]>>>): ChatPaneCaller & {
  calls: string[];
} {
  const calls: string[] = [];
  const caller: ChatPaneCaller = {
    async sendMessage({ message, agent }) {
      calls.push(`send:${agent}:${message}`);
      return {
        time: "14:02",
        lines: reply?.lines ?? [`echo ${message}`],
        toolCalls: reply?.toolCalls,
        permission: reply?.permission,
      };
    },
    async resolvePermission({ promptId, decision }) {
      calls.push(`permission:${promptId}:${decision}`);
    },
    async saveThread({ threadName }) {
      calls.push(`save:${threadName}`);
    },
  };
  return Object.assign(caller, { calls });
}

function screen(caller: ChatPaneCaller = recordingCaller()): ChatPaneScreen {
  return createInlineAiAssistPane({
    caller,
    threadName: "auth-rewrite",
    agent: "claude-opus-4-7",
    scope: { project: "auth/rewrite", step: "Step 3 / 8 · Persist issuance row", traceId: "tr_8f29a4c" },
  });
}

function render(s: ChatPaneScreen, columns: number, rows: number): string {
  const tty = new FakeTTY({ columns, rows });
  s.render(new Renderer(tty));
  return tty.plainText();
}

describe("ChatPane :ai inline AI Assist pane", () => {
  test("createInlineAiAssistPane builds a ChatPaneScreen", () => {
    expect(screen()).toBeInstanceOf(ChatPaneScreen);
  });

  test("renders thread, composer, agent, and scope per CLI-TUI-UX.md §10.2", () => {
    const out = render(screen(), 120, 32);
    expect(out).toContain(":ai · inline AI pane (TUI-native)");
    expect(out).toContain("agent: claude-opus-4-7");
    expect(out).toContain("thread · auth-rewrite");
    expect(out).toContain("scope: auth/rewrite · Step 3 / 8 · Persist issuance row · trace:tr_8f29a4c");
    expect(out).toContain("composer");
    expect(out).toContain("›");
  });

  test("composer hint matches CLI-TUI-UX.md §10.2 verbatim", () => {
    const out = render(screen(), 120, 32);
    expect(out).toContain("@scope mention · /cmd slash · ⌘↵ run · ⌘s save thread");
  });

  test("footer mode label is :AI while the pane is focused", () => {
    expect(CHAT_PANE_FOOTER_MODE).toBe(":AI");
  });

  test("Enter submits the composer draft and streams the agent reply", async () => {
    const caller = recordingCaller();
    const s = screen(caller);
    "rotate sessions".split("").forEach((ch) => s.type(ch));
    await s.submit();
    expect(caller.calls).toContain("send:claude-opus-4-7:rotate sessions");
    expect(s.pane.turns).toHaveLength(2);
    expect(s.pane.turns[0]?.speaker).toBe("you");
    expect(s.pane.turns[1]?.speaker).toBe("agent");
    expect(render(s, 120, 32)).toContain("echo rotate sessions");
  });

  test("↑/↓ recall submitted-message history", async () => {
    const s = screen();
    "first".split("").forEach((ch) => s.type(ch));
    await s.submit();
    "second".split("").forEach((ch) => s.type(ch));
    await s.submit();
    s.history(-1);
    expect(s.pane.composerDraft).toBe("second");
    s.history(-1);
    expect(s.pane.composerDraft).toBe("first");
    s.history(1);
    expect(s.pane.composerDraft).toBe("second");
  });

  test("Ctrl-l clears the composer draft", () => {
    const s = screen();
    "draft text".split("").forEach((ch) => s.type(ch));
    s.clearComposer();
    expect(s.pane.composerDraft).toBe("");
    expect(s.currentFlash).toContain("cleared");
  });

  test("Ctrl-s saves the thread", async () => {
    const caller = recordingCaller();
    const s = screen(caller);
    await s.saveThread();
    expect(caller.calls).toContain("save:auth-rewrite");
    expect(s.currentFlash).toContain("saved");
  });

  test("Esc blurs the composer without popping the screen", () => {
    const s = screen();
    expect(s.isComposerFocused).toBe(true);
    s.blur();
    expect(s.isComposerFocused).toBe(false);
  });

  test(":agent override changes the routed agent without a message turn", async () => {
    const caller = recordingCaller();
    const s = screen(caller);
    ":agent codex".split("").forEach((ch) => s.type(ch));
    await s.submit();
    expect(s.pane.currentAgent).toBe("codex");
    expect(s.pane.turns).toHaveLength(0);
    expect(caller.calls).toHaveLength(0);
  });

  test("inline permission prompt renders Allow once / Deny / Always allow (§10.2)", async () => {
    const caller = recordingCaller({
      permission: { id: "perm-1", capability: "shell.run", command: "pnpm test --filter auth" },
    });
    const s = screen(caller);
    "run the tests".split("").forEach((ch) => s.type(ch));
    await s.submit();
    const out = render(s, 120, 32);
    expect(out).toContain("⚠ permission shell.run");
    expect(out).toContain("[ Allow once ]");
    expect(out).toContain("[ Deny ]");
    expect(out).toContain("[ Always allow shell.run ]");
  });

  test("resolving a permission prompt dispatches the decision and clears the prompt", async () => {
    const caller = recordingCaller({
      permission: { id: "perm-1", capability: "shell.run", command: "pnpm test --filter auth" },
    });
    const s = screen(caller);
    "run".split("").forEach((ch) => s.type(ch));
    await s.submit();
    expect(s.pane.pendingPermission?.id).toBe("perm-1");
    await s.decidePermission("allow-once");
    expect(caller.calls).toContain("permission:perm-1:allow-once");
    expect(s.pane.pendingPermission).toBeNull();
  });

  test("thread state survives a re-scope (CLI-TUI-UX.md §10.3)", async () => {
    const s = screen();
    "remembered message".split("").forEach((ch) => s.type(ch));
    await s.submit();
    s.rescope({ project: "billing/api", step: null, traceId: "tr_9911" });
    expect(s.pane.turns).toHaveLength(2);
    const out = render(s, 120, 32);
    expect(out).toContain("remembered message");
    expect(out).toContain("scope: billing/api · no active step · trace:tr_9911");
  });

  test("renders within an 80-column terminal (snapshot fidelity)", () => {
    const out = render(screen(), 80, 24);
    expect(out).toContain("thread · auth-rewrite");
    expect(out).toContain("composer");
    expect(out).toContain("@scope mention");
    for (const line of out.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(120);
    }
  });

  test("renders within a 120-column terminal (snapshot fidelity)", () => {
    const out = render(screen(), 120, 32);
    expect(out).toContain("thread · auth-rewrite");
    expect(out).toContain("composer");
  });

  test("defaultAiAssistScope auto-scopes to project + trace with no step", () => {
    const scope = defaultAiAssistScope("fulcrum", "tr_abc");
    expect(scope).toEqual({ project: "fulcrum", step: null, traceId: "tr_abc" });
  });
});
