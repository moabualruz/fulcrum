import { beforeEach, describe, expect, mock, test } from "bun:test";

// The route delegates every operation to the data-portability public API
// (`createSettingsDataApiForEvent`). Mocking that seam keeps this a unit test:
// no TypeORM EntityManager, no database seeding.
const calls: Array<{ method: string; input?: unknown }> = [];

mock.module("$lib/server/settings-data-api", () => ({
  createSettingsDataApiForEvent: () => ({
    settingsData: {
      export: async (input: { kinds?: readonly string[] }) => {
        calls.push({ method: "settingsData.export", input });
        const output: Record<string, unknown[]> = {};
        for (const kind of input.kinds?.length ? input.kinds : ["projects", "tasks"]) output[kind] = [];
        return output;
      },
      preflightImport: async (input: { data?: unknown }) => {
        calls.push({ method: "settingsData.preflightImport", input });
        const data = input.data;
        return {
          preflightSummary: Object.fromEntries(
            Object.entries(data && typeof data === "object" ? (data as Record<string, unknown>) : {})
              .filter(([, value]) => Array.isArray(value))
              .map(([key, value]) => [key, (value as unknown[]).length]),
          ),
        };
      },
      import: async (input: { data?: unknown }) => {
        calls.push({ method: "settingsData.import", input });
        const data = input.data;
        return {
          imported: true,
          totalRows: Object.values(data && typeof data === "object" ? (data as Record<string, unknown>) : {})
            .reduce((total, value) => total + (Array.isArray(value) ? value.length : 0), 0),
        };
      },
    },
  }),
}));

beforeEach(() => {
  calls.splice(0, calls.length);
});

function makeEvent(body: Record<string, string | File | string[]>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(body)) {
    if (Array.isArray(v)) {
      for (const item of v) fd.append(k, item);
    } else {
      fd.set(k, v);
    }
  }
  const url = new URL("http://localhost/settings/data");
  return {
    url,
    locals: {},
    request: new Request(url, { method: "POST", body: fd }),
    fetch,
  };
}

describe("/settings/data actions", () => {
  test("export: returns JSON data and delegates to the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.actions.export(makeEvent({}) as Parameters<typeof mod.actions.export>[0]);
    expect(result).toMatchObject({ exported: true });
    expect(typeof result.data).toBe("string");
    const parsed = JSON.parse(result.data as string);
    expect(typeof parsed).toBe("object");
    expect(calls).toEqual([{ method: "settingsData.export", input: { kinds: [] } }]);
  });

  test("export: forwards only selected kinds to the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.actions.export(makeEvent({ kinds: ["projects"] }) as Parameters<typeof mod.actions.export>[0]);
    expect(result).toMatchObject({ exported: true });
    const parsed = JSON.parse(result.data as string);
    expect(Object.keys(parsed)).toContain("projects");
    expect(Object.keys(parsed)).not.toContain("tasks");
    expect(calls).toEqual([{ method: "settingsData.export", input: { kinds: ["projects"] } }]);
  });

  test("preflight: fails with no file before reaching the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.actions.preflight(makeEvent({}) as Parameters<typeof mod.actions.preflight>[0]);
    expect(result).toMatchObject({ status: 400 });
    expect(calls).toEqual([]);
  });

  test("preflight: fails with invalid JSON before reaching the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const file = new File(["bad"], "data.json", { type: "application/json" });
    const result = await mod.actions.preflight(makeEvent({ file }) as Parameters<typeof mod.actions.preflight>[0]);
    expect(result).toMatchObject({ status: 400 });
    expect(calls).toEqual([]);
  });

  test("preflight: returns entity counts from the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    const payload = JSON.stringify({ projects: [1, 2], tasks: [1] });
    const file = new File([payload], "data.json", { type: "application/json" });
    const result = await mod.actions.preflight(makeEvent({ file }) as Parameters<typeof mod.actions.preflight>[0]);
    expect(result).toMatchObject({ preflightSummary: { projects: 2, tasks: 1 } });
    expect(calls).toEqual([
      { method: "settingsData.preflightImport", input: { data: { projects: [1, 2], tasks: [1] } } },
    ]);
  });

  test("import: returns total rows from the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 5}`);
    const payload = JSON.stringify({ projects: [{ id: "1" }, { id: "2" }] });
    const file = new File([payload], "data.json", { type: "application/json" });
    const result = await mod.actions.import(makeEvent({ file }) as Parameters<typeof mod.actions.import>[0]);
    expect(result).toMatchObject({ imported: true, totalRows: 2 });
    expect(calls).toEqual([
      { method: "settingsData.import", input: { data: { projects: [{ id: "1" }, { id: "2" }] } } },
    ]);
  });

  test("page copy exposes dry-run state", async () => {
    const source = await Bun.file(new URL("./+page.svelte", import.meta.url)).text();
    expect(source).toContain("Dry run");
    expect(source).toContain("data-import-dry-run");
  });
});
