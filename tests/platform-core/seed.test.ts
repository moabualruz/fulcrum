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
import { DataSource } from ${JSON.stringify(moduleUrl("node_modules/typeorm/index.mjs"))};
import { EventEmitter } from "node:events";

import { getCoreEntities } from ${JSON.stringify(moduleUrl("services/platform-core/src/infrastructure/application-database/typeorm.config.ts"))};
import { FULCRUM_TYPEORM_MIGRATIONS_TABLE } from ${JSON.stringify(moduleUrl("services/platform-core/src/infrastructure/database/typeorm-data-source.ts"))};
import { Org } from ${JSON.stringify(moduleUrl("services/identity-access/src/infrastructure/database/entities/auth/Org.ts"))};
import {
  Account,
  FeatureFlag,
  Invitation,
  OrgMember,
  Session,
  User,
} from ${JSON.stringify(moduleUrl("services/identity-access/src/infrastructure/database/entities/auth/index.ts"))};
import { SeedService } from ${JSON.stringify(moduleUrl("services/platform-core/src/infrastructure/application-database/seed.ts"))};
import { NotificationRule } from ${JSON.stringify(moduleUrl("services/notification-center/src/infrastructure/database/entities/notifications/NotificationRule.ts"))};

const dbDir = process.argv[2];
if (!dbDir) throw new Error("missing db dir");

const pglite = new PGlite(dbDir);
await pglite.waitReady;

class EphemeralPool extends EventEmitter {
  constructor() { super(); this.setMaxListeners(100); this.on("error", () => {}); }
  doneCallback() {}
  async connect(callback) {
    try { callback(null, this, this.doneCallback); }
    catch (error) { callback(error, null, this.doneCallback); }
  }
  async query(sqlQuery, queryParameters, callback) {
    let cb = callback, params = queryParameters;
    if (typeof queryParameters === "function") { cb = queryParameters; params = undefined; }
    const hasParams = params !== undefined && Array.isArray(params) && params.length > 0;
    let finalSql = sqlQuery;
    if (hasParams && sqlQuery.includes("?")) {
      let idx = 0;
      finalSql = sqlQuery.replace(/\\?/g, () => "$" + (++idx));
    }
    const queryPromise = hasParams
      ? pglite.query(finalSql, params)
      : pglite.exec(finalSql).then((r) => r[r.length - 1] || { rows: [] });
    return queryPromise
      .then((results) => { if (cb) cb(null, results); return results; })
      .catch((error) => { if (cb) cb(error, null); throw error; });
  }
  end(errorCallback) {
    pglite.close().then(() => errorCallback(null)).catch((e) => errorCallback(e));
  }
}
const driver = class { static Pool = EphemeralPool; };

const ds = new DataSource({
  type: "postgres",
  driver,
  entities: getCoreEntities(),
  migrations: [
    ${JSON.stringify(join(repoRoot, "services/platform-core/src/infrastructure/application-database/migrations"))} + "/*.ts",
  ],
  migrationsTableName: FULCRUM_TYPEORM_MIGRATIONS_TABLE,
  synchronize: false,
  installExtensions: false,
  logging: false,
});

try {
  await ds.initialize();
  await ds.runMigrations({ transaction: "none" });

  const seed = new SeedService(ds.manager);
  const first = await seed.run();
  const em = ds.manager;
  const afterFirst = {
    orgs: await em.count(Org, {}),
    users: await em.count(User, {}),
    sessions: await em.count(Session, {}),
    orgMembers: await em.count(OrgMember, {}),
    accounts: await em.count(Account, {}),
    notificationRules: await em.count(NotificationRule, {}),
  };

  const second = await seed.run();
  const afterSecond = {
    orgs: await em.count(Org, {}),
    users: await em.count(User, {}),
    sessions: await em.count(Session, {}),
    orgMembers: await em.count(OrgMember, {}),
    accounts: await em.count(Account, {}),
    notificationRules: await em.count(NotificationRule, {}),
  };

  const rules = await em.find(
    NotificationRule,
    { where: { userId: first.userId }, order: { name: "ASC" } },
  );

  console.log(JSON.stringify({ first, second, afterFirst, afterSecond, rules }));
} finally {
  await ds.destroy();
  await pglite.close().catch(() => {});
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

  test("creates the session with TypeORM em.save", async () => {
    const source = await Bun.file(join(repoRoot, "services/platform-core/src/infrastructure/application-database/seed.ts")).text();

    expect(source).toContain("await this.em.save(session)");
  });

  test.skip("layout-server seed hook deferred to Pillar 13/16", () => {
    // Deferral is documented in apps/web/src/routes/+layout.server.ts for P1#04.
  });
});
