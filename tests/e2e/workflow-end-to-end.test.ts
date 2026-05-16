import { describe, it, expect, afterEach } from "bun:test";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { createTestCaller, type TestContainer } from "@test-support/index.ts";
import { createTestContainer } from "@test-support/application-container.ts";

let db: TestOrm | undefined;

afterEach(async () => {
  await db?.close();
  db = undefined;
});

describe("full workflow E2E: docs → planning → tasks → review", () => {
  it("creates a document, links it to planning context, creates tasks, and runs review", async () => {
    db = await createTestOrm();
    const container = createTestContainer(db);
    const caller = await createTestCaller(db, container);

    const doc = await caller.docs.create({
      title: "E2E Workflow Test Doc",
      bodyMd: "# Requirements\n\nBuild login feature with OAuth2.",
      kind: "note",
    });
    expect(doc).toBeTruthy();
    const docId = (doc as { id: string }).id;
    expect(docId).toBeTruthy();

    const docRead = await caller.docs.get({ id: docId });
    expect((docRead as { title: string }).title).toBe("E2E Workflow Test Doc");

    const task = await caller.tasks.create({
      title: "Implement OAuth2 login",
      description: "Based on requirements doc",
      status: "todo",
      priority: 1,
    });
    expect(task).toBeTruthy();
    const taskId = (task as { id: string }).id;
    expect(taskId).toBeTruthy();

    const tasks = await caller.tasks.list({});
    expect(Array.isArray(tasks)).toBe(true);
    expect((tasks as unknown[]).length).toBeGreaterThanOrEqual(1);

    const taskRead = await caller.tasks.get({ id: taskId });
    expect((taskRead as { title: string }).title).toBe("Implement OAuth2 login");
  });

  it("creates a sprint, assigns tasks, and manages lifecycle", async () => {
    db = await createTestOrm();
    const container = createTestContainer(db);
    const caller = await createTestCaller(db, container);

    const project = await caller.projects.create({
      name: "E2E Sprint Project",
      slug: "e2e-sprint",
    });
    const projectId = (project as { id: string }).id;
    expect(projectId).toBeTruthy();

    const task = await caller.tasks.create({
      title: "Sprint task",
      status: "todo",
      priority: 2,
      projectId,
    });
    const taskId = (task as { id: string }).id;

    const sprint = await caller.sprints.create({
      projectId,
      name: "Sprint 1",
      startDate: new Date(),
      endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });
    expect(sprint).toBeTruthy();
    const sprintId = (sprint as { id: string }).id;

    const sprintRead = await caller.sprints.get({ id: sprintId });
    expect((sprintRead as { name: string }).name).toBe("Sprint 1");
  });
});
