import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { run as runAgent } from "./agent.ts";
import { run as runArtifact } from "./artifact.ts";
import { run as runArtifacts, type ArtifactsClient } from "./artifacts.ts";
import { openPglite } from "../product-kernel/db/pglite.ts";
import { runMigrations } from "../product-kernel/db/migrate.ts";
import { productDbDir } from "../product-kernel/paths.ts";
import { createLocalOrg, createProject, createTask } from "../product-kernel/store/repositories.ts";
import { newUlid } from "../product-kernel/ids.ts";

let scratch = "";
let originalFulcrumHome: string | undefined;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-agent-artifact-cli-"));
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["FULCRUM_HOME"] = join(scratch, ".fulcrum");
});

afterEach(async () => {
  if (originalFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = originalFulcrumHome;
  await rm(scratch, { recursive: true, force: true });
});

function captureStdout(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  return { lines, restore: () => { console.log = original; } };
}

describe("fulcrum agent/artifact CLI", () => {
  test("agent run --task <id> --json creates queued run", async () => {
    await mkdir(productDbDir(), { recursive: true });
    const db = await openPglite(join(productDbDir(), "main"));
    let taskId = "";
    try {
      await runMigrations(db);
      const org = await createLocalOrg(db, { slug: "default", name: "Local" });
      const project = await createProject(db, { orgId: org.id, slug: "p", name: "P" });
      const task = await createTask(db, { orgId: org.id, projectId: project.id, title: "Run agent" });
      taskId = task.id;
    } finally {
      await db.close();
    }

    const cap = captureStdout();
    try {
      await runAgent(["run", "--task", taskId, "--agent", "codex", "--json"]);
    } finally {
      cap.restore();
    }
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(payload.task_id).toBe(taskId);
    expect(payload.agent).toBe("codex");
    expect(payload.status).toBe("queued");
  });

  test("artifact list --json returns artifact rows", async () => {
    await mkdir(productDbDir(), { recursive: true });
    const db = await openPglite(join(productDbDir(), "main"));
    let artifactId = "";
    try {
      await runMigrations(db);
      const org = await createLocalOrg(db, { slug: "default", name: "Local" });
      const project = await createProject(db, { orgId: org.id, slug: "p", name: "P" });
      const runId = newUlid();
      await db.query(
        `INSERT INTO agent_runs (id, org_id, project_id, agent, status)
         VALUES ($1, $2, $3, 'codex', 'succeeded')`,
        [runId, org.id, project.id],
      );
      artifactId = newUlid();
      const path = join(scratch, "artifact.txt");
      await writeFile(path, "cli artifact", "utf8");
      await db.query(
        `INSERT INTO artifacts (id, org_id, project_id, run_id, kind, title, body_path, mime)
         VALUES ($1, $2, $3, $4, 'text', 'artifact.txt', $5, 'text/plain')`,
        [artifactId, org.id, project.id, runId, path],
      );
    } finally {
      await db.close();
    }

    const cap = captureStdout();
    try {
      await runArtifact(["list", "--json"]);
    } finally {
      cap.restore();
    }
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(payload).toHaveLength(1);
    expect(payload[0].id).toBe(artifactId);
    expect(payload[0].preview).toBe("cli artifact");
  });

  test("artifact delete --hard requires explicit confirmation path", async () => {
    const calls: Array<{ id: string; hard: boolean; confirm?: boolean }> = [];
    const client = {
      delete: async (input: { id: string; hard: boolean; confirm?: boolean }) => {
        calls.push(input);
        return { ok: true, id: input.id };
      },
    } as unknown as ArtifactsClient;

    await runArtifacts(["delete", "artifact-1", "--hard", "--json"], client);

    expect(calls[0]).toEqual({ id: "artifact-1", hard: true, confirm: true });
  });
});
