import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  query: vi.fn(),
  close: vi.fn(),
};
vi.mock("$lib/server/db", () => ({
  openIsolatedStore: vi.fn(() => Promise.resolve(mockDb)),
}));

import { actions } from "./+page.server.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.query.mockResolvedValue([]);
  mockDb.close.mockResolvedValue(undefined);
});

function makeRequest(body: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(body)) fd.set(k, v);
  return { request: { formData: () => Promise.resolve(fd) } } as Parameters<typeof actions.toggle>[0];
}

describe("/settings/feature-flags actions", () => {
  it("toggle: requires id", async () => {
    const result = await actions.toggle(makeRequest({}));
    expect(result).toMatchObject({ status: 400 });
  });

  it("toggle: flips enabled", async () => {
    const result = await actions.toggle(makeRequest({ id: "flag-1" }));
    expect(result).toMatchObject({ success: true });
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("enabled = NOT enabled"),
      ["flag-1"],
    );
  });

  it("setRollout: rejects invalid percent", async () => {
    const result = await actions.setRollout(makeRequest({ id: "flag-1", rollout_percent: "150" }));
    expect(result).toMatchObject({ status: 400 });
  });

  it("setRollout: saves rollout_percent", async () => {
    const result = await actions.setRollout(makeRequest({ id: "flag-1", rollout_percent: "50" }));
    expect(result).toMatchObject({ success: true });
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("rollout_percent"),
      [50, "flag-1"],
    );
  });

  it("setCohortRules: rejects invalid JSON", async () => {
    const result = await actions.setCohortRules(makeRequest({ id: "flag-1", cohort_rules: "notjson" }));
    expect(result).toMatchObject({ status: 400 });
  });

  it("setCohortRules: saves valid JSON", async () => {
    const result = await actions.setCohortRules(makeRequest({ id: "flag-1", cohort_rules: '{"users":["alice"]}' }));
    expect(result).toMatchObject({ success: true });
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("cohort_rules"),
      expect.arrayContaining(["flag-1"]),
    );
  });
});
