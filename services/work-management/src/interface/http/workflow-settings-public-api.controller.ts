import "reflect-metadata";

import { Body, Controller, Inject, InternalServerErrorException, Module, NotFoundException, Post } from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import { isFeatureEnabled } from "@feature-flags/application/env-features.ts";
import {
  loadOrchestrationConfig,
  loadOrchestrationDashboard,
  loadWorkflowDef,
  listOrchestrationProjectOptions,
  listWorkflowDefs,
} from "@execution-orchestration/interface/orchestration-settings.ts";
import {
  upsertOrchestrationConfig,
  upsertWorkflowDef,
} from "@execution-orchestration/interface/orchestration-settings.ts";
import { FULCRUM_WORKFLOW_SPINE_ENTITIES } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import {
  WorkflowSettingsStore,
} from "@work-management/infrastructure/database/workflow-settings-store.ts";
import type { WorkflowMethodology, WorkflowTransitionGraph } from "@work-management/domain/workflow-settings.ts";

import { WorkflowDefaultRequestDto, WorkflowProjectScopeDto, WorkflowTaskTypesUpdateDto, WorkflowMethodologyUpdateDto, WorkflowTransitionsUpdateDto, WorkflowTransitionValidationDto } from "./dto/workflow-settings.dto.ts";
export { WorkflowDefaultRequestDto, WorkflowProjectScopeDto, WorkflowTaskTypesUpdateDto, WorkflowMethodologyUpdateDto, WorkflowTransitionsUpdateDto, WorkflowTransitionValidationDto };

export const WORKFLOW_SETTINGS_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.workflowSettingsPublicApi.options");

export interface WorkflowSettingsApplication {
  getDefaultWorkflow(input: { methodology: WorkflowMethodology }): Promise<unknown> | unknown;
  getMethodology(input: WorkflowProjectScopeDto): Promise<unknown>;
  updateMethodology(input: WorkflowMethodologyUpdateDto): Promise<unknown>;
  getEnabledTaskTypes(input: WorkflowProjectScopeDto): Promise<unknown>;
  updateEnabledTaskTypes(input: WorkflowTaskTypesUpdateDto): Promise<unknown>;
  getTransitions(input: WorkflowProjectScopeDto): Promise<unknown>;
  updateTransitions(input: WorkflowTransitionsUpdateDto): Promise<unknown>;
  validateTransition(input: WorkflowTransitionValidationDto): Promise<unknown>;
}

export interface WorkflowSettingsPublicApiOptions {
  application?: WorkflowSettingsApplication;
  featuresEnv?: string;
}

export class WorkflowSettingsPublicApiService {
  constructor(
    private readonly options: WorkflowSettingsPublicApiOptions | null = null,
    private readonly store: WorkflowSettingsStore | null = null,
    private readonly dataSource: DataSource | null = null,
  ) {}

  async getDefaultWorkflow(input: WorkflowDefaultRequestDto): Promise<unknown> {
    return await this.requireApplication().getDefaultWorkflow(input);
  }

  async getMethodology(input: WorkflowProjectScopeDto): Promise<unknown> {
    return await this.requireResult("getMethodology", input);
  }

  async updateMethodology(input: WorkflowMethodologyUpdateDto): Promise<unknown> {
    return await this.requireResult("updateMethodology", input);
  }

  async getEnabledTaskTypes(input: WorkflowProjectScopeDto): Promise<unknown> {
    return await this.requireResult("getEnabledTaskTypes", input);
  }

  async updateEnabledTaskTypes(input: WorkflowTaskTypesUpdateDto): Promise<unknown> {
    return await this.requireResult("updateEnabledTaskTypes", input);
  }

  async getTransitions(input: WorkflowProjectScopeDto): Promise<unknown> {
    return await this.requireResult("getTransitions", input);
  }

  async updateTransitions(input: WorkflowTransitionsUpdateDto): Promise<unknown> {
    return await this.requireResult("updateTransitions", input);
  }

  async validateTransition(input: WorkflowTransitionValidationDto): Promise<unknown> {
    return await this.requireResult("validateTransition", input);
  }

  async loadOrchestrationConfig(input: OrchestrationScopeDto): Promise<unknown> {
    this.requireApplication();
    return await loadOrchestrationConfig(this.requireDataSource().manager, orchestrationContext(input));
  }

  async saveOrchestrationConfig(input: OrchestrationConfigPublicDto): Promise<unknown> {
    this.requireApplication();
    return await upsertOrchestrationConfig(this.requireDataSource().manager, orchestrationContext(input), {
      pollIntervalS: input.pollIntervalS,
      maxConcurrency: input.maxConcurrency,
      stallTimeoutS: input.stallTimeoutS,
      workspaceRoot: input.workspaceRoot ?? null,
    });
  }

  async listWorkflowDefs(input: OrchestrationScopeDto): Promise<unknown> {
    this.requireApplication();
    return await listWorkflowDefs(this.requireDataSource().manager, orchestrationContext(input));
  }

  async loadWorkflowDef(input: WorkflowDefReadDto): Promise<unknown> {
    this.requireApplication();
    const workflow = await loadWorkflowDef(this.requireDataSource().manager, orchestrationContext(input), input.id);
    if (!workflow) throw new NotFoundException({ error: "Workflow definition not found." });
    return workflow;
  }

  async saveWorkflowDef(input: WorkflowDefUpsertDto): Promise<unknown> {
    this.requireApplication();
    return await upsertWorkflowDef(this.requireDataSource().manager, orchestrationContext(input), {
      id: input.id,
      projectId: resolveProjectId(input),
      name: input.name,
      description: input.description ?? null,
      yamlConfig: input.yamlConfig,
      promptTemplate: input.promptTemplate,
    });
  }

  async loadOrchestrationDashboard(input: OrchestrationScopeDto): Promise<unknown> {
    this.requireApplication();
    return await loadOrchestrationDashboard(
      this.requireDataSource().manager,
      orchestrationContext(input),
      resolveProjectId(input) ?? undefined,
    );
  }

  async listOrchestrationProjectOptions(input: OrchestrationScopeDto): Promise<unknown> {
    this.requireApplication();
    return await listOrchestrationProjectOptions(this.requireDataSource().manager, orchestrationContext(input));
  }

  private async requireResult<Name extends keyof WorkflowSettingsApplication>(
    name: Name,
    input: Parameters<WorkflowSettingsApplication[Name]>[0],
  ): Promise<unknown> {
    const result = await this.requireApplication()[name](input as never);
    if (!result) throw new NotFoundException({ error: "Project workflow settings not found." });
    return result;
  }

  private requireApplication(): WorkflowSettingsApplication {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    const application = this.options?.application;
    if (application) return application;
    if (this.store) {
      return {
        getDefaultWorkflow: (input) => this.store!.getDefaultWorkflow(input),
        getMethodology: (input) => this.store!.getMethodology(input),
        updateMethodology: (input) => this.store!.updateMethodology(input),
        getEnabledTaskTypes: (input) => this.store!.getEnabledTaskTypes(input),
        updateEnabledTaskTypes: (input) => this.store!.updateEnabledTaskTypes(input),
        getTransitions: (input) => this.store!.getTransitions(input),
        updateTransitions: (input) => this.store!.updateTransitions(input),
        validateTransition: (input) => this.store!.validateTransition(input),
      };
    }
    throw new InternalServerErrorException("Workflow settings public API application facade is not configured.");
  }

  private requireDataSource(): DataSource {
    if (!this.dataSource) {
      throw new InternalServerErrorException("Workflow settings public API data source is not configured.");
    }
    return this.dataSource;
  }
}

export class OrchestrationScopeDto {
  orgId!: string;
  userId?: string | null;
  projectId?: string | null;
  project_id?: string | null;
}

export class OrchestrationConfigPublicDto extends OrchestrationScopeDto {
  pollIntervalS!: number;
  maxConcurrency!: number;
  stallTimeoutS!: number;
  workspaceRoot?: string | null;
}

export class WorkflowDefReadDto extends OrchestrationScopeDto {
  id!: string;
}

export class WorkflowDefUpsertDto extends OrchestrationScopeDto {
  id?: string;
  name!: string;
  description?: string | null;
  yamlConfig!: string;
  promptTemplate!: string;
}

export class WorkflowSettingsPublicApiController {
  constructor(private readonly settings: WorkflowSettingsPublicApiService) {}

  async getDefaultWorkflow(body: WorkflowDefaultRequestDto): Promise<unknown> {
    return await this.settings.getDefaultWorkflow(body);
  }

  async getEnabledTaskTypes(body: WorkflowProjectScopeDto): Promise<unknown> {
    return await this.settings.getEnabledTaskTypes(body);
  }

  async updateEnabledTaskTypes(body: WorkflowTaskTypesUpdateDto): Promise<unknown> {
    return await this.settings.updateEnabledTaskTypes(body);
  }

  async getMethodology(body: WorkflowProjectScopeDto): Promise<unknown> {
    return await this.settings.getMethodology(body);
  }

  async updateMethodology(body: WorkflowMethodologyUpdateDto): Promise<unknown> {
    return await this.settings.updateMethodology(body);
  }

  async getTransitions(body: WorkflowProjectScopeDto): Promise<unknown> {
    return await this.settings.getTransitions(body);
  }

  async updateTransitions(body: WorkflowTransitionsUpdateDto): Promise<unknown> {
    return await this.settings.updateTransitions(body);
  }

  async validateTransition(body: WorkflowTransitionValidationDto): Promise<unknown> {
    return await this.settings.validateTransition(body);
  }

  async loadOrchestrationConfig(body: OrchestrationScopeDto): Promise<unknown> {
    return await this.settings.loadOrchestrationConfig(body);
  }

  async saveOrchestrationConfig(body: OrchestrationConfigPublicDto): Promise<unknown> {
    return await this.settings.saveOrchestrationConfig(body);
  }

  async listWorkflowDefs(body: OrchestrationScopeDto): Promise<unknown> {
    return await this.settings.listWorkflowDefs(body);
  }

  async loadWorkflowDef(body: WorkflowDefReadDto): Promise<unknown> {
    return await this.settings.loadWorkflowDef(body);
  }

  async saveWorkflowDef(body: WorkflowDefUpsertDto): Promise<unknown> {
    return await this.settings.saveWorkflowDef(body);
  }

  async loadOrchestrationDashboard(body: OrchestrationScopeDto): Promise<unknown> {
    return await this.settings.loadOrchestrationDashboard(body);
  }

  async listOrchestrationProjectOptions(body: OrchestrationScopeDto): Promise<unknown> {
    return await this.settings.listOrchestrationProjectOptions(body);
  }
}

export class WorkflowSettingsPublicApiModule {
  static register(options: WorkflowSettingsPublicApiOptions): NestDynamicModule {
    return {
      module: WorkflowSettingsPublicApiModule,
      imports: [TypeOrmModule.forFeature(FULCRUM_WORKFLOW_SPINE_ENTITIES)],
      controllers: [WorkflowSettingsPublicApiController],
      providers: [
        { provide: WORKFLOW_SETTINGS_PUBLIC_API_OPTIONS, useValue: options },
        WorkflowSettingsStore,
        WorkflowSettingsPublicApiService,
      ],
      exports: [WorkflowSettingsPublicApiService],
    };
  }
}

Inject(WORKFLOW_SETTINGS_PUBLIC_API_OPTIONS)(WorkflowSettingsPublicApiService, undefined, 0);
Inject(WorkflowSettingsStore)(WorkflowSettingsPublicApiService, undefined, 1);
Inject(DataSource)(WorkflowSettingsPublicApiService, undefined, 2);
Inject(DataSource)(WorkflowSettingsStore, undefined, 0);
Inject(WorkflowSettingsPublicApiService)(WorkflowSettingsPublicApiController, undefined, 0);

IsIn(["scrum", "kanban", "none"])(WorkflowDefaultRequestDto.prototype, "methodology");
IsIn(["scrum", "kanban", "none"])(WorkflowMethodologyUpdateDto.prototype, "methodology");
IsOptional()(WorkflowMethodologyUpdateDto.prototype, "resetWorkflow");
IsBoolean()(WorkflowMethodologyUpdateDto.prototype, "resetWorkflow");

for (const target of [WorkflowProjectScopeDto, WorkflowTaskTypesUpdateDto, WorkflowMethodologyUpdateDto, WorkflowTransitionsUpdateDto, WorkflowTransitionValidationDto]) {
  for (const property of ["orgId", "projectId"] as const) {
    IsString()(target.prototype, property);
    MinLength(1)(target.prototype, property);
  }
}

IsArray()(WorkflowTaskTypesUpdateDto.prototype, "types");
IsObject()(WorkflowTransitionsUpdateDto.prototype, "transitions");
for (const property of ["fromStatus", "toStatus"] as const) {
  IsString()(WorkflowTransitionValidationDto.prototype, property);
  MinLength(1)(WorkflowTransitionValidationDto.prototype, property);
}

for (const target of [OrchestrationScopeDto, OrchestrationConfigPublicDto, WorkflowDefReadDto, WorkflowDefUpsertDto] as const) {
  IsString()(target.prototype, "orgId");
  MinLength(1)(target.prototype, "orgId");
  IsOptional()(target.prototype, "userId");
  IsString()(target.prototype, "userId");
  for (const property of ["projectId", "project_id"] as const) {
    IsOptional()(target.prototype, property);
    IsString()(target.prototype, property);
  }
}
IsString()(WorkflowDefReadDto.prototype, "id");
MinLength(1)(WorkflowDefReadDto.prototype, "id");
IsOptional()(WorkflowDefUpsertDto.prototype, "id");
IsString()(WorkflowDefUpsertDto.prototype, "id");
for (const property of ["name", "yamlConfig", "promptTemplate"] as const) {
  IsString()(WorkflowDefUpsertDto.prototype, property);
  MinLength(1)(WorkflowDefUpsertDto.prototype, property);
}
IsOptional()(WorkflowDefUpsertDto.prototype, "description");
IsString()(WorkflowDefUpsertDto.prototype, "description");

const routeDescriptors = {
  getDefaultWorkflow: Object.getOwnPropertyDescriptor(WorkflowSettingsPublicApiController.prototype, "getDefaultWorkflow"),
  getEnabledTaskTypes: Object.getOwnPropertyDescriptor(WorkflowSettingsPublicApiController.prototype, "getEnabledTaskTypes"),
  updateEnabledTaskTypes: Object.getOwnPropertyDescriptor(WorkflowSettingsPublicApiController.prototype, "updateEnabledTaskTypes"),
  getMethodology: Object.getOwnPropertyDescriptor(WorkflowSettingsPublicApiController.prototype, "getMethodology"),
  updateMethodology: Object.getOwnPropertyDescriptor(WorkflowSettingsPublicApiController.prototype, "updateMethodology"),
  getTransitions: Object.getOwnPropertyDescriptor(WorkflowSettingsPublicApiController.prototype, "getTransitions"),
  updateTransitions: Object.getOwnPropertyDescriptor(WorkflowSettingsPublicApiController.prototype, "updateTransitions"),
  validateTransition: Object.getOwnPropertyDescriptor(WorkflowSettingsPublicApiController.prototype, "validateTransition"),
  loadOrchestrationConfig: Object.getOwnPropertyDescriptor(WorkflowSettingsPublicApiController.prototype, "loadOrchestrationConfig"),
  saveOrchestrationConfig: Object.getOwnPropertyDescriptor(WorkflowSettingsPublicApiController.prototype, "saveOrchestrationConfig"),
  listWorkflowDefs: Object.getOwnPropertyDescriptor(WorkflowSettingsPublicApiController.prototype, "listWorkflowDefs"),
  loadWorkflowDef: Object.getOwnPropertyDescriptor(WorkflowSettingsPublicApiController.prototype, "loadWorkflowDef"),
  saveWorkflowDef: Object.getOwnPropertyDescriptor(WorkflowSettingsPublicApiController.prototype, "saveWorkflowDef"),
  loadOrchestrationDashboard: Object.getOwnPropertyDescriptor(WorkflowSettingsPublicApiController.prototype, "loadOrchestrationDashboard"),
  listOrchestrationProjectOptions: Object.getOwnPropertyDescriptor(WorkflowSettingsPublicApiController.prototype, "listOrchestrationProjectOptions"),
} as const;

if (Object.values(routeDescriptors).some((descriptor) => !descriptor)) {
  throw new Error("WorkflowSettingsPublicApiController route descriptors are missing");
}

Controller("api/v1/workflows")(WorkflowSettingsPublicApiController);
ApiTags("workflow-settings")(WorkflowSettingsPublicApiController);

applyPostRoute("loadOrchestrationConfig", "orchestration/config/get", OrchestrationScopeDto, "Load orchestration config");
applyPostRoute("saveOrchestrationConfig", "orchestration/config/update", OrchestrationConfigPublicDto, "Save orchestration config");
applyPostRoute("listWorkflowDefs", "orchestration/definitions/list", OrchestrationScopeDto, "List orchestration workflow definitions");
applyPostRoute("loadWorkflowDef", "orchestration/definitions/get", WorkflowDefReadDto, "Load orchestration workflow definition");
applyPostRoute("saveWorkflowDef", "orchestration/definitions/upsert", WorkflowDefUpsertDto, "Save orchestration workflow definition");
applyPostRoute("loadOrchestrationDashboard", "orchestration/dashboard", OrchestrationScopeDto, "Load orchestration dashboard");
applyPostRoute("listOrchestrationProjectOptions", "orchestration/projects", OrchestrationScopeDto, "List orchestration project options");
applyPostRoute("getDefaultWorkflow", "default", WorkflowDefaultRequestDto, "Get default workflow transitions");
applyPostRoute("getEnabledTaskTypes", "task-types/get", WorkflowProjectScopeDto, "Get enabled task types");
applyPostRoute("updateEnabledTaskTypes", "task-types/update", WorkflowTaskTypesUpdateDto, "Update enabled task types");
applyPostRoute("getMethodology", "methodology/get", WorkflowProjectScopeDto, "Get project methodology");
applyPostRoute("updateMethodology", "methodology/update", WorkflowMethodologyUpdateDto, "Update project methodology");
applyPostRoute("getTransitions", "transitions/get", WorkflowProjectScopeDto, "Get workflow transitions");
applyPostRoute("updateTransitions", "transitions/update", WorkflowTransitionsUpdateDto, "Update workflow transitions");
applyPostRoute("validateTransition", "transitions/validate", WorkflowTransitionValidationDto, "Validate workflow transition");

Module({
  imports: [TypeOrmModule.forFeature(FULCRUM_WORKFLOW_SPINE_ENTITIES)],
  controllers: [WorkflowSettingsPublicApiController],
  providers: [
    { provide: WORKFLOW_SETTINGS_PUBLIC_API_OPTIONS, useValue: null },
    WorkflowSettingsStore,
    WorkflowSettingsPublicApiService,
  ],
  exports: [WorkflowSettingsPublicApiService],
})(WorkflowSettingsPublicApiModule);

function applyPostRoute(
  method: keyof typeof routeDescriptors,
  path: string,
  bodyType: new () => unknown,
  summary: string,
): void {
  const descriptor = routeDescriptors[method]!;
  Post(path)(WorkflowSettingsPublicApiController.prototype, method, descriptor);
  Body()(WorkflowSettingsPublicApiController.prototype, method, 0);
  ApiOperation({ summary })(WorkflowSettingsPublicApiController.prototype, method, descriptor);
  ApiBody({ type: bodyType })(WorkflowSettingsPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(WorkflowSettingsPublicApiController.prototype, method, descriptor);
}

function resolveProjectId(input: { projectId?: string | null; project_id?: string | null }): string | null {
  return input.projectId ?? input.project_id ?? null;
}

function orchestrationContext(input: OrchestrationScopeDto) {
  return {
    orgId: input.orgId,
    userId: input.userId ?? null,
    projectId: resolveProjectId(input),
  };
}
