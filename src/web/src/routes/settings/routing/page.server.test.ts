import { describe, expect, test } from "bun:test";
import type { RoutingRuleRow } from "./routing.types";

// Tests for routing.server.ts / +page.server.ts.
// We exercise loadRoutingPage() and the CRUD/dryRun actions via controlled
// fetch mocks — no live tRPC server required.

function fakeOkFetch(data: unknown): typeof fetch {
  return async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({ result: { data: { json: data } } }),
    }) as Response;
}

function fakeFail(status: number, msg: string): typeof fetch {
  return async () =>
    ({
      ok: false,
      status,
      json: async () => ({ error: { json: { message: msg } } }),
    }) as Response;
}

const BASE_LOAD_EVENT = {
  locals: { session: { userId: "u1" } },
  request: { headers: { get: () => null } },
  url: new URL("http://localhost/settings/routing"),
  params: {},
};

const SAMPLE_RULE: RoutingRuleRow = {
  id: "rule-001",
  orgId: "org-001",
  projectId: null,
  name: "Bug fixer",
  conditionsJson: { all: [] },
  actionAgent: "claude",
  actionSkillSet: [],
  priority: 100,
  enabled: true,
  source: "manual",
  createdAt: new Date("2024-01-01").toISOString(),
  updatedAt: new Date("2024-01-01").toISOString(),
};

describe("routing +page.server.ts load()", () => {
  test("redirects when no session", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    let threw = false;
    try {
      await mod.load({
        ...BASE_LOAD_EVENT,
        locals: { session: null },
        fetch: fakeOkFetch({ rules: [], inheritedRules: [] }),
      });
    } catch (e) {
      threw = true;
      expect((e as { status?: number }).status).toBe(302);
    }
    expect(threw).toBe(true);
  });

  test("returns rules and inheritedRules from tRPC", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 1}`);
    // routing.server calls routing.list which returns an array directly
    const fetchMock = fakeOkFetch([SAMPLE_RULE]);
    const result = await mod.load({ ...BASE_LOAD_EVENT, fetch: fetchMock });
    expect(Array.isArray(result.rules)).toBe(true);
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].name).toBe("Bug fixer");
  });

  test("returns empty arrays when tRPC returns null", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 2}`);
    const fetchMock = fakeOkFetch(null);
    const result = await mod.load({ ...BASE_LOAD_EVENT, fetch: fetchMock });
    expect(result.rules).toEqual([]);
  });
});

describe("routing actions.create()", () => {
  test("returns createError on tRPC failure", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 3}`);
    const fd = new FormData();
    fd.set("name", "Test rule");
    fd.set("actionAgent", "claude");
    fd.set("conditionsJson", JSON.stringify({ all: [] }));
    fd.set("priority", "100");
    fd.set("enabled", "true");
    const result = await mod.actions.create({
      ...BASE_LOAD_EVENT,
      fetch: fakeFail(400, "Invalid conditions"),
      request: { headers: { get: () => null }, formData: async () => fd },
    });
    expect(result).toMatchObject({ data: { createError: expect.any(String) } });
  });

  test("returns ok on success", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 4}`);
    const fd = new FormData();
    fd.set("name", "Test rule");
    fd.set("actionAgent", "claude");
    fd.set("conditionsJson", JSON.stringify({ all: [] }));
    fd.set("priority", "100");
    fd.set("enabled", "true");
    const result = await mod.actions.create({
      ...BASE_LOAD_EVENT,
      fetch: fakeOkFetch(SAMPLE_RULE),
      request: { headers: { get: () => null }, formData: async () => fd },
    });
    expect(result).toMatchObject({ ok: true });
  });
});

describe("routing actions.dryRun()", () => {
  test("returns dryRunError on invalid JSON", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 5}`);
    const fd = new FormData();
    fd.set("taskJson", "not valid json {{{");
    const result = await mod.actions.dryRun({
      ...BASE_LOAD_EVENT,
      fetch: fakeOkFetch(null),
      request: { headers: { get: () => null }, formData: async () => fd },
    });
    expect(result).toMatchObject({ data: { dryRunError: expect.any(String) } });
  });

  test("returns dryRunResult on success", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 6}`);
    const decision = { ruleId: "rule-001", source: "rule", agent: "claude", confidence: 1.0 };
    const fd = new FormData();
    fd.set("taskJson", JSON.stringify({ title: "Fix bug", kind: "bug" }));
    const result = await mod.actions.dryRun({
      ...BASE_LOAD_EVENT,
      fetch: fakeOkFetch(decision),
      request: { headers: { get: () => null }, formData: async () => fd },
    });
    expect(result).toMatchObject({ ok: true, dryRunResult: decision });
  });
});

describe("routing actions.delete()", () => {
  test("returns ok=true on success", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 7}`);
    const fd = new FormData();
    fd.set("id", "rule-001");
    const result = await mod.actions.delete({
      ...BASE_LOAD_EVENT,
      fetch: fakeOkFetch({ ok: true }),
      request: { headers: { get: () => null }, formData: async () => fd },
    });
    expect(result).toMatchObject({ ok: true });
  });
});
