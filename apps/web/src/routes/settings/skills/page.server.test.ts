import { describe, expect, test } from "bun:test";

interface SkillsPayload {
  skills: Array<{
    id: string;
    slug: string;
    version: string;
    source: string;
    content_hash: string | null;
    enabled_agents: string[];
    upstream_conflict: null;
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

describe("/settings/skills +page.server.ts load()", () => {
  test("loads installed skills through the public skill API", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify([
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
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof globalThis.fetch;
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
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://localhost/api/v1/skills?orgId=org-1");
    expect(calls[0]?.init).toMatchObject({
      method: "GET",
      credentials: "include",
      headers: expect.objectContaining({ cookie: "sid=session-1" }),
    });
  });

  test("returns empty array when no skills are installed", async () => {
    const fetch = (async () =>
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof globalThis.fetch;
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
