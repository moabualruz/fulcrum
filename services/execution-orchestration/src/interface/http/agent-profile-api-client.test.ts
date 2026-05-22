import { describe, expect, test } from "bun:test";

import { createAgentProfileApiCaller } from "./agent-profile-api-client.ts";

describe("agent profile public API client", () => {
  test("calls profile, run-dispatch, and session endpoints with org context", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return Response.json({ ok: true, id: "run-1", test_passed: true });
    }) as typeof fetch;

    const api = createAgentProfileApiCaller({
      baseUrl: "http://127.0.0.1:3000",
      orgId: "org-1",
      userId: "user-1",
      fetch: fetchFn,
      headers: { cookie: "sid=1" },
    });

    await api.agents.list();
    await api.agents.get({ name: "codex" });
    await api.agents.test({ name: "codex" });
    await api.agents.dispatchTask({ projectId: "project-1", taskId: "task-1", agent: "codex" });
    await api.sessions.resolvePermission({ sessionId: "session-1", optionId: "allow_once" });
    await api.sessions.connectBridge({ agentName: "codex", transportType: "stdio", command: "codex", cwd: "/tmp" });

    expect(calls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:3000/api/v1/agents?orgId=org-1&userId=user-1",
      "http://127.0.0.1:3000/api/v1/agents/codex?orgId=org-1&userId=user-1",
      "http://127.0.0.1:3000/api/v1/agents/test",
      "http://127.0.0.1:3000/api/v1/agents/runs/dispatch",
      "http://127.0.0.1:3000/api/v1/agents/sessions/permissions/resolve",
      "http://127.0.0.1:3000/api/v1/agents/sessions/connect",
    ]);
    expect(calls[2]?.init.method).toBe("POST");
    expect(calls[2]?.init.headers).toMatchObject({ cookie: "sid=1" });
    expect(JSON.parse(String(calls[3]?.init.body))).toMatchObject({
      orgId: "org-1",
      userId: "user-1",
      projectId: "project-1",
      taskId: "task-1",
      agent: "codex",
    });
  });
});
