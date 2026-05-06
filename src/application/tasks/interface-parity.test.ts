import { afterEach, describe, expect, test } from "bun:test";
import { MikroORM } from "@mikro-orm/postgresql";

import { run as runTasksCommand } from "../../cli/commands/tasks.ts";
import { createLocalCaller } from "../../cli/local-caller.ts";
import { Session } from "../../db/entities/auth/Session.ts";
import { createTestContainer, createTestOrm, type TestOrm } from "../../test-utils/index.ts";
import { buildCaller } from "../../tui/index.ts";
import { createTask } from "./commands.ts";
import type { AppContext, TaskDto } from "./types.ts";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

describe("tasks cross-interface parity", () => {
  test("application-created task reads identically through tRPC, CLI JSON, and TUI caller", async () => {
    db = await createTestOrm();
    const container = createTestContainer(db);
    container.bind({ provide: MikroORM, useValue: db.orm });
    const ctx: AppContext = {
      orgId: db.seed.orgId,
      userId: db.seed.userId,
      projectId: null,
    };

    const created = await createTask(db.em.fork(), ctx, {
      title: "Cross-interface task",
      status: "todo",
    });
    const sessionEm = db.em.fork();
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
});
