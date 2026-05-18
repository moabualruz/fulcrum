import { describe, expect, test, mock, beforeEach } from "bun:test";

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

let scopeProjectIds: Array<string | null | undefined> = [];
let testedProfiles: string[] = [];
let profilePayload = () => ({
  profiles: FAKE_PROFILES.map(maskProfileForTest),
  projects: [],
  tasks: [],
});

const AGENT_QUERY_MODULES = [
  "@execution-orchestration/interface/agent-profile-pages.ts",
  "services/execution-orchestration/src/interface/agent-profile-pages.ts",
  "/Users/mkh/workspace/fulcrum/services/execution-orchestration/src/interface/agent-profile-pages.ts",
  "file:///Users/mkh/workspace/fulcrum/services/execution-orchestration/src/interface/agent-profile-pages.ts",
  "@execution-orchestration/application/agents/queries.ts",
  "services/execution-orchestration/src/application/agents/queries.ts",
  "/Users/mkh/workspace/fulcrum/services/execution-orchestration/src/application/agents/queries.ts",
  "file:///Users/mkh/workspace/fulcrum/services/execution-orchestration/src/application/agents/queries.ts",
] as const;

const RUN_COMMAND_MODULES = [
  "@execution-orchestration/interface/run-actions.ts",
  "services/execution-orchestration/src/interface/run-actions.ts",
  "/Users/mkh/workspace/fulcrum/services/execution-orchestration/src/interface/run-actions.ts",
  "file:///Users/mkh/workspace/fulcrum/services/execution-orchestration/src/interface/run-actions.ts",
  "@execution-orchestration/application/runs/commands.ts",
  "services/execution-orchestration/src/application/runs/commands.ts",
  "/Users/mkh/workspace/fulcrum/services/execution-orchestration/src/application/runs/commands.ts",
  "file:///Users/mkh/workspace/fulcrum/services/execution-orchestration/src/application/runs/commands.ts",
] as const;

const APPLICATION_SCOPE_MODULES = [
  "$lib/server/application-scope",
  "$lib/server/application-scope.ts",
  "/Users/mkh/workspace/fulcrum/apps/web/src/lib/server/application-scope.ts",
  "file:///Users/mkh/workspace/fulcrum/apps/web/src/lib/server/application-scope.ts",
] as const;

installRouteMocks();

beforeEach(() => {
  scopeProjectIds = [];
  testedProfiles = [];
  profilePayload = () => ({
    profiles: FAKE_PROFILES.map(maskProfileForTest),
    projects: [],
    tasks: [],
  });
});

describe("/agents +page.server.ts", () => {
  test("load returns profiles with masked auth_env and capabilities", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<ProfilesPayload>(result);

    expect(payload.profiles).toHaveLength(2);
    expect(payload.profiles[0]!.name).toBe("claude-code");
    expect(payload.profiles[1]!.name).toBe("codex");
    expect(payload.sessionWorkbench).toMatchObject({
      connection: { status: "idle" },
      session: null,
      controls: { canPrompt: false },
    });
    // Auth env masked
    expect(payload.profiles[0]!.auth_env.ANTHROPIC_API_KEY).toBe("****1234");
    // Capability chips inferred
    expect(payload.profiles[0]!.capabilities).toContain("LLM");
    expect(payload.profiles[0]!.capabilities).toContain("code");
    // Projects and tasks present
    expect(Array.isArray(payload.projects)).toBe(true);
    expect(Array.isArray(payload.tasks)).toBe(true);
  });

  test("load returns empty array when no profiles", async () => {
    profilePayload = () => ({ profiles: [], projects: [], tasks: [] });

    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load({
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<ProfilesPayload>(result);
    expect(payload.profiles).toEqual([]);
  });

  test("test action scopes the profile check with route locals", async () => {
    const form = new FormData();
    form.set("name", "codex");
    const request = new Request("http://localhost/agents?/test", {
      method: "POST",
      body: form,
    });
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.actions.test({
      request,
      locals: { activeProjectId: "project-1" },
    } as Parameters<typeof mod.actions.test>[0]);

    expect(result).toEqual({ ok: true, message: "codex: test passed" });
    expect(scopeProjectIds).toEqual([null]);
    expect(testedProfiles).toEqual(["codex"]);
  });

  test("connectBridge rejects empty working directory", async () => {
    const form = new FormData();
    form.set("agentName", "codex");
    form.set("transportType", "stdio");
    form.set("command", "codex");
    form.set("cwd", "");
    const request = new Request("http://localhost/agents?/connectBridge", {
      method: "POST",
      body: form,
    });
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 20}`);

    const result = await mod.actions.connectBridge({
      request,
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.actions.connectBridge>[0]);

    expect(result).toEqual({ success: false, message: "working directory required" });
  });

  test("connectBridge rejects non-directory working directory", async () => {
    const form = new FormData();
    form.set("agentName", "codex");
    form.set("transportType", "stdio");
    form.set("command", "codex");
    form.set("cwd", "/definitely/not/a/real/fulcrum/path");
    const request = new Request("http://localhost/agents?/connectBridge", {
      method: "POST",
      body: form,
    });
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 21}`);

    const result = await mod.actions.connectBridge({
      request,
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.actions.connectBridge>[0]);

    expect(result).toEqual({ success: false, message: "working directory must be an existing folder" });
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

function installRouteMocks() {
  for (const moduleId of APPLICATION_SCOPE_MODULES) {
    mock.module(moduleId, () => ({
      requestAppScope: async (_locals: unknown, projectId?: string | null) => {
        scopeProjectIds.push(projectId);
        return { em: {} as never, ctx: { orgId: "org1", userId: null, projectId: projectId ?? null } };
      },
    }));
  }

  for (const moduleId of AGENT_QUERY_MODULES) {
    mock.module(moduleId, () => ({
      listAgentProfilesPageData: async () => profilePayload(),
      maskProfile: maskProfileForTest,
      testProfile: async (_em: unknown, _orgId: string, name: string) => {
        testedProfiles.push(name);
        return { test_passed: true };
      },
    }));
  }

  for (const moduleId of RUN_COMMAND_MODULES) {
    mock.module(moduleId, () => ({
      dispatchTaskRun: async () => ({ id: "run-1" }),
    }));
  }
}

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
