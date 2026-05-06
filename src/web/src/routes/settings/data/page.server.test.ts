import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  query: vi.fn(),
  close: vi.fn(),
};
vi.mock("$lib/server/db", () => ({
  openProductDb: vi.fn(() => Promise.resolve(mockDb)),
}));

import { actions } from "./+page.server.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.query.mockResolvedValue([]);
  mockDb.close.mockResolvedValue(undefined);
});

function makeRequest(body: Record<string, string | File | string[]>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(body)) {
    if (Array.isArray(v)) {
      for (const item of v) fd.append(k, item);
    } else {
      fd.set(k, v);
    }
  }
  return { request: { formData: () => Promise.resolve(fd) } } as Parameters<typeof actions.preflight>[0];
}

describe("/settings/data actions", () => {
  it("export: returns JSON data", async () => {
    mockDb.query.mockResolvedValue([{ id: "1", name: "test" }]);
    const result = await actions.export(makeRequest({}));
    expect(result).toMatchObject({ exported: true });
    expect(typeof result.data).toBe("string");
    const parsed = JSON.parse(result.data as string);
    expect(typeof parsed).toBe("object");
  });

  it("export: only selected kinds", async () => {
    mockDb.query.mockResolvedValue([]);
    const result = await actions.export(makeRequest({ kinds: ["projects"] }));
    expect(result).toMatchObject({ exported: true });
    const parsed = JSON.parse(result.data as string);
    expect(Object.keys(parsed)).toContain("projects");
  });

  it("preflight: fails with no file", async () => {
    const result = await actions.preflight(makeRequest({}));
    expect(result).toMatchObject({ status: 400 });
  });

  it("preflight: fails with invalid JSON", async () => {
    const file = new File(["bad"], "data.json", { type: "application/json" });
    const result = await actions.preflight(makeRequest({ file }));
    expect(result).toMatchObject({ status: 400 });
  });

  it("preflight: returns entity counts", async () => {
    const payload = JSON.stringify({ projects: [1, 2], tasks: [1] });
    const file = new File([payload], "data.json", { type: "application/json" });
    const result = await actions.preflight(makeRequest({ file }));
    expect(result).toMatchObject({ preflightSummary: { projects: 2, tasks: 1 } });
  });

  it("import: returns total rows", async () => {
    const payload = JSON.stringify({ projects: [{ id: "1" }, { id: "2" }] });
    const file = new File([payload], "data.json", { type: "application/json" });
    const result = await actions.import(makeRequest({ file }));
    expect(result).toMatchObject({ imported: true, totalRows: 2 });
  });

  it("page copy exposes dry-run state", async () => {
    const source = await Bun.file(new URL("./+page.svelte", import.meta.url)).text();
    expect(source).toContain("Dry run");
    expect(source).toContain("data-import-dry-run");
  });
});
