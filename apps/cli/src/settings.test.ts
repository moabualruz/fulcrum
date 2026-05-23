import { describe, expect, test } from "bun:test";

describe("CLI settings command", () => {
  test("settings list --json prints a JSON array", async () => {
    const { run } = await import("./settings.ts");
    const output: string[] = [];
    await run(["list", "--json"], {
      caller: { settings: { list: async () => [{ key: "theme", value: "dark" }] } },
      print: (line: string) => output.push(line),
      printErr: () => {},
      exit: () => {},
    } as never);
    expect(JSON.parse(output[0]!)).toEqual([{ key: "theme", value: "dark" }]);
  });

  test("settings get prints a value", async () => {
    const { run } = await import("./settings.ts");
    const output: string[] = [];
    await run(["get", "theme"], {
      caller: { settings: { get: async () => ({ key: "theme", value: "dark" }) } },
      print: (line: string) => output.push(line),
      printErr: () => {},
      exit: () => {},
    } as never);
    expect(output[0]).toContain("theme");
    expect(output[0]).toContain("dark");
  });

  test("settings get missing key exits 1", async () => {
    const { run } = await import("./settings.ts");
    const exits: number[] = [];
    await run(["get", "missing"], {
      caller: { settings: { get: async () => null } },
      print: () => {},
      printErr: () => {},
      exit: (code: number) => exits.push(code),
    } as never);
    expect(exits).toEqual([1]);
  });

  test("settings set persists a value", async () => {
    const { run } = await import("./settings.ts");
    const output: string[] = [];
    await run(["set", "theme", "light", "--json"], {
      caller: { settings: { set: async () => ({ key: "theme", value: "light" }) } },
      print: (line: string) => output.push(line),
      printErr: () => {},
      exit: () => {},
    } as never);
    expect(JSON.parse(output[0]!)).toEqual({ key: "theme", value: "light" });
  });

  test("settings ai-assist get resolves user over org", async () => {
    const { run } = await import("./settings.ts");
    const output: string[] = [];
    const rows = new Map<string, unknown>([
      ["ai-assist.org", { value: JSON.stringify({ checkpointMode: "file", retentionDays: 60 }) }],
      ["ai-assist.user.user-1", { value: JSON.stringify({ checkpointMode: "git" }) }],
    ]);

    await run(["ai-assist", "get", "--user", "user-1", "--json"], {
      caller: { settings: { get: async ({ key }: { key: string }) => rows.get(key) ?? null } },
      print: (line: string) => output.push(line),
      printErr: () => {},
      exit: () => {},
    } as never);

    const parsed = JSON.parse(output[0]!);
    expect(parsed.checkpointMode).toEqual({ value: "git", source: "user" });
    expect(parsed.retentionDays).toEqual({ value: 60, source: "org" });
  });

  test("settings ai-assist set writes scoped preference", async () => {
    const { run } = await import("./settings.ts");
    const writes: unknown[] = [];
    const output: string[] = [];

    await run(["ai-assist", "set", "eventsTransport", "db-outbox", "--scope", "user", "--user", "user-1", "--json"], {
      caller: {
        settings: {
          get: async () => null,
          set: async (input: { key: string; value: string }) => {
            writes.push(input);
            return input;
          },
        },
      },
      print: (line: string) => output.push(line),
      printErr: () => {},
      exit: () => {},
    } as never);

    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ key: "ai-assist.user.user-1" });
    expect(JSON.parse((writes[0] as { value: string }).value).eventsTransport).toBe("db-outbox");
    expect(JSON.parse(output[0]!).eventsTransport).toBe("db-outbox");
  });

  test("settings list/get/set route through the configured public API", async () => {
    const { run } = await import("./settings.ts");
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const env = {
      FULCRUM_SERVER_URL: "http://127.0.0.1:3210/",
      FULCRUM_ORG_ID: "org-1",
      FULCRUM_USER_ID: "user-1",
    };
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      if (String(url).endsWith("/api/v1/settings?orgId=org-1&userId=user-1")) {
        return Response.json([{ key: "theme", value: "dark" }]);
      }
      if ((init?.method ?? "GET") === "PUT") {
        return Response.json({ key: "theme", value: "light" });
      }
      return Response.json({ key: "theme", value: "dark" });
    }) as typeof fetch;
    const output: string[] = [];

    await run(["list", "--json"], { env, fetch: fetchFn, print: (line) => output.push(line), printErr: () => {}, exit: () => {} });
    await run(["get", "theme", "--json"], { env, fetch: fetchFn, print: (line) => output.push(line), printErr: () => {}, exit: () => {} });
    await run(["set", "theme", "light", "--json"], { env, fetch: fetchFn, print: (line) => output.push(line), printErr: () => {}, exit: () => {} });

    expect(JSON.parse(output[0]!)).toEqual([{ key: "theme", value: "dark" }]);
    expect(JSON.parse(output[1]!)).toEqual({ key: "theme", value: "dark" });
    expect(JSON.parse(output[2]!)).toEqual({ key: "theme", value: "light" });
    expect(calls.map((call) => [call.init.method ?? "GET", call.url])).toEqual([
      ["GET", "http://127.0.0.1:3210/api/v1/settings?orgId=org-1&userId=user-1"],
      ["GET", "http://127.0.0.1:3210/api/v1/settings/theme?orgId=org-1&userId=user-1"],
      ["PUT", "http://127.0.0.1:3210/api/v1/settings/theme"],
    ]);
  });

  test("settings command requires the configured public API without injected caller", async () => {
    const { run } = await import("./settings.ts");
    const errors: string[] = [];
    const exits: number[] = [];

    await run(["list", "--json"], {
      print: () => {},
      printErr: (line) => errors.push(line),
      exit: (code: number) => exits.push(code),
    });

    expect(exits).toEqual([1]);
    expect(errors.join("\n")).toContain("Settings API caller is not configured");
  });

  test("settings set invalid arguments exit 2", async () => {
    const { run } = await import("./settings.ts");
    const exits: number[] = [];
    await run(["set", "theme"], {
      caller: { settings: {} },
      print: () => {},
      printErr: () => {},
      exit: (code: number) => exits.push(code),
    } as never);
    expect(exits).toEqual([2]);
  });

  test("settings ai-assist get resolves layered values with sources", async () => {
    const { run } = await import("./settings.ts");
    const output: string[] = [];
    const store = new Map<string, string>([
      ["ai-assist.org", JSON.stringify({ checkpointMode: "file", retentionCount: 50 })],
      ["ai-assist.user.u1", JSON.stringify({ checkpointMode: "git" })],
    ]);
    await run(["ai-assist", "get", "--user", "u1", "--json"], {
      caller: {
        settings: {
          get: async ({ key }: { key: string }) => store.has(key) ? { key, value: store.get(key) } : null,
          set: async () => ({}),
          list: async () => [],
        },
      },
      print: (line: string) => output.push(line),
      printErr: () => {},
      exit: () => {},
    } as never);
    const parsed = JSON.parse(output[0]!);
    expect(parsed.checkpointMode).toEqual({ value: "git", source: "user" });
    expect(parsed.retentionCount).toEqual({ value: 50, source: "org" });
    expect(parsed.eventsTransport).toEqual({ value: "memory", source: "default" });
  });

  test("settings ai-assist set --scope org writes a stringified payload", async () => {
    const { run } = await import("./settings.ts");
    const writes: Array<{ key: string; value: string }> = [];
    const output: string[] = [];
    await run(
      ["ai-assist", "set", "checkpointMode", "git", "--scope", "org", "--json"],
      {
        caller: {
          settings: {
            get: async () => null,
            set: async (input: { key: string; value: string }) => {
              writes.push(input);
              return input;
            },
            list: async () => [],
          },
        },
        print: (line: string) => output.push(line),
        printErr: () => {},
        exit: () => {},
      } as never,
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]?.key).toBe("ai-assist.org");
    const parsed = JSON.parse(writes[0]!.value);
    expect(parsed.checkpointMode).toBe("git");
    const out = JSON.parse(output[0]!);
    expect(out.checkpointMode).toBe("git");
  });

  test("settings ai-assist set --scope user requires --user", async () => {
    const { run } = await import("./settings.ts");
    const exits: number[] = [];
    await run(
      ["ai-assist", "set", "checkpointMode", "git", "--scope", "user"],
      {
        caller: {
          settings: {
            get: async () => null,
            set: async () => ({}),
            list: async () => [],
          },
        },
        env: {},
        print: () => {},
        printErr: () => {},
        exit: (code: number) => exits.push(code),
      } as never,
    );
    expect(exits).toEqual([2]);
  });
});
