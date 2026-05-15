import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { run as runTasksCommand } from "@fulcrum/cli/commands/tasks.ts";
import { createLocalCaller } from "@fulcrum/cli/local-caller.ts";
import { Session } from "@identity-access/infrastructure/database/entities/auth/Session.ts";
import { bindTestRuntimeOrm, createTestContainer, createTestOrm, type TestOrm } from "@test-support/index.ts";
import { buildCaller } from "@fulcrum/tui/index.ts";
import { createTask } from "@work-management/application/tasks/commands.ts";
import type { AppContext, TaskDto } from "@work-management/application/tasks/types.ts";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

describe("tasks cross-interface parity", () => {
  test("application-created task reads identically through tRPC, CLI JSON, and TUI caller", async () => {
    db = await createTestOrm();
    const container = createTestContainer(db);
    bindTestRuntimeOrm(container, db);
    const ctx: AppContext = {
      orgId: db.seed.orgId,
      userId: db.seed.userId,
      projectId: null,
    };

    const created = await createTask(db.em, ctx, {
      title: "Cross-interface task",
      status: "todo",
    });
    const sessionEm = db.em;
    sessionEm.persist(sessionEm.create(Session, {
      id: `parity-${db.seed.userId}`,
      userId: db.seed.userId,
      orgId: db.seed.orgId,
      activeOrganizationId: db.seed.orgId,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      ipAddress: null,
      userAgent: "test",
    }));
    await sessionEm.flush();

    const localCaller = await createLocalCaller({ container, requireSession: true });
    const trpcTask = await localCaller.tasks.get({ id: created.id }) as TaskDto;

    const cliLines: string[] = [];
    await runTasksCommand(["get", created.id, "--json"], {
      caller: localCaller as never,
      print: (line) => cliLines.push(line),
      printErr: (line) => {
        throw new Error(line);
      },
      exit: (code) => {
        throw new Error(`unexpected CLI exit ${code}`);
      },
    });
    const cliTask = JSON.parse(cliLines.join("\n")) as TaskDto;

    const tuiCaller = await buildCaller(container);
    const tuiTask = (await tuiCaller.tasks?.list() as TaskDto[])
      .find((task) => task.id === created.id);

    for (const task of [trpcTask, cliTask, tuiTask]) {
      expect(task).toMatchObject({
        id: created.id,
        title: "Cross-interface task",
        status: "todo",
        projectId: null,
        orgId: db.seed.orgId,
      });
    }
  });

  test("task interfaces keep business logic in application services", async () => {
    const clientFiles = [
      "apps/web/src/lib/components/tasks/TaskDetailPanel.svelte",
      "apps/cli/src/commands/tasks.ts",
      "apps/tui/src/screens/task-detail.ts",
    ];

    for (const file of clientFiles) {
      const source = await readFile(file, "utf8");
      expect(source, `${file} must not import runtime ORM`).not.toMatch(/@mikro-orm|db\/entities|Product${"Db"}/);
      expect(source, `${file} must not persist directly`).not.toMatch(/\.persist\(|\.flush\(|getRepository\(/);
    }
  });
});
