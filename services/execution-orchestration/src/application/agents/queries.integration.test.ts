import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { getAgentProfilePageData, listAgentProfilesPageData, testProfileAction, upsertProfile } from "@execution-orchestration/application/agents/queries.ts";
import type { AppContext } from "@work-management/application/tasks/types.ts";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

async function freshDb(): Promise<TestOrm> {
  db = await createTestOrm();
  return db;
}

function ctx(projectId: string): AppContext {
  return { orgId: DEFAULT_ORG_ID, userId: "agent-user", projectId };
}

describe("agent profile application queries with migrated PGlite data", () => {
  test("upserts, masks secrets, joins project/task options, records tests, and lists recent runs", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const projectId = randomUUID();
    const taskId = randomUUID();

    await em.getConnection().execute(
      `INSERT INTO projects (id, org_id, slug, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, now(), now())`,
      [projectId, DEFAULT_ORG_ID, "agents-project", "Agents Project"],
    );
    await em.getConnection().execute(
      `INSERT INTO tasks (id, org_id, project_id, title, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, now(), now())`,
      [taskId, DEFAULT_ORG_ID, projectId, "Ready task", "pending"],
    );

    const created = await upsertProfile(em, {
      orgId: DEFAULT_ORG_ID,
      name: "codex",
      cliPath: "codex",
      defaultFlags: "--model gpt-5.5",
      authEnv: { OPENAI_API_KEY: "sk-real-secret-value" },
    });
    await testProfileAction(em, created.id, DEFAULT_ORG_ID, true);
    await em.getConnection().execute(
      `INSERT INTO agent_runs (id, org_id, task_id, agent_name, agent_version, thread_id, status, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), DEFAULT_ORG_ID, taskId, "codex", "1.0.0", "thread-1", "succeeded", "2026-05-10T10:00:00Z"],
    );

    const page = await listAgentProfilesPageData(em, ctx(projectId));
    expect(page.profiles).toHaveLength(1);
    expect(page.profiles[0]).toMatchObject({
      id: created.id,
      name: "codex",
      cli_path: "codex",
      test_passed: true,
      auth_env: { OPENAI_API_KEY: "****alue" },
    });
    expect(page.projects.some((project) => project.id === projectId && project.name === "Agents Project")).toBe(true);
    expect(page.tasks.some((task) => task.id === taskId && task.title === "Ready task")).toBe(true);

    const detail = await getAgentProfilePageData(em, ctx(projectId), "codex");
    expect(detail?.profile.auth_env).toEqual({ OPENAI_API_KEY: "****alue" });
    expect(detail?.runs).toMatchObject([{ status: "succeeded" }]);
    expect(await getAgentProfilePageData(em, ctx(projectId), "missing")).toBeNull();
  });
});
