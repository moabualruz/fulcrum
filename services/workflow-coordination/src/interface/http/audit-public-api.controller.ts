import "reflect-metadata";

import {
  Body,
  Controller,
  Get,
  Inject,
  InternalServerErrorException,
  Module,
  NotFoundException,
  Param,
  Patch,
  Query,
  Res,
} from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import { isFeatureEnabled } from "@platform-core/infrastructure/product-store/features.ts";
import { WORKFLOW_AUDIT_ENTITIES } from "@workflow-coordination/infrastructure/database/audit-log.entities.ts";
import { AuditPublicStore } from "@workflow-coordination/infrastructure/database/audit-public-store.ts";

import { AuditListQueryDto, AuditExportQueryDto, AuditExportStatusParamDto, AuditExportStatusQueryDto, AuditExportStatusResponseDto, AuditListResponseDto, AuditRetentionPolicyQueryDto, AuditRetentionPolicySetBodyDto, AuditRetentionPolicyResponseDto } from "./dto/audit.dto.ts";
export { AuditListQueryDto, AuditExportQueryDto, AuditExportStatusParamDto, AuditExportStatusQueryDto, AuditExportStatusResponseDto, AuditListResponseDto, AuditRetentionPolicyQueryDto, AuditRetentionPolicySetBodyDto, AuditRetentionPolicyResponseDto };

export const AUDIT_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.auditPublicApi.options");

export interface AuditPublicApplication {
  queryAuditEvents(input: {
    orgId: string;
    projectId?: string;
    userId?: string;
    kind?: string;
    subjectId?: string;
    verb?: string;
    since?: string;
    until?: string;
    limit?: number;
    offset?: number;
  }): Promise<AuditListResponseDto>;
  getRetentionPolicy?(input: {
    orgId: string;
    projectId?: string | null;
  }): Promise<AuditRetentionPolicyResponseDto | null>;
  listRetentionPolicies?(input: {
    orgId: string;
    projectId?: string | null;
  }): Promise<AuditRetentionPolicyResponseDto[]>;
  setRetentionPolicy?(input: {
    orgId: string;
    projectId?: string | null;
    retainDays: number;
  }): Promise<AuditRetentionPolicyResponseDto>;
  getExportStatus?(input: {
    orgId: string;
    jobId: string;
  }): Promise<AuditExportStatusResponseDto>;
}

export interface AuditPublicApiOptions {
  application?: AuditPublicApplication;
  featuresEnv?: string;
}

export interface HeaderWritableResponse {
  setHeader(name: string, value: string): void;
}

export class AuditPublicApiService {
  constructor(
    private readonly options: AuditPublicApiOptions | null = null,
    private readonly store: AuditPublicStore | null = null,
  ) {}

  async listAuditEvents(query: AuditListQueryDto): Promise<AuditListResponseDto> {
    return await this.queryApplication(query);
  }

  async exportAuditEvents(query: AuditExportQueryDto): Promise<unknown[] | string> {
    const format = query.format ?? "json";
    const result = await this.queryApplication({
      ...query,
      limit: query.limit ?? 100_000,
      offset: query.offset ?? 0,
    });

    if (format === "csv") {
      return eventsToCsv(result.data);
    }
    return result.data;
  }

  async getExportStatus(
    query: AuditExportStatusQueryDto,
    param: AuditExportStatusParamDto,
  ): Promise<AuditExportStatusResponseDto> {
    const application = this.requireApplication();
    if (application.getExportStatus) {
      return await application.getExportStatus({
        orgId: query.orgId,
        jobId: param.jobId,
      });
    }
    throw new NotFoundException({ error: "audit export job not found" });
  }

  async listRetentionPolicies(query: AuditRetentionPolicyQueryDto): Promise<AuditRetentionPolicyResponseDto[]> {
    const application = this.requireApplication();
    const input = {
      orgId: query.orgId,
      projectId: query.projectId,
    };
    if (application.listRetentionPolicies) {
      return await application.listRetentionPolicies(input);
    }
    if (this.store) {
      return await this.store.listRetentionPolicies(input);
    }
    throw new InternalServerErrorException("Audit retention policy facade is not configured.");
  }

  async getRetentionPolicy(query: AuditRetentionPolicyQueryDto): Promise<AuditRetentionPolicyResponseDto | null> {
    const application = this.requireApplication();
    const input = {
      orgId: query.orgId,
      projectId: query.projectId ?? null,
    };
    if (application.getRetentionPolicy) {
      return await application.getRetentionPolicy(input);
    }
    if (this.store) {
      return await this.store.getRetentionPolicy(input);
    }
    throw new InternalServerErrorException("Audit retention policy facade is not configured.");
  }

  async setRetentionPolicy(
    query: AuditRetentionPolicyQueryDto,
    body: AuditRetentionPolicySetBodyDto,
  ): Promise<AuditRetentionPolicyResponseDto> {
    const retainDays = parseBoundedInteger(body.retainDays, 0, 100_000) ?? 0;
    const application = this.requireApplication();
    const input = {
      orgId: query.orgId,
      projectId: query.projectId ?? null,
      retainDays,
    };
    if (application.setRetentionPolicy) {
      return await application.setRetentionPolicy(input);
    }
    if (this.store) {
      return await this.store.setRetentionPolicy(input);
    }
    throw new InternalServerErrorException("Audit retention policy facade is not configured.");
  }

  private async queryApplication(query: AuditListQueryDto): Promise<AuditListResponseDto> {
    const application = this.requireApplication();
    return await application.queryAuditEvents({
      orgId: query.orgId,
      projectId: query.projectId,
      userId: query.userId,
      kind: query.kind,
      subjectId: query.subjectId,
      verb: query.verb,
      since: query.since,
      until: query.until,
      limit: parseBoundedInteger(query.limit, 1, 100_000),
      offset: parseBoundedInteger(query.offset, 0, 100_000),
    });
  }

  private requireApplication(): AuditPublicApplication {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    const application = this.options?.application;
    if (application) return application;
    if (this.store) {
      return {
        queryAuditEvents: (input) => this.store!.queryAuditEvents(input),
      };
    }
    throw new InternalServerErrorException("Audit public API application facade is not configured.");
  }
}

export class AuditPublicApiController {
  constructor(private readonly audit: AuditPublicApiService) {}

  async listAuditEvents(query: AuditListQueryDto): Promise<AuditListResponseDto> {
    return await this.audit.listAuditEvents(query);
  }

  async exportAuditEvents(
    query: AuditExportQueryDto,
    response?: HeaderWritableResponse,
  ): Promise<unknown[] | string> {
    const exported = await this.audit.exportAuditEvents(query);
    if ((query.format ?? "json") === "csv") {
      response?.setHeader("content-type", "text/csv; charset=utf-8");
      response?.setHeader("content-disposition", 'attachment; filename="audit.csv"');
    }
    return exported;
  }

  async getExportStatus(
    query: AuditExportStatusQueryDto,
    param: AuditExportStatusParamDto,
  ): Promise<AuditExportStatusResponseDto> {
    return await this.audit.getExportStatus(query, param);
  }

  async getRetentionPolicy(
    query: AuditRetentionPolicyQueryDto,
  ): Promise<AuditRetentionPolicyResponseDto | null> {
    return await this.audit.getRetentionPolicy(query);
  }

  async listRetentionPolicies(
    query: AuditRetentionPolicyQueryDto,
  ): Promise<AuditRetentionPolicyResponseDto[]> {
    return await this.audit.listRetentionPolicies(query);
  }

  async setRetentionPolicy(
    query: AuditRetentionPolicyQueryDto,
    body: AuditRetentionPolicySetBodyDto,
  ): Promise<AuditRetentionPolicyResponseDto> {
    return await this.audit.setRetentionPolicy(query, body);
  }
}

export class AuditPublicApiModule {
  static register(options: AuditPublicApiOptions): NestDynamicModule {
    return {
      module: AuditPublicApiModule,
      imports: [TypeOrmModule.forFeature(WORKFLOW_AUDIT_ENTITIES)],
      controllers: [AuditPublicApiController],
      providers: [
        { provide: AUDIT_PUBLIC_API_OPTIONS, useValue: options },
        AuditPublicStore,
        AuditPublicApiService,
      ],
      exports: [AuditPublicApiService],
    };
  }
}

function parseBoundedInteger(
  value: number | string | undefined,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined) return undefined;
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return undefined;
  return Math.min(Math.max(parsed, min), max);
}

function eventValue(event: unknown, key: string): unknown {
  if (!event || typeof event !== "object") return undefined;
  return (event as Record<string, unknown>)[key];
}

function csvEscape(value: unknown): string {
  const text = value instanceof Date
    ? value.toISOString()
    : typeof value === "string"
      ? value
      : JSON.stringify(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function eventsToCsv(events: unknown[]): string {
  const headers = ["id", "orgId", "projectId", "userId", "verb", "subjectKind", "subjectId", "payload", "createdAt"];
  const rows = events.map((event) => headers.map((header) => csvEscape(eventValue(event, header))).join(","));
  return [headers.join(","), ...rows].join("\n");
}

Inject(AUDIT_PUBLIC_API_OPTIONS)(AuditPublicApiService, undefined, 0);
Inject(AuditPublicStore)(AuditPublicApiService, undefined, 1);
Inject(DataSource)(AuditPublicStore, undefined, 0);
Inject(AuditPublicApiService)(AuditPublicApiController, undefined, 0);

IsString()(AuditListQueryDto.prototype, "orgId");
MinLength(1)(AuditListQueryDto.prototype, "orgId");
for (const property of ["projectId", "userId", "kind", "subjectId", "verb", "since", "until"] as const) {
  IsOptional()(AuditListQueryDto.prototype, property);
  IsString()(AuditListQueryDto.prototype, property);
  MinLength(1)(AuditListQueryDto.prototype, property);
}
for (const property of ["limit", "offset"] as const) {
  IsOptional()(AuditListQueryDto.prototype, property);
  Type(() => Number)(AuditListQueryDto.prototype, property);
  IsInt()(AuditListQueryDto.prototype, property);
}
Min(1)(AuditListQueryDto.prototype, "limit");
Max(100_000)(AuditListQueryDto.prototype, "limit");
Min(0)(AuditListQueryDto.prototype, "offset");
Max(100_000)(AuditListQueryDto.prototype, "offset");

IsOptional()(AuditExportQueryDto.prototype, "format");
IsIn(["json", "csv"])(AuditExportQueryDto.prototype, "format");

const listAuditEventsDescriptor = Object.getOwnPropertyDescriptor(
  AuditPublicApiController.prototype,
  "listAuditEvents",
);
const exportAuditEventsDescriptor = Object.getOwnPropertyDescriptor(
  AuditPublicApiController.prototype,
  "exportAuditEvents",
);
const getExportStatusDescriptor = Object.getOwnPropertyDescriptor(
  AuditPublicApiController.prototype,
  "getExportStatus",
);
const getRetentionPolicyDescriptor = Object.getOwnPropertyDescriptor(
  AuditPublicApiController.prototype,
  "getRetentionPolicy",
);
const listRetentionPoliciesDescriptor = Object.getOwnPropertyDescriptor(
  AuditPublicApiController.prototype,
  "listRetentionPolicies",
);
const setRetentionPolicyDescriptor = Object.getOwnPropertyDescriptor(
  AuditPublicApiController.prototype,
  "setRetentionPolicy",
);

if (
  !listAuditEventsDescriptor ||
  !exportAuditEventsDescriptor ||
  !getExportStatusDescriptor ||
  !getRetentionPolicyDescriptor ||
  !listRetentionPoliciesDescriptor ||
  !setRetentionPolicyDescriptor
) {
  throw new Error("AuditPublicApiController route descriptors are missing");
}

Controller("api/v1/audit")(AuditPublicApiController);
ApiTags("audit")(AuditPublicApiController);

Get()(AuditPublicApiController.prototype, "listAuditEvents", listAuditEventsDescriptor);
Query()(AuditPublicApiController.prototype, "listAuditEvents", 0);
ApiOperation({ summary: "Query audit events" })(
  AuditPublicApiController.prototype,
  "listAuditEvents",
  listAuditEventsDescriptor,
);
ApiOkResponse({ type: AuditListResponseDto })(
  AuditPublicApiController.prototype,
  "listAuditEvents",
  listAuditEventsDescriptor,
);

Get("export")(AuditPublicApiController.prototype, "exportAuditEvents", exportAuditEventsDescriptor);
Query()(AuditPublicApiController.prototype, "exportAuditEvents", 0);
Res({ passthrough: true })(AuditPublicApiController.prototype, "exportAuditEvents", 1);
ApiOperation({ summary: "Export audit events as CSV or JSON" })(
  AuditPublicApiController.prototype,
  "exportAuditEvents",
  exportAuditEventsDescriptor,
);
ApiOkResponse({ description: "Audit export" })(
  AuditPublicApiController.prototype,
  "exportAuditEvents",
  exportAuditEventsDescriptor,
);

IsString()(AuditExportStatusParamDto.prototype, "jobId");
MinLength(1)(AuditExportStatusParamDto.prototype, "jobId");
IsString()(AuditExportStatusQueryDto.prototype, "orgId");
MinLength(1)(AuditExportStatusQueryDto.prototype, "orgId");

Get("export/:jobId")(AuditPublicApiController.prototype, "getExportStatus", getExportStatusDescriptor);
Query()(AuditPublicApiController.prototype, "getExportStatus", 0);
Param()(AuditPublicApiController.prototype, "getExportStatus", 1);
ApiOperation({ summary: "Get audit export job status" })(
  AuditPublicApiController.prototype,
  "getExportStatus",
  getExportStatusDescriptor,
);
ApiOkResponse({ type: AuditExportStatusResponseDto })(
  AuditPublicApiController.prototype,
  "getExportStatus",
  getExportStatusDescriptor,
);

for (const property of ["orgId", "projectId"] as const) {
  if (property === "projectId") IsOptional()(AuditRetentionPolicyQueryDto.prototype, property);
  IsString()(AuditRetentionPolicyQueryDto.prototype, property);
  MinLength(1)(AuditRetentionPolicyQueryDto.prototype, property);
}
Type(() => Number)(AuditRetentionPolicySetBodyDto.prototype, "retainDays");
IsInt()(AuditRetentionPolicySetBodyDto.prototype, "retainDays");
Min(0)(AuditRetentionPolicySetBodyDto.prototype, "retainDays");
Max(100_000)(AuditRetentionPolicySetBodyDto.prototype, "retainDays");

Get("retention-policy")(AuditPublicApiController.prototype, "getRetentionPolicy", getRetentionPolicyDescriptor);
Query()(AuditPublicApiController.prototype, "getRetentionPolicy", 0);
ApiOperation({ summary: "Get audit retention policy" })(
  AuditPublicApiController.prototype,
  "getRetentionPolicy",
  getRetentionPolicyDescriptor,
);
ApiOkResponse({ type: AuditRetentionPolicyResponseDto })(
  AuditPublicApiController.prototype,
  "getRetentionPolicy",
  getRetentionPolicyDescriptor,
);

Get("retention-policies")(AuditPublicApiController.prototype, "listRetentionPolicies", listRetentionPoliciesDescriptor);
Query()(AuditPublicApiController.prototype, "listRetentionPolicies", 0);
ApiOperation({ summary: "List audit retention policies" })(
  AuditPublicApiController.prototype,
  "listRetentionPolicies",
  listRetentionPoliciesDescriptor,
);
ApiOkResponse({ type: AuditRetentionPolicyResponseDto, isArray: true })(
  AuditPublicApiController.prototype,
  "listRetentionPolicies",
  listRetentionPoliciesDescriptor,
);

Patch("retention-policy")(AuditPublicApiController.prototype, "setRetentionPolicy", setRetentionPolicyDescriptor);
Query()(AuditPublicApiController.prototype, "setRetentionPolicy", 0);
Body()(AuditPublicApiController.prototype, "setRetentionPolicy", 1);
ApiOperation({ summary: "Set audit retention policy" })(
  AuditPublicApiController.prototype,
  "setRetentionPolicy",
  setRetentionPolicyDescriptor,
);
ApiOkResponse({ type: AuditRetentionPolicyResponseDto })(
  AuditPublicApiController.prototype,
  "setRetentionPolicy",
  setRetentionPolicyDescriptor,
);

Module({
  imports: [TypeOrmModule.forFeature(WORKFLOW_AUDIT_ENTITIES)],
  controllers: [AuditPublicApiController],
  providers: [
    { provide: AUDIT_PUBLIC_API_OPTIONS, useValue: null },
    AuditPublicStore,
    AuditPublicApiService,
  ],
  exports: [AuditPublicApiService],
})(AuditPublicApiModule);
