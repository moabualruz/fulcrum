import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run as runArtifact } from "../../apps/cli/src/artifact.ts";
import { run as runComment } from "../../apps/cli/src/commands/comment.ts";
import { run as runMyWork } from "../../apps/cli/src/commands/my-work.ts";
import { run as runProjectConfig } from "../../apps/cli/src/commands/project-config.ts";
import { run as runTaskHierarchy } from "../../apps/cli/src/commands/task-hierarchy.ts";
import { run as runTaskRelate } from "../../apps/cli/src/commands/task-relate.ts";
import { formatConnectorRuns, formatConnectorsList, run as runConnectors } from "../../apps/cli/src/connectors.ts";
import { run as runCsvExport } from "../../apps/cli/src/export.ts";
import { run as runCsvImport } from "../../apps/cli/src/import.ts";
import { run as runNotify } from "../../apps/cli/src/notify.ts";
import { run as runSymphony, stubCaller, type SymphonyCaller } from "../../apps/cli/src/symphony.ts";

function io() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exits: number[] = [];
  return {
    stdout,
    stderr,
    exits,
    opts: {
      print: (line: string) => stdout.push(line),
      printErr: (line: string) => stderr.push(line),
      exit: (code: number) => exits.push(code),
    },
  };
}

describe("artifact CLI source", () => {
  it("lists, shows, validates, and reports artifact command errors", async () => {
    const calls: unknown[] = [];
    const caller = {
      artifacts: {
        list: async () => [{ id: "a1", filename: "log.txt" }],
        get: async (input: { id: string }) => {
          calls.push(input);
          return { id: input.id, filename: "log.txt" };
        },
      },
    };
    const a = io();
    await runArtifact(["list"], { caller, ...a.opts });
    await runArtifact(["list", "--json"], { caller, ...a.opts });
    await runArtifact(["show", "a1"], { caller, ...a.opts });
    await runArtifact(["show"], { caller, ...a.opts });
    await runArtifact(["show", "a1", "--bad"], { caller, ...a.opts });
    await runArtifact(["wat"], { caller, ...a.opts });

    expect(a.stdout.join("\n")).toContain("log.txt\ta1");
    expect(a.stdout.join("\n")).toContain("\"filename\": \"log.txt\"");
    expect(calls).toEqual([{ id: "a1" }]);
    expect(a.stderr.join("\n")).toContain("usage: fulcrum artifact show <id>");
    expect(a.stderr.join("\n")).toContain("unknown flag: --bad");
    expect(a.stderr.join("\n")).toContain("unknown verb 'wat'");
    expect(a.exits).toEqual([2, 2, 2]);
  });

  it("routes artifact list and show through the configured public API", async () => {
    const calls: Array<{ url: string; method: string | undefined }> = [];
    const a = io();
    await runArtifact(["list", "--json"], {
      ...a.opts,
      env: { FULCRUM_SERVER_URL: "http://127.0.0.1:3210/" },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), method: init?.method });
        return Response.json([{ id: "artifact-1", filename: "artifact.txt" }]);
      }) as typeof fetch,
    });
    await runArtifact(["show", "artifact-1", "--json"], {
      ...a.opts,
      env: { FULCRUM_SERVER_URL: "http://127.0.0.1:3210/" },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), method: init?.method });
        return Response.json({ id: "artifact-1", filename: "artifact.txt" });
      }) as typeof fetch,
    });

    expect(calls).toEqual([
      { method: "GET", url: "http://127.0.0.1:3210/api/v1/artifacts" },
      { method: "GET", url: "http://127.0.0.1:3210/api/v1/artifacts/artifact-1" },
    ]);
    expect(JSON.parse(a.stdout[0] as string)).toEqual([{ id: "artifact-1", filename: "artifact.txt" }]);
    expect(JSON.parse(a.stdout[1] as string)).toEqual({ id: "artifact-1", filename: "artifact.txt" });
  });

  it("requires the configured artifact public API when no caller is injected", async () => {
    const a = io();
    await runArtifact(["list", "--json"], {
      ...a.opts,
      env: {},
      fetch: (async () => {
        throw new Error("unexpected fetch");
      }) as unknown as typeof fetch,
    });

    expect(a.exits).toEqual([1]);
    expect(a.stderr.join("\n")).toContain("Artifact API caller is not configured");
  });
});

describe("connectors CLI source", () => {
  it("formats connector lists and runs and handles command validation", async () => {
    expect(formatConnectorsList([], false)).toBe("No connectors configured.");
    expect(formatConnectorsList([{ kind: "linear", enabled: true, lastSyncAt: null }], false)).toContain("linear  ON");
    expect(formatConnectorRuns([], false)).toBe("No runs found.");
    expect(formatConnectorRuns([{ kind: "linear", status: "done", started_at: "now", records_synced: 3 }], false)).toContain("3 records");

    const caller = {
      connectors: {
        list: async () => [{ kind: "linear", enabled: false, lastSyncAt: "today" }],
        runs: { list: async () => [{ kind: "linear", status: "ok", startedAt: "now", recordsSynced: 1 }] },
      },
    };
    const c = io();
    await runConnectors(["help"], { caller, ...c.opts });
    await runConnectors(["list"], { caller, ...c.opts });
    await runConnectors(["list", "--json"], { caller, ...c.opts });
    await runConnectors(["runs", "linear"], { caller, ...c.opts });
    await runConnectors(["runs"], { caller, ...c.opts });
    await runConnectors(["list", "--bad"], { caller, ...c.opts });
    await runConnectors(["wat"], { caller, ...c.opts });

    expect(c.stdout.join("\n")).toContain("usage: fulcrum connectors");
    expect(c.stdout.join("\n")).toContain("linear  OFF");
    expect(c.stdout.join("\n")).toContain("\"kind\": \"linear\"");
    expect(c.stderr.join("\n")).toContain("usage: fulcrum connectors runs <kind>");
    expect(c.stderr.join("\n")).toContain("unknown flag: --bad");
    expect(c.exits).toEqual([2, 2, 2]);
  });

  it("routes connector list and runs through the configured public API", async () => {
    const calls: Array<{ url: string; method: string | undefined }> = [];
    const c = io();
    await runConnectors(["list", "--json"], {
      ...c.opts,
      env: {
        FULCRUM_SERVER_URL: "http://127.0.0.1:3210/",
        FULCRUM_ORG_ID: "org-1",
      },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), method: init?.method });
        return Response.json([{ kind: "linear", enabled: true, lastSyncAt: null }]);
      }) as typeof fetch,
    });
    await runConnectors(["runs", "linear", "--json"], {
      ...c.opts,
      env: {
        FULCRUM_SERVER_URL: "http://127.0.0.1:3210/",
        FULCRUM_ORG_ID: "org-1",
      },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), method: init?.method });
        return Response.json([{ kind: "linear", status: "queued", recordsSynced: 1 }]);
      }) as typeof fetch,
    });

    expect(calls).toEqual([
      { method: "GET", url: "http://127.0.0.1:3210/api/v1/connectors?orgId=org-1" },
      { method: "GET", url: "http://127.0.0.1:3210/api/v1/connector-runs?orgId=org-1&connectorId=linear" },
    ]);
    expect(JSON.parse(c.stdout[0] as string)).toEqual([{ kind: "linear", enabled: true, lastSyncAt: null }]);
    expect(JSON.parse(c.stdout[1] as string)).toEqual([{ kind: "linear", status: "queued", recordsSynced: 1 }]);
  });

  it("requires the configured connector public API when no caller is injected", async () => {
    const c = io();
    await runConnectors(["list", "--json"], {
      ...c.opts,
      env: {},
      fetch: (async () => {
        throw new Error("unexpected fetch");
      }) as unknown as typeof fetch,
    });

    expect(c.exits).toEqual([1]);
    expect(c.stderr.join("\n")).toContain("Connector API caller is not configured");
  });
});

describe("CSV import and export CLI source", () => {
  it("routes task export through the configured task public API", async () => {
    const c = io();
    const calls: Array<{ url: string; init: RequestInit }> = [];
    await runCsvExport(["tasks", "--project", "project-1", "--json"], {
      ...c.opts,
      env: {
        FULCRUM_SERVER_URL: "http://127.0.0.1:3210/",
        FULCRUM_ORG_ID: "org-1",
        FULCRUM_USER_ID: "user-1",
      },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return Response.json([{ id: "task-1", title: "Ship API" }]);
      }) as unknown as typeof globalThis.fetch,
    });

    expect(c.exits).toEqual([]);
    expect(JSON.parse(c.stdout[0] as string)).toEqual([{ id: "task-1", title: "Ship API" }]);
    expect(calls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:3210/api/v1/tasks?orgId=org-1&userId=user-1&projectId=project-1",
    ]);
  });

  it("routes CSV import through the configured task public API", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fulcrum-csv-import-"));
    try {
      const csvPath = join(dir, "tasks.csv");
      const csv = "title,status\nImported task,todo\n";
      await writeFile(csvPath, csv, "utf8");
      const c = io();
      const calls: Array<{ url: string; body: unknown }> = [];

      await runCsvImport(["csv", "--project", "project-1", "--file", csvPath, "--json"], {
        ...c.opts,
        env: {
          FULCRUM_PUBLIC_API_URL: "http://127.0.0.1:4321/base/",
          FULCRUM_ORG_ID: "org-1",
          FULCRUM_USER_ID: "user-1",
        },
        fetch: (async (url: string | URL | Request, init?: RequestInit) => {
          calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
          return Response.json({ created: 1, skipped: 0, errors: [] });
        }) as unknown as typeof globalThis.fetch,
      });

      expect(c.exits).toEqual([]);
      expect(JSON.parse(c.stdout[0] as string)).toEqual({ imported: 1, projectId: "project-1" });
      expect(calls).toEqual([
        {
          url: "http://127.0.0.1:4321/api/v1/connectors/import-csv?orgId=org-1&userId=user-1",
          body: { entity: "tasks", projectId: "project-1", csv },
        },
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("requires the configured task public API when no caller is injected", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fulcrum-csv-import-config-"));
    try {
      const csvPath = join(dir, "tasks.csv");
      await writeFile(csvPath, "title,status\nImported task,todo\n", "utf8");
      const exportRun = io();
      await runCsvExport(["tasks", "--project", "project-1", "--json"], { ...exportRun.opts, env: {} });
      const importRun = io();
      await runCsvImport(["csv", "--project", "project-1", "--file", csvPath, "--json"], {
        ...importRun.opts,
        env: {},
      });

      expect(exportRun.exits).toEqual([1]);
      expect(exportRun.stderr.join("\n")).toContain("Task API caller is not configured");
      expect(importRun.exits).toEqual([1]);
      expect(importRun.stderr.join("\n")).toContain("Task API caller is not configured");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("task hierarchy and my-work CLI source", () => {
  it("routes task hierarchy list through the configured task public API", async () => {
    const t = io();
    const calls: Array<{ url: string; method: string | undefined }> = [];
    await runTaskHierarchy(["list", "--type", "bug", "--parent", "parent-1"], {
      ...t.opts,
      env: {
        FULCRUM_SERVER_URL: "http://127.0.0.1:3210/",
        FULCRUM_ORG_ID: "org-1",
        FULCRUM_USER_ID: "user-1",
      },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), method: init?.method });
        return Response.json({
          listRows: [
            {
              id: "task-1",
              title: "Fix hierarchy",
              taskType: "bug",
              status: "todo",
              parentId: "parent-1",
            },
            {
              id: "task-2",
              title: "Other parent",
              taskType: "bug",
              status: "todo",
              parentId: "other-parent",
            },
          ],
        });
      }) as unknown as typeof fetch,
    });

    expect(calls).toEqual([
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/tasks/manual-workbench?orgId=org-1&userId=user-1&viewMode=list&taskTypes=bug",
      },
    ]);
    expect(t.stdout.join("\n")).toContain("Fix hierarchy");
    expect(t.stdout.join("\n")).not.toContain("Other parent");
    expect(t.exits).toEqual([]);
  });

  it("routes task archive through the configured task public API delete endpoint", async () => {
    const t = io();
    const calls: Array<{ url: string; method: string | undefined }> = [];
    await runTaskHierarchy(["archive", "task-1"], {
      ...t.opts,
      env: {
        FULCRUM_SERVER_URL: "http://127.0.0.1:3210/",
        FULCRUM_ORG_ID: "org-1",
        FULCRUM_USER_ID: "user-1",
      },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), method: init?.method });
        return new Response(null, { status: 204 });
      }) as unknown as typeof fetch,
    });

    expect(calls).toEqual([
      {
        method: "DELETE",
        url: "http://127.0.0.1:3210/api/v1/tasks/task-1?orgId=org-1&userId=user-1",
      },
    ]);
    expect(t.stdout.join("\n")).toContain("Archived task task-1");
    expect(t.exits).toEqual([]);
  });

  it("routes my-work through the configured task public API and filters the current user", async () => {
    const m = io();
    const calls: Array<{ url: string; method: string | undefined }> = [];
    await runMyWork(["--json"], {
      ...m.opts,
      env: {
        FULCRUM_SERVER_URL: "http://127.0.0.1:3210/",
        FULCRUM_ORG_ID: "org-1",
        FULCRUM_USER_ID: "user-1",
      },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), method: init?.method });
        return Response.json([
          { id: "task-1", title: "Mine", assigneeId: "user-1" },
          { id: "task-2", title: "Not mine", assigneeId: "user-2" },
        ]);
      }) as unknown as typeof fetch,
    });

    expect(calls).toEqual([
      { method: "GET", url: "http://127.0.0.1:3210/api/v1/tasks?orgId=org-1&userId=user-1" },
    ]);
    expect(JSON.parse(m.stdout[0] as string)).toEqual([{ id: "task-1", title: "Mine", assigneeId: "user-1" }]);
    expect(m.exits).toEqual([]);
  });

  it("requires the configured task public API when no task hierarchy or my-work caller is injected", async () => {
    const hierarchy = io();
    await runTaskHierarchy(["list"], {
      ...hierarchy.opts,
      env: {},
      fetch: (async () => {
        throw new Error("unexpected fetch");
      }) as unknown as typeof fetch,
    });
    const work = io();
    await runMyWork(["--json"], {
      ...work.opts,
      env: {},
      fetch: (async () => {
        throw new Error("unexpected fetch");
      }) as unknown as typeof fetch,
    });

    expect(hierarchy.exits).toEqual([1]);
    expect(hierarchy.stderr.join("\n")).toContain("Task API caller is not configured");
    expect(work.exits).toEqual([1]);
    expect(work.stderr.join("\n")).toContain("Task API caller is not configured");
  });
});

describe("notify CLI source", () => {
  function caller() {
    return {
      notify: {
        list: async (input: unknown) => ({ list: input }),
        markRead: async (input: unknown) => ({ markRead: input }),
        markAllRead: async () => ({ all: true }),
        mute: async (input: unknown) => ({ mute: input }),
        unmute: async (input: unknown) => ({ unmute: input }),
        rules: {
          list: async () => [{ id: "r1" }],
          get: async ({ id }: { id: string }) => id === "missing" ? null : { id },
          create: async (input: unknown) => ({ create: input }),
          update: async (input: unknown) => ({ update: input }),
          delete: async (input: unknown) => ({ delete: input }),
        },
        channels: {
          list: async () => ["email"],
          config: async (input: unknown) => ({ config: input }),
          test: async (input: unknown) => ({ test: input }),
        },
      },
    };
  }

  it("covers notification verbs, rule/channel subcommands, and usage errors", async () => {
    const n = io();
    const opts = { caller: caller(), ...n.opts };
    await runNotify(["help"], opts);
    await runNotify(["list", "--unread", "--limit", "5", "--offset", "2", "--json"], opts);
    await runNotify(["mark-read", "--all"], opts);
    await runNotify(["read", "n1"], opts);
    await runNotify(["mute", "task", "t1", "--until", "2026-05-01T00:00:00.000Z"], opts);
    await runNotify(["unmute", "task", "t1"], opts);
    await runNotify(["rules", "list"], opts);
    await runNotify(["rules", "get", "r1"], opts);
    await runNotify(["rules", "get", "missing"], opts);
    await runNotify(["rules", "create", "--name", "Mine", "--pattern", "{\"verb\":\"task.created\"}", "--channels", "email,slack"], opts);
    await runNotify(["rules", "update", "r1"], opts);
    await runNotify(["rules", "delete", "r1"], opts);
    await runNotify(["channels", "list"], opts);
    await runNotify(["channels", "config", "email", "--url", "smtp://local"], opts);
    await runNotify(["channels", "test", "email"], opts);
    await runNotify(["mark-read"], opts);
    await runNotify(["mute", "task"], opts);
    await runNotify(["rules"], opts);
    await runNotify(["channels"], opts);
    await runNotify(["list", "--bad"], opts);
    await runNotify(["list", "--limit", "bad"], opts);
    await runNotify(["wat"], opts);

    const out = n.stdout.join("\n");
    expect(out).toContain("fulcrum notify - notification management");
    expect(out).toContain("\"all\": true");
    expect(out).toContain("\"markRead\"");
    expect(out).toContain("\"channels\": [");
    const err = n.stderr.join("\n");
    expect(err).toContain("rule not found: missing");
    expect(err).toContain("usage: fulcrum notify mark-read");
    expect(err).toContain("usage: fulcrum notify mute");
    expect(err).toContain("unknown flag: --bad");
    expect(err).toContain("--limit must be an integer");
    expect(err).toContain("unknown verb 'wat'");
    expect(n.exits).toEqual([1, 2, 2, 2, 2, 2, 1, 2]);
  });
});

describe("project config CLI source", () => {
  it("routes methodology and task-type updates through the configured public API", async () => {
    const p = io();
    const calls: Array<{ url: string; body: unknown }> = [];
    await runProjectConfig(["project-1", "--methodology", "scrum", "--types", "epic,task", "--json"], {
      ...p.opts,
      env: {
        FULCRUM_SERVER_URL: "http://127.0.0.1:3210/",
        FULCRUM_ORG_ID: "org-1",
      },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
        return Response.json({ methodology: "scrum", enabledTaskTypes: ["epic", "task"], transitionCount: 3 });
      }) as typeof fetch,
    });

    expect(p.exits).toEqual([]);
    expect(JSON.parse(p.stdout[p.stdout.length - 1] as string)).toEqual({
      methodology: "scrum",
      enabledTaskTypes: ["epic", "task"],
      transitionCount: 3,
    });
    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:3210/api/v1/workflows/methodology/update",
        body: { orgId: "org-1", projectId: "project-1", methodology: "scrum" },
      },
      {
        url: "http://127.0.0.1:3210/api/v1/workflows/task-types/update",
        body: { orgId: "org-1", projectId: "project-1", types: ["epic", "task"] },
      },
      {
        url: "http://127.0.0.1:3210/api/v1/workflows/methodology/get",
        body: { orgId: "org-1", projectId: "project-1" },
      },
    ]);
  });

  it("requires the configured workflow public API when no caller is injected", async () => {
    const p = io();
    await runProjectConfig(["project-1", "--json"], { ...p.opts, env: {} });

    expect(p.exits).toEqual([1]);
    expect(p.stderr.join("\n")).toContain("Workflow API caller is not configured");
  });
});

describe("task relationship CLI source", () => {
  it("routes create, list, and delete through the configured public API", async () => {
    const t = io();
    const calls: Array<{ url: string; body: unknown }> = [];
    const env = {
      FULCRUM_SERVER_URL: "http://127.0.0.1:3210/",
      FULCRUM_ORG_ID: "org-1",
    };
    const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      calls.push({ url: String(url), body });
      if (String(url).endsWith("/list-for-task")) {
        return Response.json([{ type: "blocks", direction: "out", relatedTaskTitle: "Blocked task" }]);
      }
      if (String(url).endsWith("/delete")) return Response.json({ ok: true });
      return Response.json({ id: "rel-1" });
    }) as unknown as typeof globalThis.fetch;

    await runTaskRelate(["task-1", "blocks", "task-2"], { ...t.opts, env, fetch });
    await runTaskRelate(["task-1", "--list"], { ...t.opts, env, fetch });
    await runTaskRelate(["task-1", "--delete", "rel-1"], { ...t.opts, env, fetch });

    expect(t.exits).toEqual([]);
    expect(t.stdout.join("\n")).toContain("Created relationship rel-1");
    expect(t.stdout.join("\n")).toContain("Blocked task");
    expect(t.stdout.join("\n")).toContain("Deleted relationship rel-1");
    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:3210/api/v1/relationships/create",
        body: { orgId: "org-1", sourceTaskId: "task-1", targetTaskId: "task-2", type: "blocks" },
      },
      {
        url: "http://127.0.0.1:3210/api/v1/relationships/list-for-task",
        body: { orgId: "org-1", taskId: "task-1" },
      },
      {
        url: "http://127.0.0.1:3210/api/v1/relationships/delete",
        body: { orgId: "org-1", relationshipId: "rel-1" },
      },
    ]);
  });

  it("requires the configured relationship public API when no caller is injected", async () => {
    const t = io();
    await runTaskRelate(["task-1", "--list"], { ...t.opts, env: {} });

    expect(t.exits).toEqual([1]);
    expect(t.stderr.join("\n")).toContain("Relationship API caller is not configured");
  });
});

describe("comment CLI source", () => {
  it("routes add, reply, list, and resolve through the configured public API", async () => {
    const c = io();
    const calls: Array<{ url: string; body: unknown }> = [];
    const env = {
      FULCRUM_SERVER_URL: "http://127.0.0.1:3210/",
      FULCRUM_ORG_ID: "org-1",
      FULCRUM_USER_ID: "user-1",
    };
    const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      calls.push({ url: String(url), body });
      if (String(url).endsWith("/threaded")) {
        return Response.json([{
          id: "comment-1",
          author: "user-1",
          body: "Looks good",
          createdAt: new Date().toISOString(),
          replies: [],
        }]);
      }
      if (String(url).endsWith("/resolve")) return Response.json({ id: "comment-1", resolved: true });
      return Response.json({ id: body.parentCommentId ? "reply-1" : "comment-1" });
    }) as unknown as typeof globalThis.fetch;

    await runComment(["add", "task-1", "Looks", "good"], { ...c.opts, env, fetch });
    await runComment(["reply", "comment-1", "Agreed"], { ...c.opts, env, fetch });
    await runComment(["list", "task-1"], { ...c.opts, env, fetch });
    await runComment(["resolve", "comment-1"], { ...c.opts, env, fetch });

    expect(c.exits).toEqual([]);
    expect(c.stdout.join("\n")).toContain("Created comment comment-1");
    expect(c.stdout.join("\n")).toContain("Created reply reply-1");
    expect(c.stdout.join("\n")).toContain("@user-1");
    expect(c.stdout.join("\n")).toContain("Resolved comment comment-1");
    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:3210/api/v1/comments/create",
        body: { orgId: "org-1", userId: "user-1", taskId: "task-1", body: "Looks good" },
      },
      {
        url: "http://127.0.0.1:3210/api/v1/comments/create",
        body: { orgId: "org-1", userId: "user-1", parentCommentId: "comment-1", body: "Agreed" },
      },
      {
        url: "http://127.0.0.1:3210/api/v1/comments/threaded",
        body: { orgId: "org-1", userId: "user-1", taskId: "task-1" },
      },
      {
        url: "http://127.0.0.1:3210/api/v1/comments/resolve",
        body: { orgId: "org-1", userId: "user-1", commentId: "comment-1" },
      },
    ]);
  });

  it("requires the configured comment public API when no caller is injected", async () => {
    const c = io();
    await runComment(["list", "task-1"], { ...c.opts, env: {} });

    expect(c.exits).toEqual([1]);
    expect(c.stderr.join("\n")).toContain("Comment API caller is not configured");
  });
});

describe("symphony CLI source", () => {
  function symphonyCaller(): SymphonyCaller {
    return {
      ...stubCaller(),
      getOrchestratorStatus: async () => ({ running: 1, queued: 2, stalled: 3 }),
      syncDaily: async () => ({ synced: 4, errors: 0 }),
      listRuns: async () => [{ id: "run-1", state: "ready", attemptCount: 2, startedAt: "now" }],
      getRun: async ({ runId }) => runId === "missing" ? null : {
        id: runId,
        state: "failed",
        attemptCount: 2,
        nextRetryAt: new Date("2026-05-01T00:00:00.000Z"),
        lastErrorKind: "agent",
        workspacePath: "/tmp/ws",
        renderedPrompt: "x".repeat(300),
      },
      cancelRun: async () => ({ success: true }),
      retryRun: async () => ({ success: false }),
      dispatchRun: async (input) => ({ runId: input.taskId, state: "queued", agent: input.agentName ?? "codex", sandboxMode: input.sandboxMode ?? "none" }),
    };
  }

  it("covers status, sync, run actions, conformance, and usage failures", async () => {
    const s = io();
    const opts = { caller: symphonyCaller(), ...s.opts };
    await runSymphony(["help"], opts);
    await runSymphony(["status"], opts);
    await runSymphony(["status", "--json"], opts);
    await runSymphony(["sync"], opts);
    await runSymphony(["sync", "--json"], opts);
    await runSymphony(["runs", "list", "--state", "ready", "--project", "p1"], opts);
    await runSymphony(["runs", "list", "--json"], opts);
    await runSymphony(["runs", "show", "run-1", "--verbose"], opts);
    await runSymphony(["runs", "show", "run-1", "--json"], opts);
    await runSymphony(["runs", "show", "missing"], opts);
    await runSymphony(["runs", "cancel", "run-1"], opts);
    await runSymphony(["runs", "cancel", "run-1", "--json"], opts);
    await runSymphony(["runs", "retry", "run-1"], opts);
    await runSymphony(["runs", "retry", "run-1", "--json"], opts);
    await runSymphony(["runs", "dispatch", "task-1", "--agent", "claude", "--sandbox", "dry"], opts);
    await runSymphony(["runs", "dispatch", "task-1", "--json"], opts);
    await runSymphony(["conformance", "--verbose"], { ...opts, runConformanceCheck: async () => ({ pass: false, sections: [{ section: "18.1", pass: false, reason: "missing" }] }) });
    await runSymphony(["conformance", "--json"], { ...opts, runConformanceCheck: async () => ({ pass: true, sections: [] }) });
    await runSymphony(["runs", "show"], opts);
    await runSymphony(["runs", "cancel"], opts);
    await runSymphony(["runs", "retry"], opts);
    await runSymphony(["runs", "dispatch"], opts);
    await runSymphony(["runs", "wat"], opts);
    await runSymphony(["wat"], opts);

    const out = s.stdout.join("\n");
    expect(out).toContain("Symphony Orchestrator Status");
    expect(out).toContain("\"running\":1");
    expect(out).toContain("Synced 4 items");
    expect(out).toContain("RENDERED PROMPT");
    expect(out).toContain("Cancelled run run-1");
    expect(out).toContain("Failed to retry run run-1");
    expect(out).toContain("Dispatched run task-1");
    expect(out).toContain("FAIL  18.1");
    const err = s.stderr.join("\n");
    expect(err).toContain("run not found 'missing'");
    expect(err).toContain("conformance: FAIL");
    expect(err).toContain("missing <runId>");
    expect(err).toContain("missing <taskId>");
    expect(err).toContain("unknown command 'wat'");
    expect(s.exits).toEqual([1, 1, 2, 2, 2, 2, 2, 2]);
  });
});
