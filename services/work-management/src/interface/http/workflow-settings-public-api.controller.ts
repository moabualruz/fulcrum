import "reflect-metadata";

import { Body, Controller, Inject, InternalServerErrorException, Module, NotFoundException, Post } from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import { isFeatureEnabled } from "@platform-core/infrastructure/product-store/features.ts";
import { FULCRUM_WORKFLOW_SPINE_ENTITIES } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import {
  WorkflowSettingsStore,
  type WorkflowMethodology,
  type WorkflowTransitionGraph,
} from "@work-management/infrastructure/database/workflow-settings-store.ts";

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

export class WorkflowDefaultRequestDto {
  methodology!: WorkflowMethodology;
}

export class WorkflowProjectScopeDto {
  orgId!: string;
  projectId!: string;
}

export class WorkflowTaskTypesUpdateDto extends WorkflowProjectScopeDto {
  types!: string[];
}

export class WorkflowMethodologyUpdateDto extends WorkflowProjectScopeDto {
  methodology!: WorkflowMethodology;
  resetWorkflow?: boolean;
}

export class WorkflowTransitionsUpdateDto extends WorkflowProjectScopeDto {
  transitions!: WorkflowTransitionGraph;
}

export class WorkflowTransitionValidationDto extends WorkflowProjectScopeDto {
  fromStatus!: string;
  toStatus!: string;
}

export class WorkflowSettingsPublicApiService {
  constructor(
    private readonly options: WorkflowSettingsPublicApiOptions | null = null,
    private readonly store: WorkflowSettingsStore | null = null,
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

const routeDescriptors = {
  getDefaultWorkflow: Object.getOwnPropertyDescriptor(WorkflowSettingsPublicApiController.prototype, "getDefaultWorkflow"),
  getEnabledTaskTypes: Object.getOwnPropertyDescriptor(WorkflowSettingsPublicApiController.prototype, "getEnabledTaskTypes"),
  updateEnabledTaskTypes: Object.getOwnPropertyDescriptor(WorkflowSettingsPublicApiController.prototype, "updateEnabledTaskTypes"),
  getMethodology: Object.getOwnPropertyDescriptor(WorkflowSettingsPublicApiController.prototype, "getMethodology"),
  updateMethodology: Object.getOwnPropertyDescriptor(WorkflowSettingsPublicApiController.prototype, "updateMethodology"),
  getTransitions: Object.getOwnPropertyDescriptor(WorkflowSettingsPublicApiController.prototype, "getTransitions"),
  updateTransitions: Object.getOwnPropertyDescriptor(WorkflowSettingsPublicApiController.prototype, "updateTransitions"),
  validateTransition: Object.getOwnPropertyDescriptor(WorkflowSettingsPublicApiController.prototype, "validateTransition"),
} as const;

if (Object.values(routeDescriptors).some((descriptor) => !descriptor)) {
  throw new Error("WorkflowSettingsPublicApiController route descriptors are missing");
}

Controller("api/v1/workflows")(WorkflowSettingsPublicApiController);
ApiTags("workflow-settings")(WorkflowSettingsPublicApiController);

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
