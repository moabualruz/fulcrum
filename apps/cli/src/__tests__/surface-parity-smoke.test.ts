import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { MODULE_METADATA } from "@nestjs/common/constants";

import { run as runArtifactsCli } from "../commands/artifacts.ts";
import { run as runDocsCli } from "../commands/docs.ts";
import { run as runReposCli } from "../commands/repos.ts";
import { run as runTasksCli } from "../commands/tasks.ts";
import { runPillar14Command } from "../commands/pillar14-generated.ts";
import { AppModule } from "@fulcrum/server/app.module.ts";
import { RepositoryPublicApiModule } from "@integration-hub/interface/http/repository-public-api.controller.ts";
import { REQUIRED_SURFACE_DOMAINS } from "@platform-core/application/interface-parity/surface-domain-matrix.ts";
import { TaskPublicApiModule } from "@work-management/interface/http/task-public-api.controller.ts";

type Captured = { lines: string[]; errors: string[]; exitCodes: number[] };

function capture(): Captured & {
  print: (line: string) => void;
  printErr: (line: string) => void;
  exit: (code: number) => void;
} {
  const captured: Captured = { lines: [], errors: [], exitCodes: [] };
  return {
    ...captured,
    print: (line) => captured.lines.push(line),
    printErr: (line) => captured.errors.push(line),
    exit: (code) => captured.exitCodes.push(code),
  };
}

function parseLastJson<T>(captured: Captured): T {
  expect(captured.errors).toEqual([]);
  expect(captured.exitCodes).toEqual([]);
  return JSON.parse(captured.lines.at(-1) ?? "null") as T;
}

describe("Surface final cross-surface parity smoke", () => {
  test("representative CLI JSON flows cover tasks, docs, repos, artifacts, and notifications", async () => {
    const tasks = capture();
    await runTasksCli(["list", "--json"], {
      ...tasks,
      caller: {
        tasks: {
          list: async () => [{ id: "task-1", title: "Surface smoke" }],
        },
      } as any,
    });
    expect(parseLastJson<Array<{ id: string }>>(tasks)[0]?.id).toBe("task-1");

    const createdTask = capture();
    await runTasksCli(["create", "--title", "Surface smoke", "--json"], {
      ...createdTask,
      caller: {
        tasks: {
          create: async (input: Record<string, unknown>) => ({ id: "task-2", ...input }),
        },
      } as any,
    });
    expect(parseLastJson<{ title: string }>(createdTask).title).toBe("Surface smoke");

    const docs = capture();
    await runDocsCli(["list", "--json"], {
      ...docs,
      caller: { docs: { list: async () => [{ id: "doc-1", title: "Surface contract" }] } } as any,
    });
    expect(parseLastJson<Array<{ id: string }>>(docs)[0]?.id).toBe("doc-1");

    const repos = capture();
    await runReposCli(["list", "--json"], {
      ...repos,
      caller: {
        repos: {
          list: async () => [{ id: "repo-1", slug: "fulcrum", branch: "main", dirty: false, openTaskCount: 0 }],
        },
      } as any,
    });
    expect(parseLastJson<Array<{ slug: string }>>(repos)[0]?.slug).toBe("fulcrum");

    const repoSync = capture();
    await runReposCli(["sync", "repo-1", "--json"], {
      ...repoSync,
      caller: {
        repos: {
          syncRepo: async () => ({ repoId: "repo-1", status: "queued", taskName: "repo.sync", jobKey: "repo-1:sync" }),
        },
      } as any,
    });
    expect(parseLastJson<{ status: string }>(repoSync).status).toBe("queued");

    const artifacts = capture();
    await runArtifactsCli(["list", "--json"], {
      ...artifacts,
      caller: { artifacts: { list: async () => [{ id: "artifact-1", filename: "report.txt" }] } } as any,
    });
    expect(parseLastJson<Array<{ filename: string }>>(artifacts)[0]?.filename).toBe("report.txt");

    const artifactDownload = capture();
    await runArtifactsCli(["download", "artifact-1", "--json"], {
      ...artifactDownload,
      caller: {
        artifacts: {
          download: async () => ({ id: "artifact-1", filename: "report.txt", path: "artifacts/report.txt" }),
        },
      } as any,
    });
    expect(parseLastJson<{ path: string }>(artifactDownload).path).toBe("artifacts/report.txt");

    const notifications = capture();
    await runPillar14Command("notify", ["list", "--unread", "--json"], {
      ...notifications,
      caller: { notify: { list: async () => [{ id: "notification-1", read: false }] } },
    });
    expect(parseLastJson<Array<{ read: boolean }>>(notifications)[0]?.read).toBe(false);
  });

  test("artifacts list routes through the configured public API", async () => {
    const captured = capture();
    const calls: Array<{ url: string; method: string | undefined; body: unknown }> = [];

    await runArtifactsCli([
      "list",
      "--project-id",
      "project-1",
      "--run-id",
      "run-1",
      "--task-id",
      "task-1",
      "--mime",
      "text/plain",
      "--archived",
      "--json",
    ], {
      ...captured,
      env: { FULCRUM_SERVER_URL: "http://127.0.0.1:3210/" },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(url),
          method: init?.method,
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        return Response.json([{ id: "artifact-public", filename: "report.txt" }]);
      }) as typeof fetch,
    });

    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:3210/api/v1/artifacts?projectId=project-1&runId=run-1&taskId=task-1&mime=text%2Fplain&archived=true",
        method: "GET",
        body: null,
      },
    ]);
    expect(parseLastJson<Array<{ id: string }>>(captured)[0]?.id).toBe("artifact-public");
  });

  test("artifacts list requires a configured public API without injected caller", async () => {
    const captured = capture();

    await runArtifactsCli(["list", "--json"], {
      ...captured,
      env: {},
      fetch: (async () => {
        throw new Error("fetch should not run without API configuration");
      }) as unknown as typeof fetch,
    });

    expect(captured.errors.join("\n")).toContain("Artifact API caller is not configured");
    expect(captured.exitCodes).toEqual([1]);
  });

  test("Nest API modules and TUI inventory contain the same required domains", async () => {
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];
    const tuiSource = await readFile(new URL("../../../tui/src/__tests__/tui-parity.test.ts", import.meta.url), "utf-8");
    const apiModules = new Map<string, unknown>([
      ["tasks", TaskPublicApiModule],
      ["repos", RepositoryPublicApiModule],
    ]);

    for (const domain of REQUIRED_SURFACE_DOMAINS) {
      if (["tasks", "repos"].includes(domain.name)) {
        expect(appImports).toContain(apiModules.get(domain.name));
        expect(tuiSource).toContain(domain.name);
      }
    }
  });

  test("surface parity matrix links major CLI workflows to TUI and API equivalents", () => {
    const majorDomains = ["projects", "tasks", "docs", "repos", "artifacts", "notifications", "runs", "reports", "planning", "review", "settings"];

    for (const name of majorDomains) {
      const domain = REQUIRED_SURFACE_DOMAINS.find((candidate) => candidate.name === name);
      expect(domain, `${name} missing from surface matrix`).toBeDefined();
      expect(domain!.workflows.length, `${name} missing workflow mapping`).toBeGreaterThan(0);

      for (const workflow of domain!.workflows) {
        expect(workflow.cli.join("\n"), `${name}:${workflow.name} missing fulcrum CLI command`).toContain("fulcrum ");
        expect(workflow.tui.length, `${name}:${workflow.name} missing TUI action`).toBeGreaterThan(0);
        expect(workflow.api.join("\n"), `${name}:${workflow.name} missing public API/service route`).toMatch(/appRouter|Api|Module|public API/);
        expect(workflow.manualScript.length, `${name}:${workflow.name} missing manual parity script`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
