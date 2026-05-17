import { describe, expect, test } from "bun:test";

import { run as runTasks } from "../commands/tasks.ts";
import { run as runDocs } from "../commands/docs.ts";
import { run as runSettings } from "../settings.ts";

describe("CLI E2E smoke with application callers", () => {
  test("tasks list uses injected application caller and prints JSON", async () => {
    const io = captureIo();
    await runTasks(["list", "--json"], {
      ...io.opts,
      caller: { tasks: { list: async () => [{ id: "task-1", title: "interface task" }] } },
    } as never);

    expect(JSON.parse(io.out[0]!)).toEqual([{ id: "task-1", title: "interface task" }]);
    expect(io.exits).toEqual([]);
  });

  test("tasks list routes through the configured public API", async () => {
    const io = captureIo();
    const calls: Array<{ url: string; method: string | undefined; body: unknown }> = [];

    await runTasks(["list", "--include-deleted", "--json"], {
      ...io.opts,
      env: {
        FULCRUM_SERVER_URL: "http://127.0.0.1:3210/",
        FULCRUM_ORG_ID: "org-1",
        FULCRUM_USER_ID: "user-1",
      },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(url),
          method: init?.method,
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        return Response.json([{ id: "task-public", title: "Public task" }]);
      }) as typeof fetch,
    });

    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:3210/api/v1/tasks?orgId=org-1&userId=user-1&include_deleted=true",
        method: "GET",
        body: null,
      },
    ]);
    expect(JSON.parse(io.out[0]!)).toEqual([{ id: "task-public", title: "Public task" }]);
    expect(io.exits).toEqual([]);
  });

  test("tasks list requires a configured public API without injected caller", async () => {
    const io = captureIo();

    await runTasks(["list", "--json"], {
      ...io.opts,
      env: {},
      fetch: (async () => {
        throw new Error("fetch should not run without API configuration");
      }) as unknown as typeof fetch,
    });

    expect(io.err.join("\n")).toContain("Task API caller is not configured");
    expect(io.exits).toEqual([1]);
  });

  test("docs list uses injected application caller and prints rows", async () => {
    const io = captureIo();
    await runDocs(["list", "--json"], {
      ...io.opts,
      caller: { docs: { list: async () => [{ id: "doc-1", title: "interface doc" }] } },
    } as never);

    expect(JSON.parse(io.out[0]!)).toEqual([{ id: "doc-1", title: "interface doc" }]);
    expect(io.exits).toEqual([]);
  });

  test("settings list uses injected application caller and prints JSON", async () => {
    const io = captureIo();
    await runSettings(["list", "--json"], {
      ...io.opts,
      caller: { settings: { list: async () => [{ key: "theme", value: "dark" }] } },
    } as never);

    expect(JSON.parse(io.out[0]!)).toEqual([{ key: "theme", value: "dark" }]);
    expect(io.exits).toEqual([]);
  });
});

function captureIo() {
  const out: string[] = [];
  const err: string[] = [];
  const exits: number[] = [];
  return {
    out,
    err,
    exits,
    opts: {
      print: (line: string) => out.push(line),
      printErr: (line: string) => err.push(line),
      exit: (code: number) => exits.push(code),
    },
  };
}
