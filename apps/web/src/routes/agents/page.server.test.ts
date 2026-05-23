import { beforeEach, describe, expect, mock, test } from "bun:test";

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

interface ProfilesPayload {
  sessionWorkbench: {
    connection: { status: string };
    session: unknown;
    controls: { canPrompt: boolean };
  };
  profiles: Array<{
    id: string;
    name: string;
    cli_path: string;
    capabilities: string[];
    auth_env: Record<string, string>;
    test_passed: boolean | null;
  }>;
  projects: Array<{ id: string; name: string }>;
  tasks: Array<{ id: string; title: string }>;
}

const FAKE_PROFILES = [
  {
    id: "p1",
    org_id: "org1",
    name: "claude-code",
    cli_path: "/usr/bin/claude",
    default_flags: "",
    auth_env_vars: ["ANTHROPIC_API_KEY=sk-ant-secret1234"],
    test_passed: true,
    last_tested_at: "2026-05-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "p2",
    org_id: "org1",
    name: "codex",
    cli_path: "/usr/bin/codex",
    default_flags: "",
    auth_env_vars: [],
    test_passed: null,
    last_tested_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

const calls: Array<{ method: string; input?: Record<string, unknown> }> = [];
let profilePayload = () => ({
  sessionWorkbench: {
    connection: { status: "idle" },
    session: null,
    controls: { canPrompt: false },
  },
  profiles: FAKE_PROFILES.map(maskProfileForTest),
  projects: [],
  tasks: [],
});

mock.module("$lib/server/agents-api", () => ({
  createAgentsApiForEvent: () => ({
    agents: {
      list: async () => {
        calls.push({ method: "agents.list" });
        return profilePayload();
      },
      test: async (input: Record<string, unknown>) => {
        calls.push({ method: "agents.test", input });
        return { test_passed: true };
      },
      startGuidedPlanning: async (input: Record<string, unknown>) => {
        calls.push({ method: "agents.startGuidedPlanning", input });
        return { traceId: "trace-1" };
      },
      dispatchTask: async (input: Record<string, unknown>) => {
        calls.push({ method: "agents.dispatchTask", input });
        return { id: "run-1" };
      },
    },
    sessions: {
      resolvePermission: async (input: Record<string, unknown>) => calls.push({ method: "sessions.resolvePermission", input }),
      updateTraffic: async (input: Record<string, unknown>) => calls.push({ method: "sessions.updateTraffic", input }),
      reconnect: async () => calls.push({ method: "sessions.reconnect" }),
      abort: async (input: Record<string, unknown>) => calls.push({ method: "sessions.abort", input }),
      pause: async () => calls.push({ method: "sessions.pause" }),
      resume: async () => calls.push({ method: "sessions.resume" }),
      restoreCheckpoint: async (input: Record<string, unknown>) => calls.push({ method: "sessions.restoreCheckpoint", input }),
      forkFromCheckpoint: async (input: Record<string, unknown>) => calls.push({ method: "sessions.forkFromCheckpoint", input }),
      resumeSaved: async (input: Record<string, unknown>) => calls.push({ method: "sessions.resumeSaved", input }),
      deleteSaved: async (input: Record<string, unknown>) => calls.push({ method: "sessions.deleteSaved", input }),
      connectBridge: async (input: Record<string, unknown>) => {
        calls.push({ method: "sessions.connectBridge", input });
        return { sessionId: "session-1" };
      },
    },
  }),
}));

function event(data: Record<string, string> = {}, locals: Record<string, unknown> = { activeProjectId: null }) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  const url = new URL("http://localhost/agents");
  return {
    url,
    locals,
    request: new Request(url, { method: "POST", body: fd }),
    fetch,
  };
}

beforeEach(() => {
  calls.splice(0, calls.length);
  profilePayload = () => ({
    sessionWorkbench: {
      connection: { status: "idle" },
      session: null,
      controls: { canPrompt: false },
    },
    profiles: FAKE_PROFILES.map(maskProfileForTest),
    projects: [],
    tasks: [],
  });
});

describe("/agents +page.server.ts", () => {
  test("load returns profiles with masked auth_env and capabilities", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(event() as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<ProfilesPayload>(result);

    expect(payload.profiles).toHaveLength(2);
    expect(payload.profiles[0]!.name).toBe("claude-code");
    expect(payload.profiles[1]!.name).toBe("codex");
    expect(payload.sessionWorkbench).toMatchObject({
      connection: { status: "idle" },
      session: null,
      controls: { canPrompt: false },
    });
    expect(payload.profiles[0]!.auth_env.ANTHROPIC_API_KEY).toBe("****1234");
    expect(payload.profiles[0]!.capabilities).toContain("LLM");
    expect(payload.profiles[0]!.capabilities).toContain("code");
    expect(Array.isArray(payload.projects)).toBe(true);
    expect(Array.isArray(payload.tasks)).toBe(true);
    expect(calls).toEqual([{ method: "agents.list" }]);
  });

  test("load returns empty array when no profiles", async () => {
    profilePayload = () => ({
      sessionWorkbench: {
        connection: { status: "idle" },
        session: null,
        controls: { canPrompt: false },
      },
      profiles: [],
      projects: [],
      tasks: [],
    });

    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load(event() as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<ProfilesPayload>(result);
    expect(payload.profiles).toEqual([]);
  });

  test("test action delegates profile check to the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.actions.test(event({ name: "codex" }) as Parameters<typeof mod.actions.test>[0]);

    expect(result).toEqual({ ok: true, message: "codex: test passed" });
    expect(calls).toEqual([{ method: "agents.test", input: { name: "codex" } }]);
  });

  test("dispatch action delegates to the public API and redirects", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    let caught: unknown;
    try {
      await mod.actions.dispatch(
        event({ agent: "codex", task_id: "task-1", project_id: "project-1" }) as Parameters<typeof mod.actions.dispatch>[0],
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ status: 303, location: "/runs/run-1" });
    expect(calls).toEqual([{ method: "agents.dispatchTask", input: { projectId: "project-1", taskId: "task-1", agent: "codex" } }]);
  });

  test("startGuidedPlanning delegates submitted session options", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    const result = await mod.actions.startGuidedPlanning(
      event({
        agentName: "codex",
        userPrompt: "plan this",
        modeId: "fast",
        modelId: "gpt-5",
        permissionMode: "review_each_tool",
        cwd: "/tmp",
      }) as Parameters<typeof mod.actions.startGuidedPlanning>[0],
    );
    expect(result).toEqual({ ok: true, message: "Planning session started (trace: trace-1)" });
    expect(calls[0]).toMatchObject({
      method: "agents.startGuidedPlanning",
      input: {
        agentName: "codex",
        cwd: "/tmp",
        userPrompt: "plan this",
        modeId: "fast",
        modelId: "gpt-5",
        permissionMode: "review_each_tool",
      },
    });
    expect((calls[0]?.input as Record<string, unknown>).acpSessionId).toMatch(/^acp-/);
  });

  test("session controls delegate to the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 5}`);
    await mod.actions.resolvePermission(event({ sessionId: "s1", optionId: "allow" }) as Parameters<typeof mod.actions.resolvePermission>[0]);
    await mod.actions.trafficControl(event({ trafficAction: "pause", value: "1" }) as Parameters<typeof mod.actions.trafficControl>[0]);
    await mod.actions.reconnectSession(event() as Parameters<typeof mod.actions.reconnectSession>[0]);
    await mod.actions.abortWithReason(event({ reason: "wrong-context", note: "bad repo" }) as Parameters<typeof mod.actions.abortWithReason>[0]);
    await mod.actions.pauseSession(event() as Parameters<typeof mod.actions.pauseSession>[0]);
    await mod.actions.resumeSession(event() as Parameters<typeof mod.actions.resumeSession>[0]);
    await mod.actions.restoreCheckpoint(event({ checkpointId: "cp1" }) as Parameters<typeof mod.actions.restoreCheckpoint>[0]);
    await mod.actions.forkFromCheckpoint(event({ checkpointId: "cp1" }) as Parameters<typeof mod.actions.forkFromCheckpoint>[0]);
    await mod.actions.resumeSavedSession(event({ savedSessionId: "saved-1" }) as Parameters<typeof mod.actions.resumeSavedSession>[0]);
    await mod.actions.deleteSavedSession(event({ savedSessionId: "saved-1" }) as Parameters<typeof mod.actions.deleteSavedSession>[0]);

    expect(calls).toEqual([
      { method: "sessions.resolvePermission", input: { sessionId: "s1", optionId: "allow" } },
      { method: "sessions.updateTraffic", input: { action: "pause", value: "1" } },
      { method: "sessions.reconnect" },
      { method: "sessions.abort", input: { reason: "wrong-context", note: "bad repo" } },
      { method: "sessions.pause" },
      { method: "sessions.resume" },
      { method: "sessions.restoreCheckpoint", input: { checkpointId: "cp1" } },
      { method: "sessions.forkFromCheckpoint", input: { checkpointId: "cp1" } },
      { method: "sessions.resumeSaved", input: { savedSessionId: "saved-1" } },
      { method: "sessions.deleteSaved", input: { savedSessionId: "saved-1" } },
    ]);
  });

  test("connectBridge rejects empty working directory", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 20}`);
    const result = await mod.actions.connectBridge(
      event({ agentName: "codex", transportType: "stdio", command: "codex", cwd: "" }) as Parameters<typeof mod.actions.connectBridge>[0],
    );

    expect(result).toEqual({ success: false, message: "working directory required" });
    expect(calls).toEqual([]);
  });

  test("connectBridge rejects non-directory working directory", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 21}`);
    const result = await mod.actions.connectBridge(
      event({
        agentName: "codex",
        transportType: "stdio",
        command: "codex",
        cwd: "/definitely/not/a/real/fulcrum/path",
      }) as Parameters<typeof mod.actions.connectBridge>[0],
    );

    expect(result).toEqual({ success: false, message: "working directory must be an existing folder" });
    expect(calls).toEqual([]);
  });

  test("maskProfile: caps last 4 of auth_env value", async () => {
    const { maskProfile } = await import("../../lib/server/agents.ts");
    const row = {
      id: "x",
      org_id: "o",
      name: "test-agent",
      cli_path: "/bin/test",
      default_flags: "",
      auth_env_vars: ["MY_KEY=abcdef1234"],
      test_passed: null,
      last_tested_at: null,
      created_at: "",
      updated_at: "",
    };
    const masked = maskProfile(row);
    expect(masked.auth_env["MY_KEY"]).toBe("****1234");
    expect(masked.capabilities).toContain("general");
  });

  test("maskProfile: claude-code agent has LLM+code capabilities", async () => {
    const { maskProfile } = await import("../../lib/server/agents.ts?v=2");
    const row = {
      id: "x",
      org_id: "o",
      name: "claude-code",
      cli_path: "/bin/claude",
      default_flags: "",
      auth_env_vars: [],
      test_passed: true,
      last_tested_at: null,
      created_at: "",
      updated_at: "",
    };
    const masked = maskProfile(row);
    expect(masked.capabilities).toContain("LLM");
    expect(masked.capabilities).toContain("code");
  });
});

function maskProfileForTest(row: (typeof FAKE_PROFILES)[number]) {
  const auth_env: Record<string, string> = {};
  for (const entry of row.auth_env_vars) {
    const [key, value = ""] = entry.split("=");
    auth_env[key!] = value.length > 4 ? `****${value.slice(-4)}` : "****";
  }
  const capabilities = row.name.includes("claude") || row.name.includes("codex")
    ? ["LLM", "code"]
    : ["general"];
  return {
    id: row.id,
    name: row.name,
    cli_path: row.cli_path,
    capabilities,
    sessions_count: 0,
    tested_at: row.last_tested_at,
    test_passed: row.test_passed,
    auth_env,
  };
}
