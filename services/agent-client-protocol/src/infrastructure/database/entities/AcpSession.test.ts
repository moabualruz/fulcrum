import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import { AcpSession } from "@agent-client-protocol/infrastructure/database/entities/AcpSession.ts";
import { AcpSessionCheckpoint } from "@agent-client-protocol/infrastructure/database/entities/AcpSessionCheckpoint.ts";
import { AcpSessionRepository } from "@agent-client-protocol/infrastructure/database/repositories/AcpSessionRepository.ts";
import type { TrafficEntry } from "@agent-client-protocol/application/traffic.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";
import { Migration20260516AcpSessionColumns1778623200002 } from "@platform-core/infrastructure/application-database/migrations/Migration20260516_acp_sessions.ts";
import { Migration20260519AcpSessionPauseResumeCheckpoints1778841600000 } from "@platform-core/infrastructure/application-database/migrations/Migration20260519_acp_session_checkpoints.ts";
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
        entities: [AcpSession, AcpSessionCheckpoint],
        migrations: [
          WorkflowSpine1778623200001,
          Migration20260516AcpSessionColumns1778623200002,
          Migration20260519AcpSessionPauseResumeCheckpoints1778841600000,
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

  test("reloads AI Assist session state with bounded persisted traffic", async () => {
    const url = await startPgliteSocket();
    const dataSource = createFulcrumTypeOrmDataSource(
      buildFulcrumTypeOrmOptions({
        source: "pglite-socket",
        url,
        entities: [AcpSession, AcpSessionCheckpoint],
        migrations: [
          WorkflowSpine1778623200001,
          Migration20260516AcpSessionColumns1778623200002,
          Migration20260519AcpSessionPauseResumeCheckpoints1778841600000,
        ],
      }),
    );

    await dataSource.initialize();
    try {
      await dataSource.runMigrations();
      const repo = new AcpSessionRepository(dataSource.getRepository(AcpSession));

      await repo.save({
        id: "ai-assist-session-001",
        orgId: "org-1",
        projectId: null,
        traceId: "trace-ai-assist-001",
        agentName: "codex",
        cwd: "/workspace/fulcrum",
        status: "active",
        mode: "plan",
        model: "gpt-5.2",
        modeId: "mode-plan",
        modelId: "model-gpt-5.2",
        permissionMode: "request",
        trafficLog: [],
      });

      const traffic = (method: string, id: string): TrafficEntry => ({
        id,
        timestamp: 1778623200000,
        direction: "out",
        type: "request",
        method,
        payload: { method },
      });

      await repo.appendTraffic(
        "ai-assist-session-001",
        [
          traffic("initialize", "traffic-1"),
          traffic("session/new", "traffic-2"),
          traffic("session/request_permission", "traffic-3"),
          traffic("session/prompt", "traffic-4"),
        ],
        3,
      );
      await repo.updatePermissionMode("ai-assist-session-001", "approve-edits");
      await repo.pause("ai-assist-session-001", "manual");
      await repo.createCheckpoint({
        id: "checkpoint-001",
        sessionId: "ai-assist-session-001",
        kind: "message",
        ref: "message-4",
        turnIndex: 4,
        messageUuid: "message-uuid-4",
        label: "Before tool run",
      });

      const reloaded = await repo.findById("ai-assist-session-001");
      expect(reloaded).not.toBeNull();
      expect(reloaded).toMatchObject({
        traceId: "trace-ai-assist-001",
        mode: "plan",
        model: "gpt-5.2",
        cwd: "/workspace/fulcrum",
        permissionMode: "approve-edits",
        status: "paused",
        pausedReason: "manual",
        currentCheckpointId: "checkpoint-001",
      });
      expect(reloaded!.trafficLog).toHaveLength(3);
      expect(reloaded!.trafficLog[0]).toMatchObject({
        method: "session/new",
        truncated: true,
        droppedCount: 1,
      });
      expect(reloaded!.trafficLog[1]).toMatchObject({ method: "session/request_permission" });
      expect(reloaded!.trafficLog[2]).toMatchObject({ method: "session/prompt" });

      await repo.resume("ai-assist-session-001");
      const resumed = await repo.findById("ai-assist-session-001");
      expect(resumed).toMatchObject({ status: "active", pausedReason: null });

      await repo.abort("ai-assist-session-001", {
        reason: "user-requested",
        note: "Stopped from CLI",
        artifactsPath: "/tmp/fulcrum/artifacts",
      });
      const aborted = await repo.findById("ai-assist-session-001");
      expect(aborted).toMatchObject({
        status: "aborted",
        abortReason: "user-requested",
        abortNote: "Stopped from CLI",
        artifactsPath: "/tmp/fulcrum/artifacts",
      });
    } finally {
      await dataSource.destroy();
    }
  });
});
