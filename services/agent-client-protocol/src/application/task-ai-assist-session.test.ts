import { describe, expect, test } from "bun:test";

import { startTaskAiAssistSession } from "./task-ai-assist-session.ts";

describe("task AI Assist session", () => {
  test("assembles task context and returns a stable session id", () => {
    const session = startTaskAiAssistSession({
      task: {
        id: "task-42",
        title: "Persist key issuance",
        description: "Store issuance row for each key id.",
        project_id: "project-auth",
        updated_at: "2026-05-19T12:00:00Z",
      },
      agent: "claude-code",
      route: "build",
      workspacePath: "/workspace/fulcrum",
    });

    expect(session).toMatchObject({
      sessionId: "ai-task-42-build",
      taskId: "task-42",
      taskTitle: "Persist key issuance",
      taskDescription: "Store issuance row for each key id.",
      agent: "claude-code",
      route: "build",
      workspacePath: "/workspace/fulcrum",
    });
    expect(session.contextBundle.summary).toBe("2 docs, 1 memory notes, 2 repo signals");
    expect(session.contextBundle.docs).toContain("Task brief: Persist key issuance");
  });

  test("defaults route, agent, and workspace safely", () => {
    const session = startTaskAiAssistSession({
      task: { id: "task-7", title: "Review branch" },
      route: "unknown",
    });

    expect(session.sessionId).toBe("ai-task-7-plan");
    expect(session.agent).toBe("codex");
    expect(session.route).toBe("plan");
    expect(session.workspacePath.length).toBeGreaterThan(0);
  });
});
