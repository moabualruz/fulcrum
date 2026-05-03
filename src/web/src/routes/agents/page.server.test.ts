import { describe, expect, test, mock, beforeEach } from "bun:test";

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

interface ProfilesPayload {
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

beforeEach(() => {
  mock.module("$lib/server/db", () => ({
    openProductDb: async () => ({
      query: async (sql: string) => {
        if (sql.includes("agent_profiles")) return FAKE_PROFILES;
        if (sql.includes("FROM projects")) return [];
        if (sql.includes("FROM tasks")) return [];
        return [];
      },
      close: async () => {},
    }),
    getDefaultOrgId: async () => "org1",
  }));
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
    mock.module("$lib/server/db", () => ({
      openProductDb: async () => ({
        query: async () => [],
        close: async () => {},
      }),
      getDefaultOrgId: async () => "org1",
    }));

    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load({
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<ProfilesPayload>(result);
    expect(payload.profiles).toEqual([]);
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
