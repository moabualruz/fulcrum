import { afterEach, describe, expect, test } from "bun:test";

import { run } from "./projects.ts";

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

const originalLog = console.log;
const originalError = console.error;

afterEach(() => {
  console.log = originalLog;
  console.error = originalError;
});

describe("fulcrum projects command", () => {
  test("routes hand-authored project commands through the configured public API", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined; body: unknown }> = [];
    const output: string[] = [];
    const errors: string[] = [];
    const fetchFn = (async (url: FetchInput, init?: FetchInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ url: String(url), init, body });
      if (init?.method === "POST") return Response.json({ id: "project-created", slug: body?.slug });
      if (init?.method === "PATCH") return Response.json({ id: "project-1", name: body?.name });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (String(url).endsWith("/stats?orgId=org-1")) return Response.json({ taskCount: 3, doneTaskCount: 1 });
      if (String(url).includes("/project-1")) return Response.json({ id: "project-1", name: "Project 1" });
      return Response.json({ data: [{ id: "project-1" }] });
    }) as unknown as typeof fetch;

    const options = {
      env: {
        FULCRUM_SERVER_URL: "http://127.0.0.1:3210/",
        FULCRUM_ORG_ID: "org-1",
      },
      fetch: fetchFn,
      print: (line: string) => output.push(line),
      printErr: (line: string) => errors.push(line),
      exit: (code: number) => {
        throw new Error(`exit ${code}`);
      },
    };

    await run(["list", "--json"], options);
    await run([
      "create",
      "--name",
      "Project 1",
      "--repo-path",
      "/tmp/project-1",
      "--template",
      "default",
      "--json",
    ], options);
    await run(["get", "project-1", "--json"], options);
    await run(["update", "project-1", "--name", "Project 1 revised", "--json"], options);
    await run(["stats", "project-1", "--json"], options);
    await run(["delete", "project-1", "--json"], options);

    expect(errors).toEqual([]);
    expect(requests.map((request) => [request.init?.method, request.url])).toEqual([
      ["GET", "http://127.0.0.1:3210/api/v1/projects?orgId=org-1"],
      ["POST", "http://127.0.0.1:3210/api/v1/projects"],
      ["GET", "http://127.0.0.1:3210/api/v1/projects/project-1?orgId=org-1"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/projects/project-1"],
      ["GET", "http://127.0.0.1:3210/api/v1/projects/project-1/stats?orgId=org-1"],
      ["DELETE", "http://127.0.0.1:3210/api/v1/projects/project-1?orgId=org-1"],
    ]);
    expect(requests[1]?.body).toMatchObject({
      orgId: "org-1",
      name: "Project 1",
      repoPath: "/tmp/project-1",
      template: "default",
    });
    expect(requests[3]?.body).toMatchObject({
      orgId: "org-1",
      name: "Project 1 revised",
    });
    expect(output.map((line) => JSON.parse(line))).toEqual([
      { data: [{ id: "project-1" }] },
      { id: "project-created" },
      { id: "project-1", name: "Project 1" },
      { id: "project-1", name: "Project 1 revised" },
      { taskCount: 3, doneTaskCount: 1 },
      null,
    ]);
  });

  test("requires a configured public API without injected caller", async () => {
    const output: string[] = [];
    const errors: string[] = [];
    let exitCode: number | undefined;

    await run(["list", "--json"], {
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
    expect(errors.join("\n")).toContain("Project API caller is not configured");
  });
});
