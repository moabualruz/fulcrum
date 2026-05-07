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
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO backups"),
      expect.any(Array),
    );
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
