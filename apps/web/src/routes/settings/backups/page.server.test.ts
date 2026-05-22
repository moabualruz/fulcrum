import { beforeEach, describe, expect, mock, test } from "bun:test";

// The route delegates every operation to the data-portability public API
// (`createSettingsDataApiForEvent`). Mocking that seam keeps this a unit test:
// no TypeORM EntityManager, no database seeding.
const calls: Array<{ method: string; input?: unknown }> = [];

mock.module("$lib/server/settings-data-api", () => ({
  createSettingsDataApiForEvent: () => ({
    settingsBackups: {
      list: async () => {
        calls.push({ method: "settingsBackups.list" });
        return { backups: [] };
      },
      create: async () => {
        calls.push({ method: "settingsBackups.create" });
        return { success: true, id: "backup-1" };
      },
      preflight: async (input: { backupJson?: unknown }) => {
        calls.push({ method: "settingsBackups.preflight", input });
        const backup = input.backupJson;
        return {
          preflight: true,
          entityCounts: Object.fromEntries(
            Object.entries(backup && typeof backup === "object" ? (backup as Record<string, unknown>) : {})
              .filter(([, value]) => Array.isArray(value))
              .map(([key, value]) => [key, (value as unknown[]).length]),
          ),
        };
      },
      restore: async (input: unknown) => {
        calls.push({ method: "settingsBackups.restore", input });
        return { restored: true, message: "Restore complete" };
      },
    },
  }),
}));

beforeEach(() => {
  calls.splice(0, calls.length);
});

function makeEvent(body: Record<string, string | File>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(body)) fd.set(k, v);
  const url = new URL("http://localhost/settings/backups");
  return {
    url,
    locals: {},
    request: new Request(url, { method: "POST", body: fd }),
    fetch,
  };
}

describe("/settings/backups actions", () => {
  test("load streams the backup summaries from the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const url = new URL("http://localhost/settings/backups");
    const result = await mod.load({
      url,
      locals: {},
      request: new Request(url),
      fetch,
    } as Parameters<typeof mod.load>[0]);
    const stream = result.streamed.data;
    expect(stream).toBeInstanceOf(Promise);
    expect(await stream).toEqual({ backups: [] });
    expect(calls).toEqual([{ method: "settingsBackups.list" }]);
  });

  test("create: delegates backup creation to the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.actions.create(makeEvent({}) as Parameters<typeof mod.actions.create>[0]);
    expect(result).toMatchObject({ success: true });
    expect(result).toHaveProperty("id");
    expect(calls).toEqual([{ method: "settingsBackups.create" }]);
  });

  test("restore: fails with no file before reaching the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.actions.restore(makeEvent({}) as Parameters<typeof mod.actions.restore>[0]);
    expect(result).toMatchObject({ status: 400 });
    expect(calls).toEqual([]);
  });

  test("restore: fails with invalid JSON before reaching the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const file = new File(["not-json"], "backup.json", { type: "application/json" });
    const result = await mod.actions.restore(makeEvent({ file }) as Parameters<typeof mod.actions.restore>[0]);
    expect(result).toMatchObject({ status: 400 });
    expect(calls).toEqual([]);
  });

  test("restore: returns preflight entity counts from the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    const payload = JSON.stringify({ projects: [{ id: "1" }], tasks: [{ id: "2" }, { id: "3" }] });
    const file = new File([payload], "backup.json", { type: "application/json" });
    const result = await mod.actions.restore(makeEvent({ file }) as Parameters<typeof mod.actions.restore>[0]);
    expect(result).toMatchObject({ preflight: true, entityCounts: { projects: 1, tasks: 2 } });
    expect(calls).toEqual([
      {
        method: "settingsBackups.preflight",
        input: { backupJson: { projects: [{ id: "1" }], tasks: [{ id: "2" }, { id: "3" }] } },
      },
    ]);
  });

  test("confirmRestore: requires entity counts before reaching the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 5}`);
    const result = await mod.actions.confirmRestore(makeEvent({}) as Parameters<typeof mod.actions.confirmRestore>[0]);
    expect(result).toMatchObject({ status: 400 });
    expect(calls).toEqual([]);
  });

  test("confirmRestore: delegates the restore to the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 6}`);
    const result = await mod.actions.confirmRestore(
      makeEvent({ entityCounts: '{"projects":1}', backupJson: '{"projects":[{"id":"1"}]}' }) as Parameters<
        typeof mod.actions.confirmRestore
      >[0],
    );
    expect(result).toMatchObject({ restored: true, message: "Restore complete" });
    expect(calls).toEqual([
      { method: "settingsBackups.restore", input: { backupJson: { projects: [{ id: "1" }] } } },
    ]);
  });

  test("page copy exposes backup verify state", async () => {
    const source = await Bun.file(new URL("./+page.svelte", import.meta.url)).text();
    expect(source).toContain("Verify backup");
    expect(source).toContain("data-backup-verify");
  });
});
