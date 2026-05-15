import "reflect-metadata";

import { describe, expect, mock, test } from "bun:test";

import { InternalServerErrorException, NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import { AppModule } from "@fulcrum/server/app.module.ts";
import {
  AuditExportQueryDto,
  AuditExportStatusParamDto,
  AuditExportStatusQueryDto,
  AuditListQueryDto,
  AuditPublicApiController,
  AuditPublicApiModule,
  AuditPublicApiService,
  AuditRetentionPolicyQueryDto,
  AuditRetentionPolicySetBodyDto,
} from "@workflow-coordination/interface/http/audit-public-api.controller.ts";

describe("audit public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AuditPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(AuditPublicApiController);
    expect(appImports).toContain(AuditPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, AuditPublicApiController)).toBe("api/v1/audit");
    expect(Reflect.getMetadata(PATH_METADATA, AuditPublicApiController.prototype.listAuditEvents)).toBe("/");
    expect(Reflect.getMetadata(METHOD_METADATA, AuditPublicApiController.prototype.listAuditEvents)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, AuditPublicApiController.prototype.exportAuditEvents)).toBe("export");
    expect(Reflect.getMetadata(METHOD_METADATA, AuditPublicApiController.prototype.exportAuditEvents)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, AuditPublicApiController.prototype.getExportStatus)).toBe(
      "export/:jobId",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, AuditPublicApiController.prototype.getExportStatus)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, AuditPublicApiController.prototype.getRetentionPolicy)).toBe(
      "retention-policy",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, AuditPublicApiController.prototype.getRetentionPolicy)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, AuditPublicApiController.prototype.listRetentionPolicies)).toBe(
      "retention-policies",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, AuditPublicApiController.prototype.listRetentionPolicies)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, AuditPublicApiController.prototype.setRetentionPolicy)).toBe(
      "retention-policy",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, AuditPublicApiController.prototype.setRetentionPolicy)).toBe(
      RequestMethod.PATCH,
    );
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const original = process.env.FULCRUM_FEATURES;
    delete process.env.FULCRUM_FEATURES;
    try {
      const controller = new AuditPublicApiController(new AuditPublicApiService());

      await expect(controller.listAuditEvents({ orgId: "org-1" })).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      if (original === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = original;
    }
  });

  test("fails closed when the public API feature is on but the application facade is not configured", async () => {
    const original = process.env.FULCRUM_FEATURES;
    process.env.FULCRUM_FEATURES = "public-api";
    try {
      const controller = new AuditPublicApiController(new AuditPublicApiService());

      await expect(controller.listAuditEvents({ orgId: "org-1" })).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    } finally {
      if (original === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = original;
    }
  });

  test("delegates audit queries to the application facade with filters", async () => {
    const queryAuditEvents = mock(async () => ({
      data: [{
        id: "audit-1",
        orgId: "org-1",
        userId: "user-1",
        verb: "task.created",
        subjectKind: "task",
        subjectId: "task-1",
        payload: { traceId: "trace-1" },
        createdAt: "2026-05-14T00:00:00.000Z",
      }],
      total: 1,
    }));
    const controller = new AuditPublicApiController(
      new AuditPublicApiService({
        featuresEnv: "public-api",
        application: { queryAuditEvents },
      }),
    );

    await expect(controller.listAuditEvents({
      orgId: "org-1",
      projectId: "project-1",
      userId: "user-1",
      kind: "task",
      subjectId: "task-1",
      verb: "task.created",
      since: "2026-05-01T00:00:00.000Z",
      until: "2026-05-31T00:00:00.000Z",
      limit: 25,
      offset: 5,
    })).resolves.toEqual({
      data: [expect.objectContaining({ id: "audit-1", subjectKind: "task" })],
      total: 1,
    });
    expect(queryAuditEvents).toHaveBeenCalledWith({
      orgId: "org-1",
      projectId: "project-1",
      userId: "user-1",
      kind: "task",
      subjectId: "task-1",
      verb: "task.created",
      since: "2026-05-01T00:00:00.000Z",
      until: "2026-05-31T00:00:00.000Z",
      limit: 25,
      offset: 5,
    });
  });

  test("exports JSON rows and CSV text without going through a Hono route", async () => {
    const queryAuditEvents = mock(async () => ({
      data: [{
        id: "audit-1",
        orgId: "org-1",
        userId: "user-1",
        verb: "task.created",
        subjectKind: "task",
        subjectId: "task-1",
        payload: { traceId: "trace-1" },
        createdAt: "2026-05-14T00:00:00.000Z",
      }],
      total: 1,
    }));
    const headers = new Map<string, string>();
    const response = { setHeader: (name: string, value: string) => headers.set(name.toLowerCase(), value) };
    const controller = new AuditPublicApiController(
      new AuditPublicApiService({
        featuresEnv: "public-api",
        application: { queryAuditEvents },
      }),
    );

    await expect(controller.exportAuditEvents({ orgId: "org-1", format: "json" }, response)).resolves.toEqual([
      expect.objectContaining({ id: "audit-1", verb: "task.created" }),
    ]);
    await expect(controller.exportAuditEvents({ orgId: "org-1", format: "csv" }, response)).resolves.toContain(
      "id,orgId,projectId,userId,verb,subjectKind,subjectId,payload,createdAt",
    );
    expect(headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(headers.get("content-disposition")).toBe('attachment; filename="audit.csv"');
  });

  test("delegates export job status to the application facade", async () => {
    const getExportStatus = mock(async () => ({
      status: "completed" as const,
      format: "json" as const,
      content: '[{"id":"audit-1"}]',
    }));
    const controller = new AuditPublicApiController(
      new AuditPublicApiService({
        featuresEnv: "public-api",
        application: {
          queryAuditEvents: async () => ({ data: [], total: 0 }),
          getExportStatus,
        },
      }),
    );

    await expect(controller.getExportStatus({ orgId: "org-1" }, { jobId: "job-1" })).resolves.toEqual({
      status: "completed",
      format: "json",
      content: '[{"id":"audit-1"}]',
    });
    expect(getExportStatus).toHaveBeenCalledWith({ orgId: "org-1", jobId: "job-1" });
  });

  test("delegates retention policy get and set to the application facade", async () => {
    const getRetentionPolicy = mock(async () => null);
    const listRetentionPolicies = mock(async () => [{
      id: "policy-1",
      orgId: "org-1",
      projectId: null,
      retainDays: 90,
      createdAt: "2026-05-14T00:00:00.000Z",
      updatedAt: "2026-05-14T00:00:00.000Z",
    }]);
    const setRetentionPolicy = mock(async () => ({
      id: "policy-1",
      orgId: "org-1",
      projectId: null,
      retainDays: 90,
      createdAt: "2026-05-14T00:00:00.000Z",
      updatedAt: "2026-05-14T00:00:00.000Z",
    }));
    const controller = new AuditPublicApiController(
      new AuditPublicApiService({
        featuresEnv: "public-api",
        application: {
          queryAuditEvents: async () => ({ data: [], total: 0 }),
          getRetentionPolicy,
          listRetentionPolicies,
          setRetentionPolicy,
        },
      }),
    );

    await expect(controller.getRetentionPolicy({ orgId: "org-1" })).resolves.toBeNull();
    await expect(controller.setRetentionPolicy({ orgId: "org-1" }, { retainDays: 90 })).resolves.toMatchObject({
      id: "policy-1",
      orgId: "org-1",
      projectId: null,
      retainDays: 90,
    });
    await expect(controller.listRetentionPolicies({ orgId: "org-1" })).resolves.toEqual([
      expect.objectContaining({ id: "policy-1", retainDays: 90 }),
    ]);
    expect(getRetentionPolicy).toHaveBeenCalledWith({ orgId: "org-1", projectId: null });
    expect(listRetentionPolicies).toHaveBeenCalledWith({ orgId: "org-1", projectId: undefined });
    expect(setRetentionPolicy).toHaveBeenCalledWith({ orgId: "org-1", projectId: null, retainDays: 90 });
  });

  test("keeps request validation at the Nest boundary", () => {
    const query = Object.assign(new AuditListQueryDto(), {
      orgId: "org-1",
      projectId: "project-1",
      kind: "task",
      subjectId: "task-1",
      verb: "task.created",
      since: "2026-05-01T00:00:00.000Z",
      limit: 25,
      offset: 0,
    });
    const invalidQuery = Object.assign(new AuditListQueryDto(), { orgId: "", limit: 0, offset: -1 });
    const exportQuery = Object.assign(new AuditExportQueryDto(), { orgId: "org-1", format: "csv" });
    const invalidExportQuery = Object.assign(new AuditExportQueryDto(), { orgId: "org-1", format: "xml" });
    const exportStatusParam = Object.assign(new AuditExportStatusParamDto(), { jobId: "job-1" });
    const invalidExportStatusParam = Object.assign(new AuditExportStatusParamDto(), { jobId: "" });
    const exportStatusQuery = Object.assign(new AuditExportStatusQueryDto(), { orgId: "org-1" });
    const invalidExportStatusQuery = Object.assign(new AuditExportStatusQueryDto(), { orgId: "" });
    const retentionQuery = Object.assign(new AuditRetentionPolicyQueryDto(), { orgId: "org-1" });
    const invalidRetentionQuery = Object.assign(new AuditRetentionPolicyQueryDto(), { orgId: "" });
    const retentionBody = Object.assign(new AuditRetentionPolicySetBodyDto(), { retainDays: 90 });
    const invalidRetentionBody = Object.assign(new AuditRetentionPolicySetBodyDto(), { retainDays: -1 });

    expect(validateSync(query)).toHaveLength(0);
    expect(validateSync(invalidQuery).map((error) => error.property)).toEqual(["orgId", "limit", "offset"]);
    expect(validateSync(exportQuery)).toHaveLength(0);
    expect(validateSync(invalidExportQuery).map((error) => error.property)).toEqual(["format"]);
    expect(validateSync(exportStatusParam)).toHaveLength(0);
    expect(validateSync(invalidExportStatusParam).map((error) => error.property)).toEqual(["jobId"]);
    expect(validateSync(exportStatusQuery)).toHaveLength(0);
    expect(validateSync(invalidExportStatusQuery).map((error) => error.property)).toEqual(["orgId"]);
    expect(validateSync(retentionQuery)).toHaveLength(0);
    expect(validateSync(invalidRetentionQuery).map((error) => error.property)).toEqual(["orgId"]);
    expect(validateSync(retentionBody)).toHaveLength(0);
    expect(validateSync(invalidRetentionBody).map((error) => error.property)).toEqual(["retainDays"]);
  });
});
