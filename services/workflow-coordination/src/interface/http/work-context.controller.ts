import "reflect-metadata";

import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { IsArray, IsObject, IsOptional, IsString, MinLength } from "class-validator";

import {
  WorkContextPersistenceService,
  type WorkContextPersistenceSummary,
  type WorkContextTraceInput,
} from "@workflow-coordination/application/work-context-persistence.service.ts";

import { WorkContextTraceRequestDto, WorkContextTraceParamsDto, WorkContextPersistedResponseDto, WorkContextTraceSummaryDto } from "./dto/work-context.dto.ts";
export { WorkContextTraceRequestDto, WorkContextTraceParamsDto, WorkContextPersistedResponseDto, WorkContextTraceSummaryDto };

type WorkContextPersistencePort = Pick<
  WorkContextPersistenceService,
  "loadContextTrace" | "persistContextTrace"
>;

export class WorkContextController {
  constructor(private readonly contexts: WorkContextPersistencePort) {}

  async persistContextTrace(
    body: WorkContextTraceRequestDto,
  ): Promise<WorkContextPersistedResponseDto> {
    await this.contexts.persistContextTrace(body);
    return {
      status: "persisted",
      traceId: body.traceId,
      contextBundleId: body.contextBundle.id,
      memoryId: body.memory.id,
      runEventIds: body.runEvents.map((event) => event.id),
    };
  }

  async loadContextTrace(
    params: WorkContextTraceParamsDto,
  ): Promise<WorkContextPersistenceSummary> {
    return await this.contexts.loadContextTrace(params.traceId);
  }
}

for (const property of ["projectId", "traceId"] as const) {
  IsString()(WorkContextTraceRequestDto.prototype, property);
  MinLength(1)(WorkContextTraceRequestDto.prototype, property);
}
for (const property of ["taskId", "runId"] as const) {
  IsString()(WorkContextTraceRequestDto.prototype, property);
  IsOptional()(WorkContextTraceRequestDto.prototype, property);
}
for (const property of ["contextBundle", "memory"] as const) {
  IsObject()(WorkContextTraceRequestDto.prototype, property);
}
for (const property of ["memoryLinks", "runEvents"] as const) {
  IsArray()(WorkContextTraceRequestDto.prototype, property);
}

IsString()(WorkContextTraceParamsDto.prototype, "traceId");
MinLength(1)(WorkContextTraceParamsDto.prototype, "traceId");

for (const property of ["status", "traceId", "contextBundleId", "memoryId"] as const) {
  IsString()(WorkContextPersistedResponseDto.prototype, property);
}
IsArray()(WorkContextPersistedResponseDto.prototype, "runEventIds");

for (const property of ["traceId", "projectId"] as const) {
  IsString()(WorkContextTraceSummaryDto.prototype, property);
}
for (const property of ["contextBundleIds", "memoryIds", "memoryLinks", "runEvents"] as const) {
  IsArray()(WorkContextTraceSummaryDto.prototype, property);
}

const persistContextTraceDescriptor = Object.getOwnPropertyDescriptor(
  WorkContextController.prototype,
  "persistContextTrace",
);
const loadContextTraceDescriptor = Object.getOwnPropertyDescriptor(
  WorkContextController.prototype,
  "loadContextTrace",
);

if (!persistContextTraceDescriptor || !loadContextTraceDescriptor) {
  throw new Error("WorkContextController route descriptors are missing");
}

Inject(WorkContextPersistenceService)(WorkContextController, undefined, 0);
Controller("workflows/context")(WorkContextController);
ApiTags("work-context")(WorkContextController);

Post("context-traces")(
  WorkContextController.prototype,
  "persistContextTrace",
  persistContextTraceDescriptor,
);
Body()(WorkContextController.prototype, "persistContextTrace", 0);
ApiOperation({ summary: "Persist cycle context, memory, and run-event trace state" })(
  WorkContextController.prototype,
  "persistContextTrace",
  persistContextTraceDescriptor,
);
ApiBody({ type: WorkContextTraceRequestDto })(
  WorkContextController.prototype,
  "persistContextTrace",
  persistContextTraceDescriptor,
);
ApiCreatedResponse({ type: WorkContextPersistedResponseDto })(
  WorkContextController.prototype,
  "persistContextTrace",
  persistContextTraceDescriptor,
);

Get("context-traces/:traceId")(
  WorkContextController.prototype,
  "loadContextTrace",
  loadContextTraceDescriptor,
);
Param()(WorkContextController.prototype, "loadContextTrace", 0);
ApiOperation({ summary: "Load cycle context trace state" })(
  WorkContextController.prototype,
  "loadContextTrace",
  loadContextTraceDescriptor,
);
ApiParam({ name: "traceId", required: true })(
  WorkContextController.prototype,
  "loadContextTrace",
  loadContextTraceDescriptor,
);
ApiOkResponse({ type: WorkContextTraceSummaryDto })(
  WorkContextController.prototype,
  "loadContextTrace",
  loadContextTraceDescriptor,
);
