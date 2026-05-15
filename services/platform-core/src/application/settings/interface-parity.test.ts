import { afterEach, describe, expect, test } from "bun:test";
import { MikroORM } from "@mikro-orm/postgresql";

import { run as runSettingsCommand } from "@fulcrum/cli/settings.ts";
import { createLocalCaller } from "@fulcrum/cli/local-caller.ts";
import { Session } from "@platform-core/infrastructure/application-database/entities/auth/Session.ts";
import { createTestContainer, createTestOrm, type TestOrm } from "@test-support/index.ts";
import { buildCaller } from "@fulcrum/tui/index.ts";
import { setTenantSetting } from "@platform-core/application/settings/commands.ts";
import { getTenantSetting } from "@platform-core/application/settings/queries.ts";
import type { AppContext, TenantSettingDto } from "@platform-core/domain/settings.ts";

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

describe("settings cross-interface parity", () => {
  test("application-created feature setting reads through tRPC flags, CLI JSON, and TUI caller", async () => {
    db = await createTestOrm();
    const container = createTestContainer(db);
    container.bind({ provide: MikroORM, useValue: db.orm });
    const ctx: AppContext = { orgId: db.seed.orgId, userId: db.seed.userId, projectId: null };

    const created = await setTenantSetting(db.em.fork(), ctx, {
      key: "public-api",
      value: { enabled: true },
    });
    await ensureSession(db);
    const appSetting = await getTenantSetting(db.em.fork(), ctx, "public-api");

    const localCaller = await createLocalCaller({ container, requireSession: true });
    const trpcFlag = ((await localCaller.flags.list()) as Array<{ name: string; enabled: boolean }>)
      .find((flag) => flag.name === "public-api");

    const cliLines: string[] = [];
    await runSettingsCommand(["get", "public-api", "--json"], {
      caller: {
        settings: {
          list: async () => [appSetting],
          get: async ({ key }) => key === "public-api" ? appSetting : null,
          set: async () => created,
        },
      },
      print: (line) => cliLines.push(line),
      printErr: (line) => {
        throw new Error(line);
      },
      exit: (code) => {
        throw new Error(`unexpected CLI exit ${code}`);
      },
    });
    const cliSetting = jsonLine<TenantSettingDto>(cliLines);

    const tuiCaller = await buildCaller(container);
    const tuiFlag = (await tuiCaller.flags.list()).find((flag) => flag.name === "public-api");

    expect(appSetting).toMatchObject({
      id: created.id,
      orgId: db.seed.orgId,
      key: "public-api",
      value: { enabled: true },
    });
    expect(trpcFlag).toMatchObject({ name: "public-api", enabled: true });
    expect(cliSetting).toMatchObject({ id: created.id, orgId: db.seed.orgId, key: "public-api" });
    expect(tuiFlag).toMatchObject({ name: "public-api", enabled: true });
  });
});
