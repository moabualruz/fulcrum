import { beforeEach, describe, expect, mock, test } from "bun:test";

// The route delegates every operation to the credential public API
// (`createSettingsApiForEvent`). Mocking that seam keeps this a unit test:
// no TypeORM EntityManager, no database seeding.
const calls: Array<{ method: string; input?: unknown }> = [];

mock.module("$lib/server/settings-api", () => ({
  createSettingsApiForEvent: () => ({
    settingsSecrets: {
      list: async () => {
        calls.push({ method: "settingsSecrets.list" });
        return { credentials: [] };
      },
      add: async (input: unknown) => {
        calls.push({ method: "settingsSecrets.add", input });
        return { success: true };
      },
      rotate: async (input: unknown) => {
        calls.push({ method: "settingsSecrets.rotate", input });
        return { success: true };
      },
      archive: async (input: unknown) => {
        calls.push({ method: "settingsSecrets.archive", input });
        return { success: true };
      },
      delete: async (input: unknown) => {
        calls.push({ method: "settingsSecrets.delete", input });
        return { success: true };
      },
    },
  }),
}));

beforeEach(() => {
  calls.splice(0, calls.length);
});

function makeEvent(body: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(body)) fd.set(k, v);
  const url = new URL("http://localhost/settings/secrets");
  return {
    url,
    locals: {},
    request: new Request(url, { method: "POST", body: fd }),
    fetch,
  };
}

describe("/settings/secrets actions", () => {
  test("load streams the credential list from the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const url = new URL("http://localhost/settings/secrets");
    const result = await mod.load({
      url,
      locals: {},
      request: new Request(url),
      fetch,
    } as Parameters<typeof mod.load>[0]);
    const stream = result.streamed.data;
    expect(stream).toBeInstanceOf(Promise);
    expect(await stream).toEqual({ credentials: [] });
    expect(calls).toEqual([{ method: "settingsSecrets.list" }]);
  });

  test("add: requires name and value before reaching the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.actions.add(makeEvent({ name: "", value: "" }) as Parameters<typeof mod.actions.add>[0]);
    expect(result).toMatchObject({ status: 400 });
    expect(calls).toEqual([]);
  });

  test("add: delegates credential insert to the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.actions.add(
      makeEvent({ name: "MY_KEY", value: "secret123", provider: "aws" }) as Parameters<typeof mod.actions.add>[0],
    );
    expect(result).toMatchObject({ success: true });
    expect(calls).toEqual([
      { method: "settingsSecrets.add", input: { name: "MY_KEY", value: "secret123", provider: "aws" } },
    ]);
  });

  test("rotate: requires id and value before reaching the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.actions.rotate(makeEvent({ id: "", value: "" }) as Parameters<typeof mod.actions.rotate>[0]);
    expect(result).toMatchObject({ status: 400 });
    expect(calls).toEqual([]);
  });

  test("rotate: delegates value rotation to the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    const result = await mod.actions.rotate(
      makeEvent({ id: "abc", value: "newvalue" }) as Parameters<typeof mod.actions.rotate>[0],
    );
    expect(result).toMatchObject({ success: true });
    expect(calls).toEqual([{ method: "settingsSecrets.rotate", input: { id: "abc", value: "newvalue" } }]);
  });

  test("archive: delegates archive toggle to the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 5}`);
    const result = await mod.actions.archive(makeEvent({ id: "abc" }) as Parameters<typeof mod.actions.archive>[0]);
    expect(result).toMatchObject({ success: true });
    expect(calls).toEqual([{ method: "settingsSecrets.archive", input: { id: "abc" } }]);
  });

  test("delete: delegates row removal to the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 6}`);
    const result = await mod.actions.delete(makeEvent({ id: "abc" }) as Parameters<typeof mod.actions.delete>[0]);
    expect(result).toMatchObject({ success: true });
    expect(calls).toEqual([{ method: "settingsSecrets.delete", input: { id: "abc" } }]);
  });

  test("add: route delegates plaintext handling to the credential API only", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 7}`);
    await mod.actions.add(
      makeEvent({ name: "TEST", value: "plaintext-secret", provider: "" }) as Parameters<typeof mod.actions.add>[0],
    );
    expect(calls).toEqual([
      { method: "settingsSecrets.add", input: { name: "TEST", value: "plaintext-secret", provider: "" } },
    ]);
  });
});
