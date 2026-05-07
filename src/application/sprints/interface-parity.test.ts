import { afterEach, describe, expect, test } from "bun:test";
import { MikroORM } from "@mikro-orm/postgresql";

import { run as runSprintsCommand } from "@fulcrum/cli/commands/sprints.ts";
import { createLocalCaller } from "@fulcrum/cli/local-caller.ts";
import { Session } from "../../db/entities/auth/Session.ts";
import { createTestContainer, createTestOrm, type TestOrm } from "../../test-utils/index.ts";
import { buildCaller } from "@fulcrum/tui/index.ts";
import { createSprint } from "./commands.ts";
import type { AppContext, SprintDto } from "./types.ts";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

function jsonLine<T>(lines: string[]): T {
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0]!) as T;
}

async function ensureSession(db: TestOrm): Promise<void> {
  const em = db.em.fork();
  em.persist(em.create(Session, {
    id: `parity-${crypto.randomUUID()}`,
    userId: db.seed.userId,
    orgId: db.seed.orgId,
    activeOrganizationId: db.seed.orgId,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    ipAddress: null,
    userAgent: "test",
  }));
  await em.flush();
}

describe("sprints cross-interface parity", () => {
  test("application-created sprint reads identically through tRPC, CLI JSON, and TUI caller", async () => {
    db = await createTestOrm();
    const container = createTestContainer(db);
    container.bind({ provide: MikroORM, useValue: db.orm });
    const projectId = crypto.randomUUID();
    const ctx: AppContext = { orgId: db.seed.orgId, userId: db.seed.userId, projectId };
    const startDate = new Date("2026-05-07T00:00:00.000Z");
    const endDate = new Date("2026-05-21T00:00:00.000Z");

    const created = await createSprint(db.em.fork(), ctx, {
      projectId,
      name: "Cross-interface sprint",
      goal: "Prove sprint parity",
      startDate,
      endDate,
      capacityPoints: 13,
    });
    await ensureSession(db);

    const localCaller = await createLocalCaller({ container, requireSession: true });
    const trpcSprint = await localCaller.sprints.get({ id: created.id }) as SprintDto;

    const cliLines: string[] = [];
    await runSprintsCommand(["get", created.id, "--json"], {
      caller: localCaller as never,
      print: (line) => cliLines.push(line),
      printErr: (line) => {
        throw new Error(line);
      },
      exit: (code) => {
        throw new Error(`unexpected CLI exit ${code}`);
      },
    });
    const cliSprint = jsonLine<SprintDto>(cliLines);

    await buildCaller(container);
    const tuiSprint = ((await localCaller.sprints.list() as SprintDto[]) ?? [])
      .find((sprint) => sprint.id === created.id);

    expect(tuiSprint, "TUI caller returned no application-created sprint").toBeDefined();
    for (const sprint of [trpcSprint, cliSprint, tuiSprint]) {
      expect(sprint).toMatchObject({
        id: created.id,
        orgId: db.seed.orgId,
        projectId,
        name: "Cross-interface sprint",
        goal: "Prove sprint parity",
        status: "planned",
        capacityPoints: 13,
      });
    }
  });
});
