import "reflect-metadata";

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  InternalServerErrorException,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsArray, IsNumber, IsOptional, IsString, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import { AgentRunPublicStore } from "@execution-orchestration/infrastructure/database/agent-run-public-store.ts";
import { FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES } from "@execution-orchestration/infrastructure/database/run-context.entities.ts";
import { FULCRUM_JOB_QUEUE_ENTITIES } from "@platform-core/infrastructure/database/job-queue.entities.ts";
import {
  getOrchestratorStatus,
  getRun,
  listRuns,
  type LegacySymphonyStore,
} from "@platform-core/application/legacy/symphony.ts";
import { isFeatureEnabled } from "@platform-core/infrastructure/product-store/features.ts";
import { FULCRUM_WORKFLOW_SPINE_ENTITIES } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

import { AgentRunRouteParamsDto, AgentRunListQueryDto, AgentRunIssueListQueryDto, AgentRunRefreshResponseDto, AgentRunDispatchBodyDto } from "./dto/agent-run.dto.ts";
export { AgentRunRouteParamsDto, AgentRunListQueryDto, AgentRunIssueListQueryDto, AgentRunRefreshResponseDto, AgentRunDispatchBodyDto };

export const AGENT_RUN_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.agentRunPublicApi.options");

export interface AgentRunPublicApiOptions {
  store?: LegacySymphonyStore;
  orgId?: string;
  featuresEnv?: string;
}

export class AgentRunPublicApiService {
  constructor(
    private readonly options: AgentRunPublicApiOptions | null = null,
    private readonly store: AgentRunPublicStore | null = null,
  ) {}

  async loadStatus(query: Pick<AgentRunListQueryDto, "orgId"> = {}): Promise<unknown> {
    const options = this.requireOptions();
    const orgId = this.requireOrgId(options, query.orgId);
    if (this.store) {
      return await this.store.loadStatus({ orgId });
    }
    return await getOrchestratorStatus(this.requireLegacyStore(options), orgId);
  }

  async loadRun(identifier: string, query: Pick<AgentRunListQueryDto, "orgId"> = {}): Promise<unknown> {
    const options = this.requireOptions();
    const orgId = this.requireOrgId(options, query.orgId);
    const run = this.store
      ? await this.store.loadRun({ orgId, identifier })
      : await getRun(this.requireLegacyStore(options), identifier);
    if (!run) {
      throw new NotFoundException({ error: "not found" });
    }
    return run;
  }

  async refreshRuns(query: Pick<AgentRunListQueryDto, "orgId"> = {}): Promise<AgentRunRefreshResponseDto> {
    const options = this.requireOptions();
    const orgId = this.requireOrgId(options, query.orgId);
    const runs = this.store
      ? await this.store.listRuns({ orgId, limit: 50 })
      : await listRuns(this.requireLegacyStore(options), orgId, { limit: 50 });
    return { runs, count: runs.length };
  }

  async listRuns(query: AgentRunListQueryDto): Promise<unknown[]> {
    const options = this.requireOptions();
    const orgId = this.requireOrgId(options, query.orgId);
    const runs = this.store
      ? await this.store.listRuns({
        orgId,
        limit: query.limit,
        offset: query.offset,
      })
      : await listRuns(this.requireLegacyStore(options), orgId, {
        limit: query.limit,
        offset: query.offset,
      }) as unknown[];
    const status = query.status;
    if (!status) return runs;
    return runs.filter((run: unknown) => runMatchesStatus(run, status));
  }

  async listCandidateIssues(query: Pick<AgentRunListQueryDto, "orgId" | "limit">): Promise<unknown[]> {
    const store = this.requireTypeOrmStore();
    const options = this.requireOptions();
    return await store.listCandidateIssues({
      orgId: this.requireOrgId(options, query.orgId),
      limit: positiveLimit(query.limit),
    });
  }

  async listRunIssuesByStates(query: AgentRunIssueListQueryDto): Promise<unknown[]> {
    const store = this.requireTypeOrmStore();
    const options = this.requireOptions();
    const states = stateList(query.states);
    if (states.length === 0) {
      throw new BadRequestException("states is required.");
    }
    return await store.listRunIssuesByStates({
      orgId: this.requireOrgId(options, query.orgId),
      states,
      limit: positiveLimit(query.limit),
    });
  }

  async dispatchRun(
    query: Pick<AgentRunListQueryDto, "orgId">,
    body: AgentRunDispatchBodyDto,
  ): Promise<unknown> {
    const store = this.requireTypeOrmStore();
    const options = this.requireOptions();
    if (!body.projectId && !body.taskId) {
      throw new BadRequestException("Run dispatch requires projectId or taskId.");
    }
    const run = await store.dispatchRun({
      orgId: this.requireOrgId(options, query.orgId),
      projectId: body.projectId,
      taskId: body.taskId,
      traceId: body.traceId,
      dependencyTree: body.dependencyTree,
      agent: body.agent,
    });
    if (!run) throw new NotFoundException({ error: "not found" });
    return { ...run, agent: body.agent ?? null };
  }

  async cancelRun(
    query: Pick<AgentRunListQueryDto, "orgId">,
    params: AgentRunRouteParamsDto,
  ): Promise<{ ok: true }> {
    const store = this.requireTypeOrmStore();
    const options = this.requireOptions();
    return await store.cancelRun({
      orgId: this.requireOrgId(options, query.orgId),
      identifier: params.identifier,
    });
  }

  async retryRun(
    query: Pick<AgentRunListQueryDto, "orgId">,
    params: AgentRunRouteParamsDto,
  ): Promise<unknown> {
    const store = this.requireTypeOrmStore();
    const options = this.requireOptions();
    const run = await store.retryRun({
      orgId: this.requireOrgId(options, query.orgId),
      identifier: params.identifier,
    });
    if (!run) throw new NotFoundException({ error: "not found" });
    return run;
  }

  private requireOptions(): AgentRunPublicApiOptions {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    if (!this.options && !this.store) {
      throw new InternalServerErrorException("Agent-run public API store is not configured.");
    }
    return this.options ?? {};
  }

  private requireOrgId(options: AgentRunPublicApiOptions, scopedOrgId?: string): string {
    const orgId = scopedOrgId ?? options.orgId;
    if (!orgId) {
      throw new InternalServerErrorException("Agent-run public API org scope is not configured.");
    }
    return orgId;
  }

  private requireLegacyStore(options: AgentRunPublicApiOptions): LegacySymphonyStore {
    const store = options.store;
    if (!store) {
      throw new InternalServerErrorException("Agent-run public API store is not configured.");
    }
    return store;
  }

  private requireTypeOrmStore(): AgentRunPublicStore {
    if (!this.store) {
      throw new InternalServerErrorException("Agent-run public API TypeORM store is not configured.");
    }
    return this.store;
  }
}

function runMatchesStatus(run: unknown, status: string): boolean {
  if (!run || typeof run !== "object") return false;
  const row = run as Record<string, unknown>;
  return row["state"] === status || row["status"] === status || row["symphony_state"] === status;
}

function positiveLimit(value: number | string | undefined): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const limit = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new BadRequestException("limit must be a positive integer.");
  }
  return limit;
}

function stateList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((state) => state.trim()).filter(Boolean);
}

export class AgentRunPublicApiController {
  constructor(private readonly agentRuns: AgentRunPublicApiService) {}

  async loadStatus(query: Pick<AgentRunListQueryDto, "orgId"> = {}): Promise<unknown> {
    return await this.agentRuns.loadStatus(query);
  }

  async listCandidateIssues(query: Pick<AgentRunListQueryDto, "orgId" | "limit"> = {}): Promise<unknown[]> {
    return await this.agentRuns.listCandidateIssues(query);
  }

  async listRunIssuesByStates(query: AgentRunIssueListQueryDto): Promise<unknown[]> {
    return await this.agentRuns.listRunIssuesByStates(query);
  }

  async loadRun(
    params: AgentRunRouteParamsDto,
    query: Pick<AgentRunListQueryDto, "orgId"> = {},
  ): Promise<unknown> {
    return await this.agentRuns.loadRun(params.identifier, query);
  }

  async refreshRuns(query: Pick<AgentRunListQueryDto, "orgId"> = {}): Promise<AgentRunRefreshResponseDto> {
    return await this.agentRuns.refreshRuns(query);
  }
}

export class AgentRunPublicRunsController {
  constructor(private readonly agentRuns: AgentRunPublicApiService) {}

  async listRuns(query: AgentRunListQueryDto): Promise<unknown[]> {
    return await this.agentRuns.listRuns(query);
  }

  async loadRun(
    params: AgentRunRouteParamsDto,
    query: Pick<AgentRunListQueryDto, "orgId"> = {},
  ): Promise<unknown> {
    return await this.agentRuns.loadRun(params.identifier, query);
  }

  async dispatchRun(
    query: Pick<AgentRunListQueryDto, "orgId">,
    body: AgentRunDispatchBodyDto,
  ): Promise<unknown> {
    return await this.agentRuns.dispatchRun(query, body);
  }

  async cancelRun(
    params: AgentRunRouteParamsDto,
    query: Pick<AgentRunListQueryDto, "orgId"> = {},
  ): Promise<{ ok: true }> {
    return await this.agentRuns.cancelRun(query, params);
  }

  async retryRun(
    params: AgentRunRouteParamsDto,
    query: Pick<AgentRunListQueryDto, "orgId"> = {},
  ): Promise<unknown> {
    return await this.agentRuns.retryRun(query, params);
  }
}

export class AgentRunPublicApiModule {
  static register(options: AgentRunPublicApiOptions): DynamicModule {
    return {
      module: AgentRunPublicApiModule,
      imports: [TypeOrmModule.forFeature([
        ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
        ...FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
        ...FULCRUM_JOB_QUEUE_ENTITIES,
      ])],
      controllers: [AgentRunPublicApiController, AgentRunPublicRunsController],
      providers: [
        { provide: AGENT_RUN_PUBLIC_API_OPTIONS, useValue: options },
        AgentRunPublicStore,
        AgentRunPublicApiService,
      ],
      exports: [AgentRunPublicApiService],
    };
  }
}

Inject(AGENT_RUN_PUBLIC_API_OPTIONS)(AgentRunPublicApiService, undefined, 0);
Inject(AgentRunPublicStore)(AgentRunPublicApiService, undefined, 1);
Inject(DataSource)(AgentRunPublicStore, undefined, 0);
Inject(AgentRunPublicApiService)(AgentRunPublicApiController, undefined, 0);
Inject(AgentRunPublicApiService)(AgentRunPublicRunsController, undefined, 0);

IsString()(AgentRunRouteParamsDto.prototype, "identifier");
MinLength(1)(AgentRunRouteParamsDto.prototype, "identifier");
IsOptional()(AgentRunListQueryDto.prototype, "orgId");
IsString()(AgentRunListQueryDto.prototype, "orgId");
MinLength(1)(AgentRunListQueryDto.prototype, "orgId");
IsOptional()(AgentRunListQueryDto.prototype, "status");
IsString()(AgentRunListQueryDto.prototype, "status");
IsOptional()(AgentRunListQueryDto.prototype, "limit");
IsNumber()(AgentRunListQueryDto.prototype, "limit");
IsOptional()(AgentRunListQueryDto.prototype, "offset");
IsNumber()(AgentRunListQueryDto.prototype, "offset");
IsOptional()(AgentRunIssueListQueryDto.prototype, "orgId");
IsString()(AgentRunIssueListQueryDto.prototype, "orgId");
MinLength(1)(AgentRunIssueListQueryDto.prototype, "orgId");
IsOptional()(AgentRunIssueListQueryDto.prototype, "states");
IsString()(AgentRunIssueListQueryDto.prototype, "states");
MinLength(1)(AgentRunIssueListQueryDto.prototype, "states");
IsOptional()(AgentRunIssueListQueryDto.prototype, "limit");
IsNumber()(AgentRunIssueListQueryDto.prototype, "limit");
IsArray()(AgentRunRefreshResponseDto.prototype, "runs");
IsNumber()(AgentRunRefreshResponseDto.prototype, "count");
for (const property of ["projectId", "taskId", "agent", "traceId"] as const) {
  IsOptional()(AgentRunDispatchBodyDto.prototype, property);
  IsString()(AgentRunDispatchBodyDto.prototype, property);
  MinLength(1)(AgentRunDispatchBodyDto.prototype, property);
}
IsOptional()(AgentRunDispatchBodyDto.prototype, "dependencyTree");
IsArray()(AgentRunDispatchBodyDto.prototype, "dependencyTree");

const loadStatusDescriptor = Object.getOwnPropertyDescriptor(
  AgentRunPublicApiController.prototype,
  "loadStatus",
);
const loadRunDescriptor = Object.getOwnPropertyDescriptor(
  AgentRunPublicApiController.prototype,
  "loadRun",
);
const refreshRunsDescriptor = Object.getOwnPropertyDescriptor(
  AgentRunPublicApiController.prototype,
  "refreshRuns",
);
const listCandidateIssuesDescriptor = Object.getOwnPropertyDescriptor(
  AgentRunPublicApiController.prototype,
  "listCandidateIssues",
);
const listRunIssuesByStatesDescriptor = Object.getOwnPropertyDescriptor(
  AgentRunPublicApiController.prototype,
  "listRunIssuesByStates",
);
const listRunsDescriptor = Object.getOwnPropertyDescriptor(
  AgentRunPublicRunsController.prototype,
  "listRuns",
);
const loadPublicRunDescriptor = Object.getOwnPropertyDescriptor(
  AgentRunPublicRunsController.prototype,
  "loadRun",
);
const dispatchPublicRunDescriptor = Object.getOwnPropertyDescriptor(
  AgentRunPublicRunsController.prototype,
  "dispatchRun",
);
const cancelPublicRunDescriptor = Object.getOwnPropertyDescriptor(
  AgentRunPublicRunsController.prototype,
  "cancelRun",
);
const retryPublicRunDescriptor = Object.getOwnPropertyDescriptor(
  AgentRunPublicRunsController.prototype,
  "retryRun",
);

if (
  !loadStatusDescriptor ||
  !loadRunDescriptor ||
  !refreshRunsDescriptor ||
  !listCandidateIssuesDescriptor ||
  !listRunIssuesByStatesDescriptor ||
  !listRunsDescriptor ||
  !loadPublicRunDescriptor ||
  !dispatchPublicRunDescriptor ||
  !cancelPublicRunDescriptor ||
  !retryPublicRunDescriptor
) {
  throw new Error("AgentRunPublicApiController route descriptors are missing");
}

Controller("api/v1/symphony")(AgentRunPublicApiController);
ApiTags("agent-runs")(AgentRunPublicApiController);

Get("state")(
  AgentRunPublicApiController.prototype,
  "loadStatus",
  loadStatusDescriptor,
);
Query()(AgentRunPublicApiController.prototype, "loadStatus", 0);
ApiOperation({ summary: "Load agent-run orchestration status" })(
  AgentRunPublicApiController.prototype,
  "loadStatus",
  loadStatusDescriptor,
);
ApiOkResponse({ description: "Agent-run orchestration status" })(
  AgentRunPublicApiController.prototype,
  "loadStatus",
  loadStatusDescriptor,
);

Get("candidates")(
  AgentRunPublicApiController.prototype,
  "listCandidateIssues",
  listCandidateIssuesDescriptor,
);
Query()(AgentRunPublicApiController.prototype, "listCandidateIssues", 0);
ApiOperation({ summary: "List runnable task candidates" })(
  AgentRunPublicApiController.prototype,
  "listCandidateIssues",
  listCandidateIssuesDescriptor,
);
ApiOkResponse({ description: "Runnable task candidates" })(
  AgentRunPublicApiController.prototype,
  "listCandidateIssues",
  listCandidateIssuesDescriptor,
);

Get("issues")(
  AgentRunPublicApiController.prototype,
  "listRunIssuesByStates",
  listRunIssuesByStatesDescriptor,
);
Query()(AgentRunPublicApiController.prototype, "listRunIssuesByStates", 0);
ApiOperation({ summary: "List agent run issues by state" })(
  AgentRunPublicApiController.prototype,
  "listRunIssuesByStates",
  listRunIssuesByStatesDescriptor,
);
ApiOkResponse({ description: "Agent run issues" })(
  AgentRunPublicApiController.prototype,
  "listRunIssuesByStates",
  listRunIssuesByStatesDescriptor,
);

Get(":identifier")(
  AgentRunPublicApiController.prototype,
  "loadRun",
  loadRunDescriptor,
);
Param()(AgentRunPublicApiController.prototype, "loadRun", 0);
Query()(AgentRunPublicApiController.prototype, "loadRun", 1);
ApiOperation({ summary: "Load an agent run by identifier" })(
  AgentRunPublicApiController.prototype,
  "loadRun",
  loadRunDescriptor,
);
ApiParam({ name: "identifier", required: true })(
  AgentRunPublicApiController.prototype,
  "loadRun",
  loadRunDescriptor,
);
ApiOkResponse({ description: "Agent run" })(
  AgentRunPublicApiController.prototype,
  "loadRun",
  loadRunDescriptor,
);

Post("refresh")(
  AgentRunPublicApiController.prototype,
  "refreshRuns",
  refreshRunsDescriptor,
);
Query()(AgentRunPublicApiController.prototype, "refreshRuns", 0);
ApiOperation({ summary: "Refresh and list agent runs" })(
  AgentRunPublicApiController.prototype,
  "refreshRuns",
  refreshRunsDescriptor,
);
ApiOkResponse({ type: AgentRunRefreshResponseDto })(
  AgentRunPublicApiController.prototype,
  "refreshRuns",
  refreshRunsDescriptor,
);

Controller("api/v1/runs")(AgentRunPublicRunsController);
ApiTags("agent-runs")(AgentRunPublicRunsController);

Get("")(
  AgentRunPublicRunsController.prototype,
  "listRuns",
  listRunsDescriptor,
);
Query()(AgentRunPublicRunsController.prototype, "listRuns", 0);
ApiOperation({ summary: "List agent runs" })(
  AgentRunPublicRunsController.prototype,
  "listRuns",
  listRunsDescriptor,
);
ApiOkResponse({ description: "Agent runs" })(
  AgentRunPublicRunsController.prototype,
  "listRuns",
  listRunsDescriptor,
);

Post("")(
  AgentRunPublicRunsController.prototype,
  "dispatchRun",
  dispatchPublicRunDescriptor,
);
Query()(AgentRunPublicRunsController.prototype, "dispatchRun", 0);
Body()(AgentRunPublicRunsController.prototype, "dispatchRun", 1);
ApiOperation({ summary: "Dispatch an agent run" })(
  AgentRunPublicRunsController.prototype,
  "dispatchRun",
  dispatchPublicRunDescriptor,
);
ApiOkResponse({ description: "Dispatched agent run" })(
  AgentRunPublicRunsController.prototype,
  "dispatchRun",
  dispatchPublicRunDescriptor,
);

Get(":identifier")(
  AgentRunPublicRunsController.prototype,
  "loadRun",
  loadPublicRunDescriptor,
);
Param()(AgentRunPublicRunsController.prototype, "loadRun", 0);
Query()(AgentRunPublicRunsController.prototype, "loadRun", 1);
ApiOperation({ summary: "Load an agent run" })(
  AgentRunPublicRunsController.prototype,
  "loadRun",
  loadPublicRunDescriptor,
);
ApiParam({ name: "identifier", required: true })(
  AgentRunPublicRunsController.prototype,
  "loadRun",
  loadPublicRunDescriptor,
);
ApiOkResponse({ description: "Agent run" })(
  AgentRunPublicRunsController.prototype,
  "loadRun",
  loadPublicRunDescriptor,
);

Post(":identifier/cancel")(
  AgentRunPublicRunsController.prototype,
  "cancelRun",
  cancelPublicRunDescriptor,
);
Param()(AgentRunPublicRunsController.prototype, "cancelRun", 0);
Query()(AgentRunPublicRunsController.prototype, "cancelRun", 1);
ApiOperation({ summary: "Cancel an agent run" })(
  AgentRunPublicRunsController.prototype,
  "cancelRun",
  cancelPublicRunDescriptor,
);
ApiParam({ name: "identifier", required: true })(
  AgentRunPublicRunsController.prototype,
  "cancelRun",
  cancelPublicRunDescriptor,
);
ApiOkResponse({ description: "Cancel result" })(
  AgentRunPublicRunsController.prototype,
  "cancelRun",
  cancelPublicRunDescriptor,
);

Post(":identifier/retry")(
  AgentRunPublicRunsController.prototype,
  "retryRun",
  retryPublicRunDescriptor,
);
Param()(AgentRunPublicRunsController.prototype, "retryRun", 0);
Query()(AgentRunPublicRunsController.prototype, "retryRun", 1);
ApiOperation({ summary: "Retry an agent run" })(
  AgentRunPublicRunsController.prototype,
  "retryRun",
  retryPublicRunDescriptor,
);
ApiParam({ name: "identifier", required: true })(
  AgentRunPublicRunsController.prototype,
  "retryRun",
  retryPublicRunDescriptor,
);
ApiOkResponse({ description: "Retried agent run" })(
  AgentRunPublicRunsController.prototype,
  "retryRun",
  retryPublicRunDescriptor,
);

Module({
  imports: [TypeOrmModule.forFeature([
    ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
    ...FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
    ...FULCRUM_JOB_QUEUE_ENTITIES,
  ])],
  controllers: [AgentRunPublicApiController, AgentRunPublicRunsController],
  providers: [
    { provide: AGENT_RUN_PUBLIC_API_OPTIONS, useValue: null },
    AgentRunPublicStore,
    AgentRunPublicApiService,
  ],
  exports: [AgentRunPublicApiService],
})(AgentRunPublicApiModule);
