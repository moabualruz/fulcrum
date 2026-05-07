import { afterEach, describe, expect, test } from "bun:test";
import { MikroORM } from "@mikro-orm/postgresql";

import { run as runArtifactsCommand } from "../../cli/commands/artifacts.ts";
import { createLocalCaller } from "../../cli/local-caller.ts";
import { Org } from "../../db/entities/auth/Org.ts";
import { Session } from "../../db/entities/auth/Session.ts";
import { createTestContainer, createTestOrm, type TestOrm } from "../../test-utils/index.ts";
import { buildCaller } from "../../tui/index.ts";
import { createArtifact } from "./commands.ts";
import type { AppContext } from "./types.ts";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

interface ArtifactView {
  id: string;
  orgId: string;
  filename: string;
  path: string;
  mime: string | null;
  sizeBytes?: string;
  archived?: boolean;
}

function jsonLine<T>(lines: string[]): T {
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0]!) as T;
}

async function createOrg(db: TestOrm): Promise<string> {
  const em = db.em.fork();
  const orgId = crypto.randomUUID();
  em.persist(em.create(Org, {
    id: orgId,
    name: "Artifact Parity",
    slug: `artifact-parity-${orgId.slice(0, 8)}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  await em.flush();
  return orgId;
}

async function ensureSession(db: TestOrm, orgId = db.seed.orgId): Promise<void> {
  const em = db.em.fork();
  em.persist(em.create(Session, {
    id: `parity-${crypto.randomUUID()}`,
    userId: db.seed.userId,
    orgId,
    activeOrganizationId: orgId,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    ipAddress: null,
    userAgent: "test",
  }));
  await em.flush();
}

describe("artifacts cross-interface parity", () => {
  test("application-created artifact reads identically through tRPC, CLI JSON, and TUI caller", async () => {
    db = await createTestOrm();
    const container = createTestContainer(db);
    container.bind({ provide: MikroORM, useValue: db.orm });
    const orgId = await createOrg(db);
    const ctx: AppContext = { orgId, userId: db.seed.userId, projectId: null };

    const created = await createArtifact(db.em.fork(), ctx, {
      filename: "phase95-parity.txt",
      path: "memory://phase95-parity.txt",
      mime: "text/plain",
    });
    await ensureSession(db, orgId);

    const localCaller = await createLocalCaller({ container, requireSession: true });
    const trpcArtifact = await localCaller.artifacts.get({ id: created.id }) as ArtifactView;

    const cliLines: string[] = [];
    await runArtifactsCommand(["show", created.id, "--json"], {
      caller: localCaller as never,
      print: (line) => cliLines.push(line),
      printErr: (line) => {
        throw new Error(line);
      },
      exit: (code) => {
        throw new Error(`unexpected CLI exit ${code}`);
      },
    });
    const cliArtifact = jsonLine<ArtifactView>(cliLines);

    await buildCaller(container);
    const tuiArtifact = ((await localCaller.artifacts.list({}) as ArtifactView[]) ?? [])
      .find((artifact) => artifact.id === created.id);

    expect(tuiArtifact, "TUI caller returned no application-created artifact").toBeDefined();
    for (const artifact of [trpcArtifact, cliArtifact, tuiArtifact]) {
      expect(artifact).toMatchObject({
        id: created.id,
        orgId,
        filename: "phase95-parity.txt",
        path: "memory://phase95-parity.txt",
        mime: "text/plain",
        sizeBytes: "0",
        archived: false,
      });
    }
  });
});
