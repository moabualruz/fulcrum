import { describe, it, expect, vi, beforeEach } from "vitest";

const scope = {
  em: { marker: "em" },
  ctx: { orgId: "org-1", userId: "user-1", projectId: "project-1" },
};
const mocks = {
  scope,
  requestServiceScope: vi.fn(async () => scope),
  addSettingsSecret: vi.fn(async () => ({ success: true })),
  rotateSettingsSecret: vi.fn(async () => ({ success: true })),
  toggleSettingsSecretArchive: vi.fn(async () => ({ success: true })),
  deleteSettingsSecret: vi.fn(async () => ({ success: true })),
  listSettingsSecrets: vi.fn(async () => ({ credentials: [] })),
};

vi.mock("$lib/server/request-service-scope", () => ({
  requestServiceScope: mocks.requestServiceScope,
}));

vi.mock("@platform-core/interface/settings-workbench.ts", () => ({
  addSettingsSecret: mocks.addSettingsSecret,
  rotateSettingsSecret: mocks.rotateSettingsSecret,
  toggleSettingsSecretArchive: mocks.toggleSettingsSecretArchive,
  deleteSettingsSecret: mocks.deleteSettingsSecret,
  listSettingsSecrets: mocks.listSettingsSecrets,
}));

import { actions } from "./+page.server.js";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRequest(body: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(body)) fd.set(k, v);
  return { request: { formData: () => Promise.resolve(fd) } } as Parameters<typeof actions.add>[0];
}

describe("/settings/secrets actions", () => {
  it("add: requires name and value", async () => {
    const result = await actions.add(makeRequest({ name: "", value: "" }));
    expect(result).toMatchObject({ status: 400 });
  });

  it("add: inserts credential", async () => {
    const result = await actions.add(makeRequest({ name: "MY_KEY", value: "secret123", provider: "aws" }));
    expect(result).toMatchObject({ success: true });
    expect(mocks.addSettingsSecret).toHaveBeenCalledWith(mocks.scope.em, mocks.scope.ctx, {
      name: "MY_KEY",
      value: "secret123",
      provider: "aws",
    });
  });

  it("rotate: requires id and value", async () => {
    const result = await actions.rotate(makeRequest({ id: "", value: "" }));
    expect(result).toMatchObject({ status: 400 });
  });

  it("rotate: updates value_hash and last_used_at", async () => {
    const result = await actions.rotate(makeRequest({ id: "abc", value: "newvalue" }));
    expect(result).toMatchObject({ success: true });
    expect(mocks.rotateSettingsSecret).toHaveBeenCalledWith(mocks.scope.em, mocks.scope.ctx, {
      id: "abc",
      value: "newvalue",
    });
  });

  it("archive: toggles archived", async () => {
    const result = await actions.archive(makeRequest({ id: "abc" }));
    expect(result).toMatchObject({ success: true });
    expect(mocks.toggleSettingsSecretArchive).toHaveBeenCalledWith(mocks.scope.em, mocks.scope.ctx, { id: "abc" });
  });

  it("delete: removes row", async () => {
    const result = await actions.delete(makeRequest({ id: "abc" }));
    expect(result).toMatchObject({ success: true });
    expect(mocks.deleteSettingsSecret).toHaveBeenCalledWith(mocks.scope.em, mocks.scope.ctx, { id: "abc" });
  });

  it("add: route delegates plaintext handling to settings service only", async () => {
    await actions.add(makeRequest({ name: "TEST", value: "plaintext-secret", provider: "" }));
    expect(mocks.addSettingsSecret).toHaveBeenCalledTimes(1);
    expect(mocks.rotateSettingsSecret).not.toHaveBeenCalled();
    expect(mocks.deleteSettingsSecret).not.toHaveBeenCalled();
  });
});
