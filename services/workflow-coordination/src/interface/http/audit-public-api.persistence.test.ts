import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { BadRequestException } from "@nestjs/common";

import {
  WORKFLOW_AUDIT_ENTITIES,
  WorkflowAuditEventEntity,
} from "@workflow-coordination/infrastructure/database/audit-log.entities.ts";
import { WorkflowAudit1778623200008 } from "@workflow-coordination/infrastructure/database/audit-log.migration.ts";
import { AuditPublicStore } from "@workflow-coordination/infrastructure/database/audit-public-store.ts";
import {
  AuditPublicApiController,
  AuditPublicApiService,
} from "@workflow-coordination/interface/http/audit-public-api.controller.ts";
import {
  type FulcrumTypeOrmConnectionSource,
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { startTemporaryPostgres, type TemporaryPostgres } from "@test-support/temporary-postgres.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG_ID = "22222222-2222-4222-8222-222222222222";
const AUDIT_ID = "33333333-3333-4333-8333-333333333333";

let pglite: PGlite | undefined;
let socketServer: PGLiteSocketServer | undefined;
let postgres: TemporaryPostgres | undefined;

class HeaderCapture {
  readonly headers = new Map<string, string>();

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }
}

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

  const [host, port] = socketServer.getServerConn().split(":");
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
  if (postgres) {
    await postgres.stop();
    postgres = undefined;
  }
});

async function assertAuditPublicApiRoundTrip(
  source: FulcrumTypeOrmConnectionSource,
  url: string,
): Promise<void> {
  const dataSource = createFulcrumTypeOrmDataSource(
    buildFulcrumTypeOrmOptions({
      source,
      url,
      entities: WORKFLOW_AUDIT_ENTITIES,
      migrations: [WorkflowAudit1778623200008],
    }),
  );

  await dataSource.initialize();
  try {
    const migrations = await dataSource.runMigrations();
    expect(migrations.map((migration) => migration.name)).toEqual([
      "WorkflowAudit1778623200008",
    ]);

    await dataSource.getRepository(WorkflowAuditEventEntity).save([
      {
        id: AUDIT_ID,
        orgId: ORG_ID,
        projectId: "project-1",
        userId: "user-1",
        verb: "task.created",
        subjectKind: "task",
        subjectId: "task-1",
        payload: { traceId: `trace-audit-${source}` },
        traceId: `trace-audit-${source}`,
        createdAt: new Date("2026-05-14T00:00:00.000Z"),
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        orgId: OTHER_ORG_ID,
        projectId: "project-1",
        userId: "user-2",
        verb: "task.created",
        subjectKind: "task",
        subjectId: "task-2",
        payload: { traceId: `trace-other-${source}` },
        traceId: `trace-other-${source}`,
        createdAt: new Date("2026-05-14T00:01:00.000Z"),
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        orgId: ORG_ID,
        projectId: "project-2",
        userId: "user-2",
        verb: "task.created",
        subjectKind: "task",
        subjectId: "task-3",
        payload: { traceId: `trace-user-filter-${source}` },
        traceId: `trace-user-filter-${source}`,
        createdAt: new Date("2026-05-14T00:02:00.000Z"),
      },
    ]);

    const controller = new AuditPublicApiController(
      new AuditPublicApiService(
        { featuresEnv: "public-api" },
        new AuditPublicStore(dataSource),
      ),
    );

    await expect(controller.listAuditEvents({
      orgId: ORG_ID,
      projectId: "project-1",
      userId: "user-1",
      kind: "task",
      subjectId: "task-1",
      verb: "task.created",
      traceId: `trace-audit-${source}`,
      since: "2026-05-13T00:00:00.000Z",
      until: "2026-05-15T00:00:00.000Z",
      limit: 25,
      offset: 0,
    })).resolves.toEqual({
      data: [
        expect.objectContaining({
          id: AUDIT_ID,
          orgId: ORG_ID,
          projectId: "project-1",
          userId: "user-1",
          verb: "task.created",
          subjectKind: "task",
          subjectId: "task-1",
          traceId: `trace-audit-${source}`,
          createdAt: "2026-05-14T00:00:00.000Z",
        }),
      ],
      total: 1,
    });

    const jsonHeaders = new HeaderCapture();
    await expect(controller.exportAuditEvents({
      orgId: ORG_ID,
      projectId: "project-1",
      userId: "user-1",
      format: "json",
    }, jsonHeaders)).resolves.toEqual([
      expect.objectContaining({ id: AUDIT_ID, traceId: `trace-audit-${source}` }),
    ]);
    const jobId = jsonHeaders.headers.get("x-fulcrum-audit-export-job-id");
    expect(jobId).toEqual(expect.any(String));
    await expect(controller.getExportStatus({ orgId: ORG_ID }, { jobId: jobId! })).resolves.toMatchObject({
      status: "completed",
      format: "json",
      content: expect.stringContaining(AUDIT_ID),
    });
    const csvHeaders = new HeaderCapture();
    await expect(controller.exportAuditEvents({ orgId: ORG_ID, format: "csv" }, csvHeaders)).resolves.toContain(
      "id,orgId,projectId,userId,verb,subjectKind,subjectId,payload,createdAt",
    );
    expect(csvHeaders.headers.get("content-type")).toBe("text/csv; charset=utf-8");

    await expect(controller.getRetentionPolicy({ orgId: ORG_ID })).resolves.toBeNull();
    await expect(controller.setRetentionPolicy({ orgId: ORG_ID }, { retainDays: 30 })).resolves.toMatchObject({
      orgId: ORG_ID,
      projectId: null,
      retainDays: 30,
    });
    await expect(controller.setRetentionPolicy({
      orgId: ORG_ID,
      projectId: "project-1",
    }, { retainDays: 45 })).resolves.toMatchObject({
      orgId: ORG_ID,
      projectId: "project-1",
      retainDays: 45,
    });
    await expect(controller.listRetentionPolicies({ orgId: ORG_ID })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ orgId: ORG_ID, projectId: null, retainDays: 30 }),
        expect.objectContaining({ orgId: ORG_ID, projectId: "project-1", retainDays: 45 }),
      ]),
    );
    await expect(controller.listRetentionPolicies({
      orgId: ORG_ID,
      projectId: "project-1",
    })).resolves.toEqual([
      expect.objectContaining({ orgId: ORG_ID, projectId: "project-1", retainDays: 45 }),
    ]);
    await expect(controller.getRetentionPolicy({ orgId: ORG_ID })).resolves.toMatchObject({
      orgId: ORG_ID,
      projectId: null,
      retainDays: 30,
    });
    await expect(controller.setRetentionPolicy({ orgId: ORG_ID }, { retainDays: 0 })).resolves.toMatchObject({
      orgId: ORG_ID,
      projectId: null,
      retainDays: 0,
    });
    await expect(controller.setRetentionPolicy({ orgId: ORG_ID }, { retainDays: -1 }))
      .rejects.toBeInstanceOf(BadRequestException);
  } finally {
    await dataSource.destroy();
  }
}

describe("audit public API TypeORM persistence", () => {
  test("serves query and export through PGlite socket", async () => {
    await assertAuditPublicApiRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("serves query and export through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertAuditPublicApiRoundTrip("postgres", postgres.url);
  });
});
