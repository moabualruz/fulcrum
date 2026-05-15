import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();

function moduleUrl(path: string): string {
  return pathToFileURL(join(repoRoot, path)).href;
}

async function writeRunner(dir: string): Promise<string> {
  const runner = join(dir, "seed-runner.ts");
  await writeFile(
    runner,
    `
import { PGlite } from ${JSON.stringify(moduleUrl("node_modules/@electric-sql/pglite/dist/index.js"))};
import { Container } from ${JSON.stringify(moduleUrl("node_modules/@needle-di/core/dist/index.js"))};
import { MikroORM } from ${JSON.stringify(moduleUrl("node_modules/@mikro-orm/postgresql/index.js"))};

import { PGliteKyselyDialect } from ${JSON.stringify(moduleUrl("services/platform-core/src/infrastructure/application-database/PGliteKyselyDriver.ts"))};
import { ENTITY_MANAGER_TOKEN } from ${JSON.stringify(moduleUrl("services/platform-core/src/infrastructure/application-database/db.module.ts"))};
import { Org } from ${JSON.stringify(moduleUrl("services/platform-core/src/infrastructure/application-database/entities/auth/Org.ts"))};
import {
  Account,
  FeatureFlag,
  Invitation,
  OrgMember,
  Session,
  User,
} from ${JSON.stringify(moduleUrl("services/platform-core/src/infrastructure/application-database/entities/auth/index.ts"))};
import { SeedService } from ${JSON.stringify(moduleUrl("services/platform-core/src/infrastructure/application-database/seed.ts"))};
import { registerSeedBindings } from ${JSON.stringify(moduleUrl("services/platform-core/src/infrastructure/application-database/seed.module.ts"))};
import { NotificationRule } from ${JSON.stringify(moduleUrl("services/platform-core/src/infrastructure/application-database/entities/notifications/NotificationRule.ts"))};

const dbDir = process.argv[2];
if (!dbDir) throw new Error("missing db dir");

const pglite = new PGlite(dbDir);
await pglite.waitReady;
const dialect = new PGliteKyselyDialect(() => pglite);
const orm = await MikroORM.init({
  dbName: "postgres",
  driverOptions: dialect,
  entities: [Org, User, Session, Invitation, OrgMember, FeatureFlag, Account, NotificationRule],
  debug: false,
});

try {
  await orm.schema.create();
  const container = new Container();
  container.bind({
    provide: ENTITY_MANAGER_TOKEN,
    useValue: orm.em,
  });
  registerSeedBindings(container);

  const seed = container.get(SeedService);
  const first = await seed.run();
  const afterFirstEm = orm.em.fork();
  const afterFirst = {
    orgs: await afterFirstEm.count(Org, {}),
    users: await afterFirstEm.count(User, {}),
    sessions: await afterFirstEm.count(Session, {}),
    orgMembers: await afterFirstEm.count(OrgMember, {}),
    accounts: await afterFirstEm.count(Account, {}),
    notificationRules: await afterFirstEm.count(NotificationRule, {}),
  };

  const second = await seed.run();
  const afterSecondEm = orm.em.fork();
  const afterSecond = {
    orgs: await afterSecondEm.count(Org, {}),
    users: await afterSecondEm.count(User, {}),
    sessions: await afterSecondEm.count(Session, {}),
    orgMembers: await afterSecondEm.count(OrgMember, {}),
    accounts: await afterSecondEm.count(Account, {}),
    notificationRules: await afterSecondEm.count(NotificationRule, {}),
  };

  const rules = await afterSecondEm.find(
    NotificationRule,
    { userId: first.userId },
    { orderBy: { name: "asc" } },
  );

  console.log(JSON.stringify({ first, second, afterFirst, afterSecond, rules }));
} finally {
  await orm.close(true);
  await pglite.close();
}
`.trimStart(),
  );
  return runner;
}

async function runSeedTwice(scratch: string): Promise<{
  first: { orgId: string; userId: string; sessionToken: string };
  second: { orgId: string; userId: string; sessionToken: string };
  afterFirst: Record<string, number>;
  afterSecond: Record<string, number>;
  rules: Array<{
    name: string;
    userId: string;
    enabled: boolean;
    active: boolean;
    channels: string[];
    eventPattern: Record<string, unknown>;
  }>;
}> {
  const runner = await writeRunner(scratch);
  const dbDir = join(scratch, "db");
  await mkdir(dbDir, { recursive: true });
  const proc = Bun.spawn(["bun", "run", runner, dbDir], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) throw new Error(stderr || stdout);
  return JSON.parse(stdout);
}

describe("SeedService", () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), "fulcrum-seed-test-"));
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  test("run is idempotent for local org, admin user, session, and membership", async () => {
    const result = await runSeedTwice(scratch);

    expect(result.first.orgId).toBe("00000000-0000-0000-0000-000000000001");
    expect(result.second.orgId).toBe(result.first.orgId);
    expect(result.second.userId).toBe(result.first.userId);
    expect(result.second.sessionToken).toBe(result.first.sessionToken);
    expect(result.afterFirst).toEqual({ orgs: 1, users: 1, sessions: 1, orgMembers: 1, accounts: 1, notificationRules: 4 });
    expect(result.afterSecond).toEqual({ orgs: 1, users: 1, sessions: 1, orgMembers: 1, accounts: 1, notificationRules: 4 });
  });

  test("seeds default notification rules with matchable patterns", async () => {
    const result = await runSeedTwice(scratch);

    expect(result.rules.map((rule) => rule.name)).toEqual([
      "assignment-to-me",
      "mention-of-me",
      "run-completed-on-my-task",
      "sprint-changes-affecting-my-tasks",
    ]);
    expect(result.rules.every((rule) => rule.userId === result.first.userId)).toBe(true);
    expect(result.rules.every((rule) => rule.enabled === true && rule.active === true)).toBe(true);
    expect(result.rules.every((rule) => JSON.stringify(rule.channels) === JSON.stringify(["in-app"]))).toBe(true);
    expect(result.rules.map((rule) => rule.eventPattern)).toEqual([
      {
        subject_kind: "task",
        verb: "assigned",
        payload_path_eq: [{ path: "assignee_id", value: "$current_user_id" }],
      },
      {
        verb: "mentioned",
        payload_path_eq: [{ path: "mentioned_user_id", value: "$current_user_id" }],
      },
      {
        subject_kind: "agent_run",
        verb: "completed",
        payload_path_eq: [{ path: "task_id", value: "$tasks_assigned_to_current_user" }],
      },
      {
        subject_kind: "sprint",
        verb: "changed",
        payload_path_eq: [{ path: "sprint_id", value: "$sprint_of_my_tasks" }],
      },
    ]);
  });

  test("creates the session with MikroORM persistAndFlush", async () => {
    const source = await Bun.file(join(repoRoot, "services/platform-core/src/infrastructure/application-database/seed.ts")).text();

    expect(source).toContain("await em.persistAndFlush(session)");
    expect(source).not.toContain("em.persist(session)");
  });

  test.skip("layout-server seed hook deferred to Pillar 13/16", () => {
    // Deferral is documented in apps/web/src/routes/+layout.server.ts for P1#04.
  });
});
