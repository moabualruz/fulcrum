import { describe, it, expect, vi, beforeEach } from "vitest";

const scope = {
  em: { marker: "em" },
  ctx: { orgId: "org-1", userId: "user-1", projectId: "project-1" },
};
const mocks = {
  scope,
  requestServiceScope: vi.fn(async () => scope),
  createSettingsBackup: vi.fn(async () => ({ success: true, id: "backup-1" })),
  preflightSettingsBackup: vi.fn((input: unknown) => ({
    preflight: true,
    entityCounts: Object.fromEntries(
      Object.entries(input && typeof input === "object" ? input as Record<string, unknown> : {})
        .filter(([, value]) => Array.isArray(value))
        .map(([key, value]) => [key, (value as unknown[]).length]),
    ),
  })),
  restoreSettingsBackup: vi.fn(async () => ({ restored: true, message: "Restore complete" })),
  listBackupSummaries: vi.fn(async () => ({ backups: [] })),
  summarizeImportManifest: vi.fn((input: unknown) => ({
    manifest: input && typeof input === "object" && (input as { format?: string }).format === "fulcrum.json-export.v1"
      ? input
      : null,
    summary: {},
  })),
};

vi.mock("$lib/server/request-service-scope", () => ({
  requestServiceScope: mocks.requestServiceScope,
}));

vi.mock("@platform-core/interface/settings-workbench.ts", () => ({
  createSettingsBackup: mocks.createSettingsBackup,
  preflightSettingsBackup: mocks.preflightSettingsBackup,
  restoreSettingsBackup: mocks.restoreSettingsBackup,
  listBackupSummaries: mocks.listBackupSummaries,
  summarizeImportManifest: mocks.summarizeImportManifest,
}));

import { actions } from "./+page.server.js";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRequest(body: Record<string, string | File>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(body)) fd.set(k, v);
  return { request: { formData: () => Promise.resolve(fd) } } as Parameters<typeof actions.restore>[0];
}

describe("/settings/backups actions", () => {
  it("create: inserts pending backup and returns id", async () => {
    const result = await actions.create({ request: { formData: async () => new FormData() } } as Parameters<typeof actions.create>[0]);
    expect(result).toMatchObject({ success: true });
    expect(result).toHaveProperty("id");
    expect(mocks.createSettingsBackup).toHaveBeenCalledWith(mocks.scope.em, mocks.scope.ctx);
  });

  it("restore: fails with no file", async () => {
    const result = await actions.restore(makeRequest({}));
    expect(result).toMatchObject({ status: 400 });
  });

  it("restore: fails with invalid JSON", async () => {
    const file = new File(["not-json"], "backup.json", { type: "application/json" });
    const result = await actions.restore(makeRequest({ file }));
    expect(result).toMatchObject({ status: 400 });
  });

  it("restore: returns preflight entity counts", async () => {
    const payload = JSON.stringify({ projects: [{ id: "1" }], tasks: [{ id: "2" }, { id: "3" }] });
    const file = new File([payload], "backup.json", { type: "application/json" });
    const result = await actions.restore(makeRequest({ file }));
    expect(result).toMatchObject({ preflight: true, entityCounts: { projects: 1, tasks: 2 } });
  });

  it("confirmRestore: returns restored: true", async () => {
    const result = await actions.confirmRestore(makeRequest({ entityCounts: '{"projects":1}' }));
    expect(result).toMatchObject({ restored: true, message: "Restore complete" });
  });

  it("page copy exposes backup verify state", async () => {
    const source = await Bun.file(new URL("./+page.svelte", import.meta.url)).text();
    expect(source).toContain("Verify backup");
    expect(source).toContain("data-backup-verify");
  });
});
