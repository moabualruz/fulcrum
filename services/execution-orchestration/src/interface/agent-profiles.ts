import type {
  AgentProfileRow,
  MaskedProfileRow,
} from "@execution-orchestration/application/agents/queries.ts";

export type {
  AgentProfilePageData,
  AgentProfileRow,
  AgentProfileRunRow,
  AgentProfilesPageData,
  MaskedProfileRow,
  UpsertProfileInput,
  UpsertProfileSimpleInput,
} from "@execution-orchestration/application/agents/queries.ts";

type GetAgentProfilePageData = typeof import("@execution-orchestration/application/agents/queries.ts").getAgentProfilePageData;
type GetProfile = typeof import("@execution-orchestration/application/agents/queries.ts").getProfile;
type ListAgentProfilesPageData = typeof import("@execution-orchestration/application/agents/queries.ts").listAgentProfilesPageData;
type ListArtifacts = typeof import("@execution-orchestration/application/agents/queries.ts").listArtifacts;
type ListProfiles = typeof import("@execution-orchestration/application/agents/queries.ts").listProfiles;
type TestProfile = typeof import("@execution-orchestration/application/agents/queries.ts").testProfile;
type TestProfileAction = typeof import("@execution-orchestration/application/agents/queries.ts").testProfileAction;
type UpsertProfile = typeof import("@execution-orchestration/application/agents/queries.ts").upsertProfile;
type UpsertProfileAction = typeof import("@execution-orchestration/application/agents/queries.ts").upsertProfileAction;

export async function listProfiles(
  ...args: Parameters<ListProfiles>
): Promise<Awaited<ReturnType<ListProfiles>>> {
  const queries = await import("@execution-orchestration/application/agents/queries.ts");
  return queries.listProfiles(...args);
}

export async function listAgentProfilesPageData(
  ...args: Parameters<ListAgentProfilesPageData>
): Promise<Awaited<ReturnType<ListAgentProfilesPageData>>> {
  const queries = await import("@execution-orchestration/application/agents/queries.ts");
  return queries.listAgentProfilesPageData(...args);
}

export async function getProfile(
  ...args: Parameters<GetProfile>
): Promise<Awaited<ReturnType<GetProfile>>> {
  const queries = await import("@execution-orchestration/application/agents/queries.ts");
  return queries.getProfile(...args);
}

export async function getAgentProfilePageData(
  ...args: Parameters<GetAgentProfilePageData>
): Promise<Awaited<ReturnType<GetAgentProfilePageData>>> {
  const queries = await import("@execution-orchestration/application/agents/queries.ts");
  return queries.getAgentProfilePageData(...args);
}

export async function upsertProfileAction(
  ...args: Parameters<UpsertProfileAction>
): Promise<Awaited<ReturnType<UpsertProfileAction>>> {
  const queries = await import("@execution-orchestration/application/agents/queries.ts");
  return queries.upsertProfileAction(...args);
}

export async function upsertProfile(
  ...args: Parameters<UpsertProfile>
): Promise<Awaited<ReturnType<UpsertProfile>>> {
  const queries = await import("@execution-orchestration/application/agents/queries.ts");
  return queries.upsertProfile(...args);
}

export async function testProfileAction(
  ...args: Parameters<TestProfileAction>
): Promise<Awaited<ReturnType<TestProfileAction>>> {
  const queries = await import("@execution-orchestration/application/agents/queries.ts");
  return queries.testProfileAction(...args);
}

export async function testProfile(
  ...args: Parameters<TestProfile>
): Promise<Awaited<ReturnType<TestProfile>>> {
  const queries = await import("@execution-orchestration/application/agents/queries.ts");
  return queries.testProfile(...args);
}

export function maskProfile(row: AgentProfileRow): MaskedProfileRow {
  const authEnv: Record<string, string> = {};
  const vars: string[] = Array.isArray(row.auth_env_vars) ? row.auth_env_vars : [];
  for (const entry of vars) {
    const eq = entry.indexOf("=");
    if (eq === -1) {
      authEnv[entry] = "****";
      continue;
    }
    const key = entry.slice(0, eq);
    const val = entry.slice(eq + 1);
    authEnv[key] = val.length > 4 ? `****${val.slice(-4)}` : "****";
  }
  return {
    id: row.id,
    name: row.name,
    cli_path: row.cli_path,
    capabilities: deriveCapabilities(row.name),
    sessions_count: 0,
    tested_at: row.last_tested_at,
    test_passed: row.test_passed,
    auth_env: authEnv,
  };
}

function deriveCapabilities(name: string): string[] {
  const normalized = name.toLowerCase();
  const caps: string[] = [];
  if (normalized.includes("claude") || normalized.includes("anthropic")) caps.push("LLM", "code");
  if (normalized.includes("codex") || normalized.includes("gpt") || normalized.includes("openai")) caps.push("LLM", "code");
  if (normalized.includes("gemini")) caps.push("LLM", "multi-modal");
  if (normalized.includes("search")) caps.push("search");
  if (normalized.includes("browse")) caps.push("browser");
  if (caps.length === 0) caps.push("general");
  return [...new Set(caps)];
}

export function paginateLogs(transcript: string, offset = 0, limit = 100): { lines: string[]; nextOffset: number | null } {
  const lines = transcript.split(/\r?\n/).filter(Boolean);
  const page = lines.slice(offset, offset + limit);
  const nextOffset = offset + page.length < lines.length ? offset + page.length : null;
  return { lines: page, nextOffset };
}

export async function getWorkspaceDiff(): Promise<string | null> {
  return null;
}

export async function listArtifacts(
  ...args: Parameters<ListArtifacts>
): Promise<Awaited<ReturnType<ListArtifacts>>> {
  const queries = await import("@execution-orchestration/application/agents/queries.ts");
  return queries.listArtifacts(...args);
}
