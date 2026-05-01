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

import { PGliteKyselyDialect } from ${JSON.stringify(moduleUrl("src/db/PGliteKyselyDriver.ts"))};
import { ENTITY_MANAGER_TOKEN } from ${JSON.stringify(moduleUrl("src/db/db.module.ts"))};
import { Org } from ${JSON.stringify(moduleUrl("src/db/entities/auth/Org.ts"))};
import {
  FeatureFlag,
  Invitation,
  OrgMember,
  Session,
  User,
} from ${JSON.stringify(moduleUrl("src/db/entities/auth/index.ts"))};
import { SeedService } from ${JSON.stringify(moduleUrl("src/db/seed.ts"))};
import { registerSeedBindings } from ${JSON.stringify(moduleUrl("src/db/seed.module.ts"))};

const dbDir = process.argv[2];
if (!dbDir) throw new Error("missing db dir");

const pglite = new PGlite(dbDir);
await pglite.waitReady;
const dialect = new PGliteKyselyDialect(() => pglite);
const orm = await MikroORM.init({
  dbName: "postgres",
  driverOptions: dialect,
  entities: [Org, User, Session, Invitation, OrgMember, FeatureFlag],
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
  };

  const second = await seed.run();
  const afterSecondEm = orm.em.fork();
  const afterSecond = {
    orgs: await afterSecondEm.count(Org, {}),
    users: await afterSecondEm.count(User, {}),
    sessions: await afterSecondEm.count(Session, {}),
    orgMembers: await afterSecondEm.count(OrgMember, {}),
  };

  console.log(JSON.stringify({ first, second, afterFirst, afterSecond }));
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
    expect(result.afterFirst).toEqual({ orgs: 1, users: 1, sessions: 1, orgMembers: 1 });
    expect(result.afterSecond).toEqual({ orgs: 1, users: 1, sessions: 1, orgMembers: 1 });
  });

  test("creates the session with MikroORM persistAndFlush", async () => {
    const source = await Bun.file(join(repoRoot, "src/db/seed.ts")).text();

    expect(source).toContain("await em.persistAndFlush(session)");
    expect(source).not.toContain("em.persist(session)");
  });

  test.skip("layout-server seed hook deferred to Pillar 13/16", () => {
    // Deferral is documented in src/web/src/routes/+layout.server.ts for P1#04.
  });
});
