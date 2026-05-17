import { describe, it, expect, vi, beforeEach } from "vitest";

const scope = {
  em: { marker: "em" },
  ctx: { orgId: "org-1", userId: "user-1", projectId: "project-1" },
};
const mocks = {
  scope,
  requestServiceScope: vi.fn(async () => scope),
  toggleSettingsFeatureFlag: vi.fn(async () => ({ success: true })),
  setSettingsFeatureFlagRollout: vi.fn(async () => ({ success: true })),
  setSettingsFeatureFlagCohortRules: vi.fn(async () => ({ success: true })),
  listSettingsFeatureFlags: vi.fn(async () => ({ flags: [] })),
};

vi.mock("$lib/server/request-service-scope", () => ({
  requestServiceScope: mocks.requestServiceScope,
}));

vi.mock("@platform-core/interface/settings-workbench.ts", () => ({
  toggleSettingsFeatureFlag: mocks.toggleSettingsFeatureFlag,
  setSettingsFeatureFlagRollout: mocks.setSettingsFeatureFlagRollout,
  setSettingsFeatureFlagCohortRules: mocks.setSettingsFeatureFlagCohortRules,
  listSettingsFeatureFlags: mocks.listSettingsFeatureFlags,
}));

import { actions } from "./+page.server.js";

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(mocks.toggleSettingsFeatureFlag).toHaveBeenCalledWith(mocks.scope.em, mocks.scope.ctx, { id: "flag-1" });
  });

  it("setRollout: rejects invalid percent", async () => {
    const result = await actions.setRollout(makeRequest({ id: "flag-1", rollout_percent: "150" }));
    expect(result).toMatchObject({ status: 400 });
  });

  it("setRollout: saves rollout_percent", async () => {
    const result = await actions.setRollout(makeRequest({ id: "flag-1", rollout_percent: "50" }));
    expect(result).toMatchObject({ success: true });
    expect(mocks.setSettingsFeatureFlagRollout).toHaveBeenCalledWith(mocks.scope.em, mocks.scope.ctx, {
      id: "flag-1",
      rolloutPercent: 50,
    });
  });

  it("setCohortRules: rejects invalid JSON", async () => {
    const result = await actions.setCohortRules(makeRequest({ id: "flag-1", cohort_rules: "notjson" }));
    expect(result).toMatchObject({ status: 400 });
  });

  it("setCohortRules: saves valid JSON", async () => {
    const result = await actions.setCohortRules(makeRequest({ id: "flag-1", cohort_rules: '{"users":["alice"]}' }));
    expect(result).toMatchObject({ success: true });
    expect(mocks.setSettingsFeatureFlagCohortRules).toHaveBeenCalledWith(mocks.scope.em, mocks.scope.ctx, {
      id: "flag-1",
      rules: { users: ["alice"] },
    });
  });
});
