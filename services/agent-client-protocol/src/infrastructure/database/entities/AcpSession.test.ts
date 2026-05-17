import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import { AcpSession } from "@agent-client-protocol/infrastructure/database/entities/AcpSession.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";
import { Migration20260516AcpSessionColumns1778623200002 } from "@platform-core/infrastructure/application-database/migrations/Migration20260516_acp_sessions.ts";
import {
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";

let pglite: PGlite | undefined;
let socketServer: PGLiteSocketServer | undefined;

async function startPgliteSocket(): Promise<string> {
  pglite = await PGlite.create();
  await pglite.waitReady;

  socketServer = new PGLiteSocketServer({
    db: pglite,
    host: "127.0.0.1",
    port: 0,
    maxConnections: 20,
  });
  await socketServer.start();

  const connection = socketServer.getServerConn();
  const [host, port] = connection.split(":");
  return `postgresql://postgres:postgres@${host}:${port}/postgres`;
}

afterEach(async () => {
  if (socketServer) {
    await socketServer.stop();
    socketServer = undefined;
  }
  if (pglite) {
    await pglite.close();
    pglite = undefined;
  }
});

describe("AcpSession entity", () => {
  test("persists and reads back through PGlite", async () => {
    const url = await startPgliteSocket();
    const dataSource = createFulcrumTypeOrmDataSource(
      buildFulcrumTypeOrmOptions({
        source: "pglite-socket",
        url,
        entities: [AcpSession],
        migrations: [
          WorkflowSpine1778623200001,
          Migration20260516AcpSessionColumns1778623200002,
        ],
      }),
    );

    await dataSource.initialize();
    try {
      await dataSource.runMigrations();
      const repo = dataSource.getRepository(AcpSession);

      const saved = await repo.save({
        id: "acp-test-001",
        orgId: "org-1",
        projectId: null,
        traceId: "trace-test",
        agentName: "claude-code",
        cwd: "/tmp/test",
        status: "active",
        mode: "code",
        model: "opus-4",
        modeId: "mode-code",
        modelId: "model-opus",
        permissionMode: "auto-accept",
        trafficLog: [{ direction: "outbound", method: "session/new" }],
      });

      expect(saved.id).toBe("acp-test-001");
      expect(saved.orgId).toBe("org-1");
      expect(saved.cwd).toBe("/tmp/test");
      expect(saved.permissionMode).toBe("auto-accept");
      expect(saved.trafficLog).toEqual([
        { direction: "outbound", method: "session/new" },
      ]);

      const found = await repo.findOneBy({ id: "acp-test-001" });
      expect(found).not.toBeNull();
      expect(found!.agentName).toBe("claude-code");
      expect(found!.modeId).toBe("mode-code");
      expect(found!.modelId).toBe("model-opus");
      expect(found!.status).toBe("active");

      // update status
      await repo.update("acp-test-001", { status: "disconnected" });
      const updated = await repo.findOneBy({ id: "acp-test-001" });
      expect(updated!.status).toBe("disconnected");

      // delete
      await repo.delete("acp-test-001");
      const deleted = await repo.findOneBy({ id: "acp-test-001" });
      expect(deleted).toBeNull();
    } finally {
      await dataSource.destroy();
    }
  });
});
