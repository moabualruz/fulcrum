import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

let scratch: string;

interface SkillsPayload {
  skills: Array<{
    id: string;
    slug: string;
    version: string;
    source: string;
    enabled_agents: string[];
  }>;
}

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-skills-page-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

describe("/settings/skills +page.server.ts load()", () => {
  test("returns seeded skills sorted by slug ASC", async () => {
    mock.module("$lib/server/application-scope", () => ({
      requestAppScope: async () => ({ ctx: { orgId: "org1" } }),
    }));
    mock.module("../../../../../application/skills/queries.ts", () => ({
      listRegistrySkills: async () => [],
      listSkillConflicts: async () => [],
      serializeSkill: (skill: unknown) => skill,
      listSkills: async () => [
        { id: "bat", name: "bat", slug: "bat", source: "upstream", upstreamRepo: "https://github.com/ex/bat", upstreamRef: null, enabledAgents: [] },
        { id: "jq", name: "jq", slug: "jq", source: "local", upstreamRepo: null, upstreamRef: null, enabledAgents: [] },
      ],
    }));
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = mod.load({ locals: {} } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<SkillsPayload>(result);
    expect(Array.isArray(payload.skills)).toBe(true);
    expect(payload.skills).toHaveLength(2);
    expect(payload.skills[0]!.slug).toBe("bat");
    expect(payload.skills[1]!.slug).toBe("jq");
  });

  test("returns empty array when no skills installed", async () => {
    mock.module("$lib/server/application-scope", () => ({
      requestAppScope: async () => ({ ctx: { orgId: "org1" } }),
    }));
    mock.module("../../../../../application/skills/queries.ts", () => ({
      listRegistrySkills: async () => [],
      listSkillConflicts: async () => [],
      serializeSkill: (skill: unknown) => skill,
      listSkills: async () => [],
    }));
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = mod.load({ locals: {} } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<SkillsPayload>(result);
    expect(payload.skills).toEqual([]);
  });
});
