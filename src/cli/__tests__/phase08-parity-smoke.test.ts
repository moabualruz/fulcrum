import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { run as runArtifactsCli } from "../../test-support/product-fixtures.ts";
import { run as runDocsCli } from "../commands/docs.ts";
import { run as runReposCli } from "../commands/repos.ts";
import { run as runTasksCli } from "../commands/tasks.ts";
import { runPillar14Command } from "../commands/pillar14-generated.ts";
import { createPublicApiRouter } from "../../api/hono.ts";
import { REQUIRED_SURFACE_DOMAINS } from "../../surfaces/parity.ts";

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

describe("Phase 08 final cross-surface parity smoke", () => {
  test("representative CLI JSON flows cover tasks, docs, repos, artifacts, and notifications", async () => {
    const tasks = capture();
    await runTasksCli(["list", "--json"], {
      ...tasks,
      caller: {
        tasks: {
          list: async () => [{ id: "task-1", title: "Phase 08 smoke" }],
        },
      } as any,
    });
    expect(parseLastJson<Array<{ id: string }>>(tasks)[0]?.id).toBe("task-1");

    const createdTask = capture();
    await runTasksCli(["create", "--title", "Phase 08 smoke", "--json"], {
      ...createdTask,
      caller: {
        tasks: {
          create: async (input: Record<string, unknown>) => ({ id: "task-2", ...input }),
        },
      } as any,
    });
    expect(parseLastJson<{ title: string }>(createdTask).title).toBe("Phase 08 smoke");

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

  test("REST OpenAPI and TUI inventory contain the same required domains", async () => {
    process.env["FULCRUM_FEATURES"] = "public-api";
    const api = createPublicApiRouter();
    const response = await api.request("/api/v1/openapi.json");
    const spec = await response.json() as { paths?: Record<string, unknown> };
    const apiPaths = Object.keys(spec.paths ?? {});
    const tuiSource = await readFile(new URL("../../tui/__tests__/phase08-tui-parity.test.ts", import.meta.url), "utf-8");

    for (const domain of REQUIRED_SURFACE_DOMAINS) {
      if (["tasks", "docs", "repos", "artifacts", "notifications"].includes(domain.name)) {
        expect(JSON.stringify(apiPaths)).toContain(domain.apiRoutes[0] ?? domain.name);
        expect(tuiSource).toContain(domain.name);
      }
    }
  });
});
