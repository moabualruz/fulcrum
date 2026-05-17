import { describe, it, expect, vi, beforeEach } from "vitest";

const scope = {
  em: { marker: "em" },
  ctx: { orgId: "org-1", userId: "user-1", projectId: "project-1" },
};
const mocks = {
  scope,
  requestServiceScope: vi.fn(async () => scope),
  createSettingsDataExport: vi.fn(async (_em, _ctx, input: { kinds?: readonly string[] }) => {
    const output: Record<string, unknown[]> = {};
    for (const kind of input.kinds?.length ? input.kinds : ["projects", "tasks"]) output[kind] = [];
    return output;
  }),
  preflightSettingsDataImport: vi.fn((input: unknown) => ({
    preflightSummary: Object.fromEntries(
      Object.entries(input && typeof input === "object" ? input as Record<string, unknown> : {})
        .filter(([, value]) => Array.isArray(value))
        .map(([key, value]) => [key, (value as unknown[]).length]),
    ),
  })),
  importSettingsData: vi.fn(async (_em, _ctx, input: unknown) => ({
    imported: true,
    totalRows: Object.values(input && typeof input === "object" ? input as Record<string, unknown> : {})
      .reduce((total, value) => total + (Array.isArray(value) ? value.length : 0), 0),
  })),
  SETTINGS_ENTITY_KINDS: ["projects", "tasks", "credentials", "feature_flags", "tenant_settings"] as const,
};

vi.mock("$lib/server/request-service-scope", () => ({
  requestServiceScope: mocks.requestServiceScope,
}));

vi.mock("@platform-core/interface/settings-workbench.ts", () => ({
  createSettingsDataExport: mocks.createSettingsDataExport,
  preflightSettingsDataImport: mocks.preflightSettingsDataImport,
  importSettingsData: mocks.importSettingsData,
  SETTINGS_ENTITY_KINDS: mocks.SETTINGS_ENTITY_KINDS,
}));

import { actions } from "./+page.server.js";

beforeEach(() => {
  vi.clearAllMocks();
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
    const result = await actions.export(makeRequest({}));
    expect(result).toMatchObject({ exported: true });
    expect(typeof result.data).toBe("string");
    const parsed = JSON.parse(result.data as string);
    expect(typeof parsed).toBe("object");
  });

  it("export: only selected kinds", async () => {
    const result = await actions.export(makeRequest({ kinds: ["projects"] }));
    expect(result).toMatchObject({ exported: true });
    const parsed = JSON.parse(result.data as string);
    expect(Object.keys(parsed)).toContain("projects");
    expect(Object.keys(parsed)).not.toContain("tasks");
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
