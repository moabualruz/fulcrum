import { afterEach, describe, expect, test } from "bun:test";
import { MikroORM } from "typeorm";

import { run as runSearchCommand } from "@fulcrum/cli/commands/search.ts";
import { createLocalCaller } from "@fulcrum/cli/local-caller.ts";
import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";
import { Session } from "@platform-core/infrastructure/application-database/entities/auth/Session.ts";
import { SearchDocument } from "@platform-core/infrastructure/application-database/entities/search/SearchDocument.ts";
import { createTestContainer, createTestOrm, type TestOrm } from "@test-support/index.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import { searchDocuments } from "@knowledge-workspace/application/search/queries.ts";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

interface SearchOutput {
  results: Array<{ entityId: string; title: string | null; entityKind: string }>;
  total: number;
}

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

describe("search cross-interface parity", () => {
  test("application-indexed document reads identically through tRPC, CLI JSON, and TUI caller", async () => {
    db = await createTestOrm();
    const container = createTestContainer(db);
    container.bind({ provide: MikroORM, useValue: db.orm });
    const entityId = crypto.randomUUID();
    const phrase = "interface-search-parity";
    const em = db.em.fork();
    const row = em.create(SearchDocument, {
      org: em.getReference(Org, db.seed.orgId),
      entityKind: "task",
      entityId,
      title: `Search ${phrase}`,
      body: `Application indexed ${phrase}`,
      projectId: null,
      status: "todo",
      labels: ["parity"],
      metadata: { source: "application" },
      updatedAt: new Date("2026-05-07T00:00:00.000Z"),
    });
    em.persist(row);
    await em.flush();
    await ensureSession(db);

    const appHit = (await searchDocuments(db.em.fork(), phrase, {
      orgId: db.seed.orgId,
      sourceKinds: ["task"],
      limit: 5,
    })).find((hit) => hit.source_id === entityId);

    const localCaller = t.createCallerFactory(appRouter)(createContext({
      session: { userId: db.seed.userId, orgId: db.seed.orgId, activeOrganizationId: db.seed.orgId } as never,
      orgId: db.seed.orgId,
      userId: db.seed.userId,
      em: db.em.fork(),
      container: null,
      legacyStore: {
        query: async (sql: string, params?: readonly unknown[]) => {
          const result = await db!.pglite.query(sql, params as never);
          return Array.isArray(result) ? result : result.rows;
        },
      } as never,
    }));
    const trpcOutput = await localCaller.search.query({
      term: phrase,
      filters: { kinds: ["task"] },
      limit: 5,
    }) as SearchOutput;

    const cliLines: string[] = [];
    await runSearchCommand(["query", phrase, "--kind", "task", "--json"], {
      caller: {
        search: {
          query: async (input: { q: string; kind?: string }) => await localCaller.search.query({
            term: input.q,
            filters: input.kind ? { kinds: [input.kind] } : undefined,
            limit: 5,
          }),
          suggest: async () => ({ suggestions: [] }),
          savedList: async () => [],
          savedCreate: async () => ({}),
          savedDelete: async () => ({ ok: true }),
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
    const cliOutput = jsonLine<SearchOutput>(cliLines);

    await createLocalCaller({ container, requireSession: true });
    const tuiOutput = await localCaller.search.query({
      term: phrase,
      filters: { kinds: ["task"] },
      limit: 5,
    });

    expect(appHit).toMatchObject({ source_id: entityId, title: `Search ${phrase}` });
    for (const output of [trpcOutput, cliOutput, tuiOutput]) {
      expect(output.total).toBeGreaterThan(0);
      expect(output.results.find((hit) => hit.entityId === entityId)).toMatchObject({
        entityId,
        entityKind: "task",
        title: `Search ${phrase}`,
      });
    }
  });
});
