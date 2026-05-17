import { describe, expect, test } from "bun:test";

import { run } from "@fulcrum/cli/commands/work.ts";

describe("work CLI command", () => {
  test("routes work commands through configured public APIs", async () => {
    const calls: Array<{ url: string; method: string | undefined; body: unknown }> = [];
    const output: string[] = [];
    const errors: string[] = [];

    const options = {
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
        const text = String(url);
        if (text.includes("/relationships/create")) return Response.json({ id: "rel-1" });
        if (text.includes("/reports/burndown")) return Response.json({ done: 1, total: 2 });
        if (init?.method === "POST") return Response.json({ id: "task-created" });
        if (init?.method === "PATCH") return Response.json({ id: "task-1", status: "done" });
        return Response.json({ id: "task-1", title: "Task 1" });
      }) as typeof fetch,
      print: (line: string) => output.push(line),
      printErr: (line: string) => errors.push(line),
      exit: (code: number) => {
        throw new Error(`unexpected exit ${code}`);
      },
    };

    await run(["create", "--title", "Task 1", "--project", "project-1", "--json"], options);
    await run(["inspect", "task-1", "--json"], options);
    await run(["move", "task-1", "--status", "done", "--json"], options);
    await run(["link", "task-1", "--to", "task-2", "--type", "blocks", "--json"], options);
    await run(["report", "--project", "project-1", "--json"], options);

    expect(errors).toEqual([]);
    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:3210/api/v1/tasks?orgId=org-1&userId=user-1",
        method: "POST",
        body: { title: "Task 1", projectId: "project-1", orgId: "org-1", userId: "user-1" },
      },
      {
        url: "http://127.0.0.1:3210/api/v1/tasks/task-1?orgId=org-1&userId=user-1",
        method: "GET",
        body: null,
      },
      {
        url: "http://127.0.0.1:3210/api/v1/tasks/task-1?orgId=org-1&userId=user-1",
        method: "PATCH",
        body: { status: "done", orgId: "org-1", userId: "user-1" },
      },
      {
        url: "http://127.0.0.1:3210/api/v1/relationships/create",
        method: "POST",
        body: { orgId: "org-1", sourceTaskId: "task-1", targetTaskId: "task-2", type: "blocks" },
      },
      {
        url: "http://127.0.0.1:3210/api/v1/reports/burndown?orgId=org-1&projectId=project-1",
        method: "GET",
        body: null,
      },
    ]);
    expect(output.map((line) => JSON.parse(line))).toEqual([
      { id: "task-created" },
      { id: "task-1", title: "Task 1" },
      { id: "task-1", status: "done" },
      { id: "rel-1" },
      { done: 1, total: 2 },
    ]);
  });

  test("requires configured public APIs without injected caller", async () => {
    const output: string[] = [];
    const errors: string[] = [];
    let exitCode: number | undefined;

    await run(["inspect", "task-1", "--json"], {
      env: {},
      fetch: (async () => {
        throw new Error("fetch should not run without API configuration");
      }) as unknown as typeof fetch,
      print: (line: string) => output.push(line),
      printErr: (line: string) => errors.push(line),
      exit: (code: number) => {
        exitCode = code;
      },
    });

    expect(output).toEqual([]);
    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toContain("Work API callers are not configured");
  });
});
