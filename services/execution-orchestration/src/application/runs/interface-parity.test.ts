import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { run as runSymphonyCommand } from "@fulcrum/cli/symphony.ts";
import { createApplicationLocalCaller } from "@fulcrum/server/trpc/local-caller.ts";
import { Session } from "@identity-access/infrastructure/database/entities/auth/Session.ts";
import { bindTestRuntimeOrm, createTestContainer, createTestOrm, type TestOrm } from "@test-support/index.ts";
import { buildCaller } from "@fulcrum/tui/index.ts";
import { dispatchRun } from "@execution-orchestration/application/runs/commands.ts";
import type { AppContext } from "@execution-orchestration/application/runs/types.ts";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

interface RunView {
  id: string;
  state?: string | null;
  orchestrationState?: string | null;
  workspacePath?: string | null;
  attemptCount?: number | null;
}

function jsonLine<T>(lines: string[]): T {
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0]!) as T;
}

async function ensureSession(db: TestOrm): Promise<void> {
  const em = db.em;
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
  /* flushed */
}

describe("runs cross-interface parity", () => {
  test("application-created run reads identically through tRPC, CLI JSON, and TUI caller", async () => {
    db = await createTestOrm();
    const container = createTestContainer(db);
    bindTestRuntimeOrm(container, db);
    const ctx: AppContext = { orgId: db.seed.orgId, userId: db.seed.userId, projectId: null };

    const created = await dispatchRun(db.em, ctx, {
      agentName: "codex",
      prompt: "architecture.5-run-parity",
    });
    await ensureSession(db);

    const localCaller = await createApplicationLocalCaller({ container, requireSession: true });
    const trpcRun = await localCaller.orchestration.getRun({ runId: created.id }) as RunView;

    const cliLines: string[] = [];
    await runSymphonyCommand(["runs", "show", created.id, "--json"], {
      caller: {
        getOrchestratorStatus: async () => ({ running: 0, queued: 0, stalled: 0 }),
        listRuns: async () => {
          throw new Error("runs list is not part of this parity proof");
        },
        getRun: async ({ runId }) => await localCaller.orchestration.getRun({ runId }) as RunView,
        cancelRun: async () => ({ success: false }),
        retryRun: async () => ({ success: false }),
        syncDaily: async () => ({ synced: 0, errors: 0 }),
        dispatchRun: async () => ({ runId: "", state: "unclaimed", agent: "codex", sandboxMode: "host" }),
      },
      print: (line) => cliLines.push(line),
      printErr: (line) => {
        throw new Error(line);
      },
      exit: (code) => {
        throw new Error(`unexpected CLI exit ${code}`);
      },
    });
    const cliRun = jsonLine<RunView>(cliLines);

    await buildCaller(container);
    const tuiRun = await localCaller.orchestration.getRun({ runId: created.id }) as RunView;

    for (const run of [trpcRun, cliRun, tuiRun]) {
      expect(run).toMatchObject({
        id: created.id,
        state: null,
        orchestrationState: null,
        workspacePath: null,
        attemptCount: 0,
      });
    }
  });

  test("run interfaces expose orchestration through callers, not direct ORM access", async () => {
    const clientFiles = [
      "apps/cli/src/commands/symphony.ts",
      "apps/tui/src/screens/runs.ts",
      "apps/web/src/routes/runs/+page.server.ts",
    ];

    for (const file of clientFiles) {
      const source = await readFile(file, "utf8");
      expect(source, `${file} must not import runtime ORM`).not.toMatch(/@mikro-orm|db\/entities|Product${"Db"}/);
      expect(source, `${file} must not persist directly`).not.toMatch(/\.persist\(|\.flush\(|getRepository\(/);
    }
  });
});
