import { describe, expect, test } from "bun:test";

interface UpstreamConflict {
  local_content: string;
  upstream_content: string;
  installed_skill: string;
  requested_skill: string;
  recommended_resolution: string;
}

interface SkillsPayload {
  skills: Array<{
    id: string;
    slug: string;
    version: string;
    source: string;
    content_hash: string | null;
    enabled_agents: string[];
    upstream_conflict: UpstreamConflict | null;
  }>;
}

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

function loadEvent(fetch: typeof globalThis.fetch) {
  return {
    locals: {
      activeProjectId: null,
      session: { userId: "user-1" },
      orgId: "org-1",
      userId: "user-1",
      em: null,
      container: null,
    },
    fetch,
    request: new Request("http://localhost/settings/skills", {
      headers: { cookie: "sid=session-1" },
    }),
    url: new URL("http://localhost/settings/skills"),
  };
}

const SKILL_ROWS = [
  {
    id: "bat",
    name: "bat",
    slug: "bat",
    source: "local",
    version: "1.0.0",
    hash: "sha-bat",
    upstreamRepo: null,
    upstreamRef: null,
    enabledAgents: ["codex"],
  },
  {
    id: "jq",
    name: "jq",
    slug: "jq",
    source: "local",
    version: "1.1.0",
    hash: "sha-jq",
    upstreamRepo: null,
    upstreamRef: null,
    enabledAgents: ["codex", "claude"],
  },
];

// The skills route load now fans out to two public-API endpoints in parallel:
// `GET /api/v1/skills` for the installed list and `GET /api/v1/skills/conflicts`
// for upstream version conflicts. This dispatcher routes a mocked `fetch` to
// the right payload by path so each test controls both endpoints independently.
function skillsFetch(
  skillRows: unknown[],
  conflictRows: unknown[],
  calls: Array<{ url: string; init?: RequestInit }>,
): typeof globalThis.fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const body = url.includes("/api/v1/skills/conflicts") ? conflictRows : skillRows;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;
}

describe("/settings/skills +page.server.ts load()", () => {
  test("loads installed skills through the public skill API", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetch = skillsFetch(SKILL_ROWS, [], calls);
    const mod = await import(`./+page.server.ts?skills-public-list=${Date.now()}`);

    const result = mod.load(loadEvent(fetch) as never);
    const payload = await streamedData<SkillsPayload>(result);
    expect(payload.skills).toEqual([
      expect.objectContaining({
        slug: "bat",
        version: "1.0.0",
        content_hash: "sha-bat",
        enabled_agents: ["codex"],
        upstream_conflict: null,
      }),
      expect.objectContaining({
        slug: "jq",
        version: "1.1.0",
        content_hash: "sha-jq",
        enabled_agents: ["codex", "claude"],
        upstream_conflict: null,
      }),
    ]);
    // The load fans out to the installed-skills list and the conflicts list.
    expect(calls).toHaveLength(2);
    const urls = calls.map((call) => call.url).sort();
    expect(urls).toContain("http://localhost/api/v1/skills?orgId=org-1");
    expect(urls).toContain("http://localhost/api/v1/skills/conflicts");
    for (const call of calls) {
      expect(call.init).toMatchObject({
        method: "GET",
        credentials: "include",
        headers: expect.objectContaining({ cookie: "sid=session-1" }),
      });
    }
  });

  test("maps an upstream conflict onto the matching installed skill", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const conflicts = [{ slug: "jq", localHash: "sha-jq", upstreamHash: "sha-jq-next" }];
    const fetch = skillsFetch(SKILL_ROWS, conflicts, calls);
    const mod = await import(`./+page.server.ts?skills-conflict=${Date.now()}`);

    const result = mod.load(loadEvent(fetch) as never);
    const payload = await streamedData<SkillsPayload>(result);

    const bat = payload.skills.find((skill) => skill.slug === "bat");
    const jq = payload.skills.find((skill) => skill.slug === "jq");
    // Only `jq` has a conflict row — `bat` stays conflict-free.
    expect(bat?.upstream_conflict).toBeNull();
    expect(jq?.upstream_conflict).toMatchObject({
      local_content: "sha-jq",
      upstream_content: "sha-jq-next",
      installed_skill: "jq",
    });
  });

  test("returns empty array when no skills are installed", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetch = skillsFetch([], [], calls);
    const mod = await import(`./+page.server.ts?skills-empty=${Date.now()}`);

    const result = mod.load(loadEvent(fetch) as never);
    const payload = await streamedData<SkillsPayload>(result);
    expect(payload.skills).toEqual([]);
  });

  test("route source does not use direct application scope or skill queries", async () => {
    const serverSource = await Bun.file(new URL("./+page.server.ts", import.meta.url)).text();

    expect(serverSource).not.toContain("requestAppScope");
    expect(serverSource).not.toContain("application/skills/queries");
  });
});
