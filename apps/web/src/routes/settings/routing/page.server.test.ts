import { describe, expect, test } from "bun:test";
import type { DraftRow, EnrichedDecisionRow, RoutingRuleRow } from "./routing.types";

// Tests for routing.server.ts / +page.server.ts.
// We exercise loadRoutingPage() and the CRUD/dryRun actions via controlled
// fetch mocks.

function fakeOkFetch(data: unknown): typeof fetch {
  return async () => Response.json(data);
}

function fakeFail(status: number, msg: string): typeof fetch {
  return async () => Response.json({ message: msg }, { status });
}

const BASE_LOAD_EVENT = {
  locals: { session: { userId: "u1" }, orgId: "org-001", userId: "u1" },
  request: { headers: { get: (name: string) => name === "cookie" ? "fulcrum_session=abc" : null } },
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
        fetch: fakeOkFetch([]),
      });
    } catch (e) {
      threw = true;
      expect((e as { status?: number }).status).toBe(302);
    }
    expect(threw).toBe(true);
  });

  test("returns rules from the public API", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 1}`);
    const fetchMock = fakeOkFetch([SAMPLE_RULE]);
    const result = await mod.load({ ...BASE_LOAD_EVENT, fetch: fetchMock });
    expect(Array.isArray(result.rules)).toBe(true);
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].name).toBe("Bug fixer");
  });

  test("returns empty arrays when the public API returns null", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 2}`);
    const fetchMock = fakeOkFetch(null);
    const result = await mod.load({ ...BASE_LOAD_EVENT, fetch: fetchMock });
    expect(result.rules).toEqual([]);
  });
});

describe("routing actions.create()", () => {
  test("returns createError on public API failure", async () => {
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

describe("routing actions.test() — enriched test output", () => {
  test("calls routing.test and returns enriched decision", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 8}`);
    const enriched: EnrichedDecisionRow = {
      status: "matched",
      matchedRuleId: "rule-001",
      draftId: null,
      factsUsed: { task: { kind: "bug" } },
      confidence: 1.0,
      backend: null,
      model: null,
      whyUnmatched: null,
      evidence: ["matched rule rule-001"],
    };
    const fd = new FormData();
    fd.set("taskId", "task-001");
    const result = await mod.actions.test({
      ...BASE_LOAD_EVENT,
      fetch: fakeOkFetch(enriched),
      request: { headers: { get: () => null }, formData: async () => fd },
    });
    expect(result).toMatchObject({ ok: true, testResult: enriched });
  });

  test("returns testError on public API failure", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 9}`);
    const fd = new FormData();
    fd.set("taskId", "task-001");
    const result = await mod.actions.test({
      ...BASE_LOAD_EVENT,
      fetch: fakeFail(404, "Task not found"),
      request: { headers: { get: () => null }, formData: async () => fd },
    });
    expect(result).toMatchObject({ data: { testError: expect.any(String) } });
  });
});

describe("routing actions.draftList()", () => {
  test("calls the public draft list API and returns drafts array", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 10}`);
    const drafts: DraftRow[] = [
      {
        id: "draft-001",
        orgId: "org-001",
        proposedRule: "Assign bugs to codex",
        source: "learned",
        confidence: 0.85,
        conflictState: "review_needed",
        matchingActiveRuleIds: [],
        createdAt: new Date("2024-01-01").toISOString(),
      },
    ];
    const fd = new FormData();
    const result = await mod.actions.draftList({
      ...BASE_LOAD_EVENT,
      fetch: fakeOkFetch(drafts),
      request: { headers: { get: () => null }, formData: async () => fd },
    });
    expect(result).toMatchObject({ ok: true, drafts });
  });
});

describe("routing actions.draftApprove()", () => {
  test("calls the public draft approval API and returns ok", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 11}`);
    const fd = new FormData();
    fd.set("draftId", "draft-001");
    const result = await mod.actions.draftApprove({
      ...BASE_LOAD_EVENT,
      fetch: fakeOkFetch({ ok: true }),
      request: { headers: { get: () => null }, formData: async () => fd },
    });
    expect(result).toMatchObject({ ok: true });
  });
});

describe("routing actions.draftDelete()", () => {
  test("calls the public draft delete API and returns ok", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 12}`);
    const fd = new FormData();
    fd.set("draftId", "draft-001");
    const result = await mod.actions.draftDelete({
      ...BASE_LOAD_EVENT,
      fetch: fakeOkFetch({ ok: true }),
      request: { headers: { get: () => null }, formData: async () => fd },
    });
    expect(result).toMatchObject({ ok: true });
  });
});

describe("routing actions.draftUpdate()", () => {
  test("calls the public draft update API and returns ok", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 13}`);
    const fd = new FormData();
    fd.set("draftId", "draft-001");
    fd.set("conditionsJson", JSON.stringify({ all: [] }));
    fd.set("actionAgent", "claude");
    const result = await mod.actions.draftUpdate({
      ...BASE_LOAD_EVENT,
      fetch: fakeOkFetch({ ok: true }),
      request: { headers: { get: () => null }, formData: async () => fd },
    });
    expect(result).toMatchObject({ ok: true });
  });
});

describe("routing actions.updateLlmGate()", () => {
  test("calls routing.config.updateLlmGate and returns ok", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 14}`);
    const fd = new FormData();
    fd.set("enabled", "true");
    fd.set("inputMode", "task_facts");
    const result = await mod.actions.updateLlmGate({
      ...BASE_LOAD_EVENT,
      fetch: fakeOkFetch({ ok: true }),
      request: { headers: { get: () => null }, formData: async () => fd },
    });
    expect(result).toMatchObject({ ok: true });
  });
});
