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
  Post,
  Query,
} from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import {
  FULCRUM_ROUTING_ENTITIES,
  type FulcrumRoutingDraftStatus,
  type FulcrumRoutingRuleSource,
} from "@execution-orchestration/infrastructure/database/routing.entities.ts";
import {
  RoutingPublicStore,
  type RoutingDecisionPublicRow,
  type RoutingDraftPublicRow,
  type RoutingRulePublicRow,
} from "@execution-orchestration/infrastructure/database/routing-store.ts";
import { isFeatureEnabled } from "@platform-core/infrastructure/product-store/features.ts";
import { FULCRUM_WORKFLOW_SPINE_ENTITIES } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

import { RoutingScopeQueryDto, RoutingIdParamsDto, RoutingRuleCreateDto, RoutingRuleUpdateDto, RoutingDecisionDryRunDto, RoutingDecisionTestDto, RoutingLlmGateDto, RoutingDraftUpdateDto } from "./dto/routing.dto.ts";
export { RoutingScopeQueryDto, RoutingIdParamsDto, RoutingRuleCreateDto, RoutingRuleUpdateDto, RoutingDecisionDryRunDto, RoutingDecisionTestDto, RoutingLlmGateDto, RoutingDraftUpdateDto };

export const ROUTING_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.routingPublicApi.options");

export interface RoutingPublicApiOptions {
  featuresEnv?: string;
}

export class RoutingPublicApiService {
  constructor(
    private readonly options: RoutingPublicApiOptions | null = null,
    private readonly store: RoutingPublicStore | null = null,
  ) {}

  async listRules(input: RoutingScopeQueryDto): Promise<RoutingRulePublicRow[]> {
    return await this.requireStore().listRules({
      orgId: input.orgId,
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    });
  }

  async getRule(params: RoutingIdParamsDto, input: RoutingScopeQueryDto): Promise<RoutingRulePublicRow> {
    return await this.requireResult(this.requireStore().getRule({ orgId: input.orgId, id: params.id }));
  }

  async createRule(input: RoutingRuleCreateDto): Promise<RoutingRulePublicRow> {
    return await this.requireStore().createRule(input);
  }

  async updateRule(params: RoutingIdParamsDto, input: RoutingRuleUpdateDto): Promise<RoutingRulePublicRow> {
    return await this.requireResult(this.requireStore().updateRule({ ...input, id: params.id }));
  }

  async deleteRule(params: RoutingIdParamsDto, input: RoutingScopeQueryDto): Promise<{ ok: true }> {
    return await this.requireStore().deleteRule({ orgId: input.orgId, id: params.id });
  }

  async dryRun(input: RoutingDecisionDryRunDto): Promise<RoutingDecisionPublicRow> {
    return await this.requireStore().dryRun(input);
  }

  async testTask(input: RoutingDecisionTestDto): Promise<RoutingDecisionPublicRow> {
    return await this.requireResult(this.requireStore().testTask(input));
  }

  async updateLlmGate(input: RoutingLlmGateDto): Promise<{ ok: true; enabled?: boolean; inputMode?: string }> {
    return await this.requireStore().updateLlmGate(input);
  }

  async listDrafts(input: RoutingScopeQueryDto): Promise<RoutingDraftPublicRow[]> {
    return await this.requireStore().listDrafts({
      orgId: input.orgId,
      ...(input.status !== undefined ? { status: input.status as FulcrumRoutingDraftStatus } : {}),
    });
  }

  async updateDraft(params: RoutingIdParamsDto, input: RoutingDraftUpdateDto): Promise<{ ok: true }> {
    await this.requireBoolean(this.requireStore().updateDraft({ ...input, id: params.id }));
    return { ok: true };
  }

  async approveDraft(params: RoutingIdParamsDto, input: RoutingScopeQueryDto): Promise<{ ok: true }> {
    await this.requireBoolean(this.requireStore().approveDraft({ orgId: input.orgId, id: params.id }));
    return { ok: true };
  }

  async deleteDraft(params: RoutingIdParamsDto, input: RoutingScopeQueryDto): Promise<{ ok: true }> {
    await this.requireBoolean(this.requireStore().deleteDraft({ orgId: input.orgId, id: params.id }));
    return { ok: true };
  }

  private async requireResult<T>(promise: Promise<T | null>): Promise<T> {
    const result = await promise;
    if (!result) throw new NotFoundException({ error: "Routing target not found." });
    return result;
  }

  private async requireBoolean(promise: Promise<boolean>): Promise<void> {
    if (!(await promise)) throw new NotFoundException({ error: "Routing target not found." });
  }

  private requireStore(): RoutingPublicStore {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    if (!this.store) {
      throw new InternalServerErrorException("Routing public API TypeORM store is not configured.");
    }
    return this.store;
  }
}

export class RoutingPublicApiController {
  constructor(private readonly routing: RoutingPublicApiService) {}

  async listRules(query: RoutingScopeQueryDto): Promise<RoutingRulePublicRow[]> {
    return await this.routing.listRules(query);
  }

  async getRule(params: RoutingIdParamsDto, query: RoutingScopeQueryDto): Promise<RoutingRulePublicRow> {
    return await this.routing.getRule(params, query);
  }

  async createRule(body: RoutingRuleCreateDto): Promise<RoutingRulePublicRow> {
    return await this.routing.createRule(body);
  }

  async updateRule(params: RoutingIdParamsDto, body: RoutingRuleUpdateDto): Promise<RoutingRulePublicRow> {
    return await this.routing.updateRule(params, body);
  }

  async deleteRule(params: RoutingIdParamsDto, body: RoutingScopeQueryDto): Promise<{ ok: true }> {
    return await this.routing.deleteRule(params, body);
  }

  async dryRun(body: RoutingDecisionDryRunDto): Promise<RoutingDecisionPublicRow> {
    return await this.routing.dryRun(body);
  }

  async testTask(body: RoutingDecisionTestDto): Promise<RoutingDecisionPublicRow> {
    return await this.routing.testTask(body);
  }

  async updateLlmGate(body: RoutingLlmGateDto): Promise<{ ok: true; enabled?: boolean; inputMode?: string }> {
    return await this.routing.updateLlmGate(body);
  }

  async listDrafts(query: RoutingScopeQueryDto): Promise<RoutingDraftPublicRow[]> {
    return await this.routing.listDrafts(query);
  }

  async updateDraft(params: RoutingIdParamsDto, body: RoutingDraftUpdateDto): Promise<{ ok: true }> {
    return await this.routing.updateDraft(params, body);
  }

  async approveDraft(params: RoutingIdParamsDto, body: RoutingScopeQueryDto): Promise<{ ok: true }> {
    return await this.routing.approveDraft(params, body);
  }

  async deleteDraft(params: RoutingIdParamsDto, body: RoutingScopeQueryDto): Promise<{ ok: true }> {
    return await this.routing.deleteDraft(params, body);
  }
}

export class RoutingPublicApiModule {
  static register(options: RoutingPublicApiOptions): NestDynamicModule {
    return {
      module: RoutingPublicApiModule,
      imports: [TypeOrmModule.forFeature([...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...FULCRUM_ROUTING_ENTITIES])],
      controllers: [RoutingPublicApiController],
      providers: [
        { provide: ROUTING_PUBLIC_API_OPTIONS, useValue: options },
        RoutingPublicStore,
        RoutingPublicApiService,
      ],
      exports: [RoutingPublicApiService],
    };
  }
}

Inject(ROUTING_PUBLIC_API_OPTIONS)(RoutingPublicApiService, undefined, 0);
Inject(RoutingPublicStore)(RoutingPublicApiService, undefined, 1);
Inject(DataSource)(RoutingPublicStore, undefined, 0);
Inject(RoutingPublicApiService)(RoutingPublicApiController, undefined, 0);

for (const target of [
  RoutingScopeQueryDto,
  RoutingRuleCreateDto,
  RoutingRuleUpdateDto,
  RoutingDecisionDryRunDto,
  RoutingDecisionTestDto,
  RoutingLlmGateDto,
  RoutingDraftUpdateDto,
]) {
  IsString()(target.prototype, "orgId");
  MinLength(1)(target.prototype, "orgId");
  IsString()(target.prototype, "userId");
  MinLength(1)(target.prototype, "userId");
}

IsString()(RoutingIdParamsDto.prototype, "id");
MinLength(1)(RoutingIdParamsDto.prototype, "id");
IsOptional()(RoutingScopeQueryDto.prototype, "projectId");
IsString()(RoutingScopeQueryDto.prototype, "projectId");
IsOptional()(RoutingScopeQueryDto.prototype, "status");
IsString()(RoutingScopeQueryDto.prototype, "status");

for (const target of [RoutingRuleCreateDto, RoutingRuleUpdateDto] as const) {
  IsOptional()(target.prototype, "projectId");
  IsString()(target.prototype, "projectId");
  IsOptional()(target.prototype, "conditionsJson");
  IsObject()(target.prototype, "conditionsJson");
  IsOptional()(target.prototype, "actionSkillSet");
  IsOptional()(target.prototype, "priority");
  IsOptional()(target.prototype, "enabled");
  IsBoolean()(target.prototype, "enabled");
  IsOptional()(target.prototype, "source");
  IsIn(["manual", "learned", "imported"])(target.prototype, "source");
}

IsString()(RoutingRuleCreateDto.prototype, "name");
MinLength(1)(RoutingRuleCreateDto.prototype, "name");
IsObject()(RoutingRuleCreateDto.prototype, "conditionsJson");
IsString()(RoutingRuleCreateDto.prototype, "actionAgent");
MinLength(1)(RoutingRuleCreateDto.prototype, "actionAgent");
IsOptional()(RoutingRuleUpdateDto.prototype, "name");
IsString()(RoutingRuleUpdateDto.prototype, "name");
IsOptional()(RoutingRuleUpdateDto.prototype, "actionAgent");
IsString()(RoutingRuleUpdateDto.prototype, "actionAgent");
IsObject()(RoutingDecisionDryRunDto.prototype, "taskJson");
IsString()(RoutingDecisionTestDto.prototype, "taskId");
MinLength(1)(RoutingDecisionTestDto.prototype, "taskId");
IsOptional()(RoutingLlmGateDto.prototype, "enabled");
IsBoolean()(RoutingLlmGateDto.prototype, "enabled");
IsOptional()(RoutingLlmGateDto.prototype, "inputMode");
IsIn(["task_facts", "task_plus_history", "full_context"])(RoutingLlmGateDto.prototype, "inputMode");
IsOptional()(RoutingDraftUpdateDto.prototype, "conditionsJson");
IsObject()(RoutingDraftUpdateDto.prototype, "conditionsJson");
IsOptional()(RoutingDraftUpdateDto.prototype, "actionAgent");
IsString()(RoutingDraftUpdateDto.prototype, "actionAgent");
IsOptional()(RoutingDraftUpdateDto.prototype, "actionSkillSet");

const routeDescriptors = {
  listRules: Object.getOwnPropertyDescriptor(RoutingPublicApiController.prototype, "listRules"),
  getRule: Object.getOwnPropertyDescriptor(RoutingPublicApiController.prototype, "getRule"),
  createRule: Object.getOwnPropertyDescriptor(RoutingPublicApiController.prototype, "createRule"),
  updateRule: Object.getOwnPropertyDescriptor(RoutingPublicApiController.prototype, "updateRule"),
  deleteRule: Object.getOwnPropertyDescriptor(RoutingPublicApiController.prototype, "deleteRule"),
  dryRun: Object.getOwnPropertyDescriptor(RoutingPublicApiController.prototype, "dryRun"),
  testTask: Object.getOwnPropertyDescriptor(RoutingPublicApiController.prototype, "testTask"),
  updateLlmGate: Object.getOwnPropertyDescriptor(RoutingPublicApiController.prototype, "updateLlmGate"),
  listDrafts: Object.getOwnPropertyDescriptor(RoutingPublicApiController.prototype, "listDrafts"),
  updateDraft: Object.getOwnPropertyDescriptor(RoutingPublicApiController.prototype, "updateDraft"),
  approveDraft: Object.getOwnPropertyDescriptor(RoutingPublicApiController.prototype, "approveDraft"),
  deleteDraft: Object.getOwnPropertyDescriptor(RoutingPublicApiController.prototype, "deleteDraft"),
} as const;

if (Object.values(routeDescriptors).some((descriptor) => !descriptor)) {
  throw new Error("RoutingPublicApiController route descriptors are missing");
}

Controller("api/v1/routing")(RoutingPublicApiController);
ApiTags("routing")(RoutingPublicApiController);

applyGetRoute("listRules", "rules", RoutingScopeQueryDto, "List routing rules");
applyGetRoute("getRule", "rules/:id", RoutingScopeQueryDto, "Get routing rule", true);
applyPostRoute("createRule", "rules/create", RoutingRuleCreateDto, "Create routing rule");
applyPostRoute("updateRule", "rules/:id/update", RoutingRuleUpdateDto, "Update routing rule", true);
applyPostRoute("deleteRule", "rules/:id/delete", RoutingScopeQueryDto, "Delete routing rule", true);
applyPostRoute("dryRun", "dry-run", RoutingDecisionDryRunDto, "Dry-run routing decision");
applyPostRoute("testTask", "test", RoutingDecisionTestDto, "Test routing decision");
applyPostRoute("updateLlmGate", "config/llm-gate", RoutingLlmGateDto, "Update routing LLM gate");
applyGetRoute("listDrafts", "drafts", RoutingScopeQueryDto, "List routing drafts");
applyPostRoute("updateDraft", "drafts/:id/update", RoutingDraftUpdateDto, "Update routing draft", true);
applyPostRoute("approveDraft", "drafts/:id/approve", RoutingScopeQueryDto, "Approve routing draft", true);
applyPostRoute("deleteDraft", "drafts/:id/delete", RoutingScopeQueryDto, "Delete routing draft", true);

Module({
  imports: [TypeOrmModule.forFeature([...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...FULCRUM_ROUTING_ENTITIES])],
  controllers: [RoutingPublicApiController],
  providers: [
    { provide: ROUTING_PUBLIC_API_OPTIONS, useValue: null },
    RoutingPublicStore,
    RoutingPublicApiService,
  ],
  exports: [RoutingPublicApiService],
})(RoutingPublicApiModule);

function applyGetRoute(
  method: keyof typeof routeDescriptors,
  path: string,
  queryType: new () => unknown,
  summary: string,
  hasId = false,
): void {
  const descriptor = routeDescriptors[method]!;
  Get(path)(RoutingPublicApiController.prototype, method, descriptor);
  if (hasId) {
    Param()(RoutingPublicApiController.prototype, method, 0);
    Query()(RoutingPublicApiController.prototype, method, 1);
    ApiParam({ name: "id" })(RoutingPublicApiController.prototype, method, descriptor);
  } else {
    Query()(RoutingPublicApiController.prototype, method, 0);
  }
  ApiQuery({ type: queryType })(RoutingPublicApiController.prototype, method, descriptor);
  ApiOperation({ summary })(RoutingPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(RoutingPublicApiController.prototype, method, descriptor);
}

function applyPostRoute(
  method: keyof typeof routeDescriptors,
  path: string,
  bodyType: new () => unknown,
  summary: string,
  hasId = false,
): void {
  const descriptor = routeDescriptors[method]!;
  Post(path)(RoutingPublicApiController.prototype, method, descriptor);
  if (hasId) {
    Param()(RoutingPublicApiController.prototype, method, 0);
    Body()(RoutingPublicApiController.prototype, method, 1);
    ApiParam({ name: "id" })(RoutingPublicApiController.prototype, method, descriptor);
  } else {
    Body()(RoutingPublicApiController.prototype, method, 0);
  }
  ApiOperation({ summary })(RoutingPublicApiController.prototype, method, descriptor);
  ApiBody({ type: bodyType })(RoutingPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(RoutingPublicApiController.prototype, method, descriptor);
}
