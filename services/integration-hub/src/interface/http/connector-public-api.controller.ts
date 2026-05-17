import "reflect-metadata";

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  InternalServerErrorException,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { IsObject, IsOptional, IsString, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import {
  listConnectors,
  type ConnectorDescriptor,
} from "@integration-hub/application/connectors/web-actions.ts";
import { INTEGRATION_HUB_CONNECTOR_ENTITIES } from "@integration-hub/infrastructure/database/connector.entities.ts";
import {
  ConnectorNotEnabledError,
  ConnectorStore,
  type ConnectorRunPublicRow,
} from "@integration-hub/infrastructure/database/connector-store.ts";
import { isFeatureEnabled } from "@platform-core/infrastructure/product-store/features.ts";

import { ConnectorListQueryDto, ConnectorParamsDto, ConnectorStateBodyDto, ConnectorSyncBodyDto, ConnectorRunListQueryDto, ConnectorRunParamsDto, ConnectorRunQueryDto } from "./dto/connector.dto.ts";
export { ConnectorListQueryDto, ConnectorParamsDto, ConnectorStateBodyDto, ConnectorSyncBodyDto, ConnectorRunListQueryDto, ConnectorRunParamsDto, ConnectorRunQueryDto };

export const CONNECTOR_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.connectorPublicApi.options");

export interface ConnectorPublicApiOptions {
  featuresEnv?: string;
  env?: NodeJS.ProcessEnv;
}

export class ConnectorPublicApiService {
  constructor(
    private readonly options: ConnectorPublicApiOptions | null = null,
    private readonly store: ConnectorStore | null = null,
  ) {}

  async list(query: ConnectorListQueryDto = {}): Promise<ConnectorDescriptor[]> {
    this.requireEnabled();
    const descriptors = this.descriptors();
    if (!query.orgId || !this.store) return descriptors;
    return await this.store.list({ orgId: query.orgId, descriptors });
  }

  async get(params: ConnectorParamsDto, query: ConnectorListQueryDto = {}): Promise<ConnectorDescriptor> {
    this.requireEnabled();
    const descriptor = this.requireDescriptor(params.id);
    if (!query.orgId || !this.store) return descriptor;
    return await this.store.get({ orgId: query.orgId, descriptor });
  }

  async enable(params: ConnectorParamsDto, body: ConnectorStateBodyDto): Promise<ConnectorDescriptor> {
    return await this.requireStore().enable({
      orgId: body.orgId,
      descriptor: this.requireDescriptor(params.id),
      config: body.config,
    });
  }

  async disable(params: ConnectorParamsDto, body: ConnectorStateBodyDto): Promise<ConnectorDescriptor> {
    return await this.requireStore().disable({
      orgId: body.orgId,
      descriptor: this.requireDescriptor(params.id),
    });
  }

  async sync(params: ConnectorParamsDto, body: ConnectorSyncBodyDto): Promise<ConnectorRunPublicRow> {
    try {
      return await this.requireStore().sync({
        orgId: body.orgId,
        descriptor: this.requireDescriptor(params.id),
        trigger: body.trigger,
      });
    } catch (error) {
      if (error instanceof ConnectorNotEnabledError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  async listRuns(query: ConnectorRunListQueryDto): Promise<ConnectorRunPublicRow[]> {
    return await this.requireStore().listRuns(query);
  }

  async getRun(params: ConnectorRunParamsDto, query: ConnectorRunQueryDto): Promise<ConnectorRunPublicRow> {
    const run = await this.requireStore().getRun({ orgId: query.orgId, runId: params.id });
    if (!run) throw new NotFoundException({ error: "connector run not found" });
    return run;
  }

  private requireStore(): ConnectorStore {
    this.requireEnabled();
    if (!this.store) {
      throw new InternalServerErrorException("Connector public API TypeORM store is not configured.");
    }
    return this.store;
  }

  private requireDescriptor(connectorId: string): ConnectorDescriptor {
    const descriptor = this.descriptors().find((entry) => entry.name === connectorId);
    if (!descriptor) throw new NotFoundException({ error: "connector not found" });
    return descriptor;
  }

  private descriptors(): ConnectorDescriptor[] {
    return listConnectors(this.options?.env);
  }

  private requireEnabled(): void {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
  }
}

export class ConnectorPublicApiController {
  constructor(private readonly connectors: ConnectorPublicApiService) {}

  async list(query: ConnectorListQueryDto = {}): Promise<ConnectorDescriptor[]> {
    return await this.connectors.list(query);
  }

  async get(params: ConnectorParamsDto, query: ConnectorListQueryDto = {}): Promise<ConnectorDescriptor> {
    return await this.connectors.get(params, query);
  }

  async enable(params: ConnectorParamsDto, body: ConnectorStateBodyDto): Promise<ConnectorDescriptor> {
    return await this.connectors.enable(params, body);
  }

  async disable(params: ConnectorParamsDto, body: ConnectorStateBodyDto): Promise<ConnectorDescriptor> {
    return await this.connectors.disable(params, body);
  }

  async sync(params: ConnectorParamsDto, body: ConnectorSyncBodyDto): Promise<ConnectorRunPublicRow> {
    return await this.connectors.sync(params, body);
  }
}

export class ConnectorRunPublicApiController {
  constructor(private readonly connectors: ConnectorPublicApiService) {}

  async listRuns(query: ConnectorRunListQueryDto): Promise<ConnectorRunPublicRow[]> {
    return await this.connectors.listRuns(query);
  }

  async getRun(params: ConnectorRunParamsDto, query: ConnectorRunQueryDto): Promise<ConnectorRunPublicRow> {
    return await this.connectors.getRun(params, query);
  }
}

export class ConnectorPublicApiModule {
  static register(options: ConnectorPublicApiOptions): NestDynamicModule {
    return {
      module: ConnectorPublicApiModule,
      imports: [TypeOrmModule.forFeature(INTEGRATION_HUB_CONNECTOR_ENTITIES)],
      controllers: [ConnectorPublicApiController, ConnectorRunPublicApiController],
      providers: [
        { provide: CONNECTOR_PUBLIC_API_OPTIONS, useValue: options },
        ConnectorStore,
        ConnectorPublicApiService,
      ],
      exports: [ConnectorPublicApiService],
    };
  }
}

Inject(CONNECTOR_PUBLIC_API_OPTIONS)(ConnectorPublicApiService, undefined, 0);
Inject(ConnectorStore)(ConnectorPublicApiService, undefined, 1);
Inject(DataSource)(ConnectorStore, undefined, 0);
Inject(ConnectorPublicApiService)(ConnectorPublicApiController, undefined, 0);
Inject(ConnectorPublicApiService)(ConnectorRunPublicApiController, undefined, 0);

IsOptional()(ConnectorListQueryDto.prototype, "orgId");
IsString()(ConnectorListQueryDto.prototype, "orgId");
MinLength(1)(ConnectorListQueryDto.prototype, "orgId");

IsString()(ConnectorParamsDto.prototype, "id");
MinLength(1)(ConnectorParamsDto.prototype, "id");

for (const dto of [ConnectorStateBodyDto, ConnectorSyncBodyDto, ConnectorRunListQueryDto, ConnectorRunQueryDto] as const) {
  IsString()(dto.prototype, "orgId");
  MinLength(1)(dto.prototype, "orgId");
}

IsOptional()(ConnectorStateBodyDto.prototype, "config");
IsObject()(ConnectorStateBodyDto.prototype, "config");

IsOptional()(ConnectorSyncBodyDto.prototype, "trigger");
IsString()(ConnectorSyncBodyDto.prototype, "trigger");
MinLength(1)(ConnectorSyncBodyDto.prototype, "trigger");

IsOptional()(ConnectorRunListQueryDto.prototype, "connectorId");
IsString()(ConnectorRunListQueryDto.prototype, "connectorId");
MinLength(1)(ConnectorRunListQueryDto.prototype, "connectorId");

IsString()(ConnectorRunParamsDto.prototype, "id");
MinLength(1)(ConnectorRunParamsDto.prototype, "id");

const routeDescriptors = {
  list: Object.getOwnPropertyDescriptor(ConnectorPublicApiController.prototype, "list"),
  get: Object.getOwnPropertyDescriptor(ConnectorPublicApiController.prototype, "get"),
  enable: Object.getOwnPropertyDescriptor(ConnectorPublicApiController.prototype, "enable"),
  disable: Object.getOwnPropertyDescriptor(ConnectorPublicApiController.prototype, "disable"),
  sync: Object.getOwnPropertyDescriptor(ConnectorPublicApiController.prototype, "sync"),
} as const;

const runRouteDescriptors = {
  listRuns: Object.getOwnPropertyDescriptor(ConnectorRunPublicApiController.prototype, "listRuns"),
  getRun: Object.getOwnPropertyDescriptor(ConnectorRunPublicApiController.prototype, "getRun"),
} as const;

if (
  Object.values(routeDescriptors).some((descriptor) => !descriptor) ||
  Object.values(runRouteDescriptors).some((descriptor) => !descriptor)
) {
  throw new Error("ConnectorPublicApiController route descriptors are missing");
}

Controller("api/v1/connectors")(ConnectorPublicApiController);
ApiTags("connectors")(ConnectorPublicApiController);

applyGetRoute("list", "", ConnectorListQueryDto, "List connector descriptors");
applyGetRoute("get", ":id", ConnectorListQueryDto, "Get connector descriptor", true);
applyPostRoute("enable", ":id/enable", ConnectorStateBodyDto, "Enable connector", true);
applyPostRoute("disable", ":id/disable", ConnectorStateBodyDto, "Disable connector", true);
applyPostRoute("sync", ":id/sync", ConnectorSyncBodyDto, "Queue connector sync", true, 202);

Controller("api/v1/connector-runs")(ConnectorRunPublicApiController);
ApiTags("connector-runs")(ConnectorRunPublicApiController);

Get()(ConnectorRunPublicApiController.prototype, "listRuns", runRouteDescriptors.listRuns!);
Query()(ConnectorRunPublicApiController.prototype, "listRuns", 0);
ApiOperation({ summary: "List connector sync runs" })(
  ConnectorRunPublicApiController.prototype,
  "listRuns",
  runRouteDescriptors.listRuns!,
);
ApiQuery({ name: "orgId", required: true })(
  ConnectorRunPublicApiController.prototype,
  "listRuns",
  runRouteDescriptors.listRuns!,
);
ApiOkResponse({ description: "Connector sync runs" })(
  ConnectorRunPublicApiController.prototype,
  "listRuns",
  runRouteDescriptors.listRuns!,
);

Get(":id")(ConnectorRunPublicApiController.prototype, "getRun", runRouteDescriptors.getRun!);
Param()(ConnectorRunPublicApiController.prototype, "getRun", 0);
Query()(ConnectorRunPublicApiController.prototype, "getRun", 1);
ApiOperation({ summary: "Get connector sync run" })(
  ConnectorRunPublicApiController.prototype,
  "getRun",
  runRouteDescriptors.getRun!,
);
ApiParam({ name: "id", required: true })(
  ConnectorRunPublicApiController.prototype,
  "getRun",
  runRouteDescriptors.getRun!,
);
ApiOkResponse({ description: "Connector sync run" })(
  ConnectorRunPublicApiController.prototype,
  "getRun",
  runRouteDescriptors.getRun!,
);

Module({
  imports: [TypeOrmModule.forFeature(INTEGRATION_HUB_CONNECTOR_ENTITIES)],
  controllers: [ConnectorPublicApiController, ConnectorRunPublicApiController],
  providers: [
    { provide: CONNECTOR_PUBLIC_API_OPTIONS, useValue: null },
    ConnectorStore,
    ConnectorPublicApiService,
  ],
  exports: [ConnectorPublicApiService],
})(ConnectorPublicApiModule);

function applyGetRoute(
  method: keyof typeof routeDescriptors,
  path: string,
  queryType: new () => unknown,
  summary: string,
  hasId = false,
): void {
  const descriptor = routeDescriptors[method]!;
  Get(path)(ConnectorPublicApiController.prototype, method, descriptor);
  if (hasId) Param()(ConnectorPublicApiController.prototype, method, 0);
  Query()(ConnectorPublicApiController.prototype, method, hasId ? 1 : 0);
  ApiOperation({ summary })(ConnectorPublicApiController.prototype, method, descriptor);
  if (hasId) ApiParam({ name: "id", required: true })(ConnectorPublicApiController.prototype, method, descriptor);
  ApiQuery({ name: "orgId", required: false, type: queryType })(
    ConnectorPublicApiController.prototype,
    method,
    descriptor,
  );
  ApiOkResponse({ description: summary })(ConnectorPublicApiController.prototype, method, descriptor);
}

function applyPostRoute(
  method: keyof typeof routeDescriptors,
  path: string,
  bodyType: new () => unknown,
  summary: string,
  hasId = false,
  statusCode?: number,
): void {
  const descriptor = routeDescriptors[method]!;
  Post(path)(ConnectorPublicApiController.prototype, method, descriptor);
  if (statusCode) HttpCode(statusCode)(ConnectorPublicApiController.prototype, method, descriptor);
  if (hasId) Param()(ConnectorPublicApiController.prototype, method, 0);
  Body()(ConnectorPublicApiController.prototype, method, hasId ? 1 : 0);
  ApiOperation({ summary })(ConnectorPublicApiController.prototype, method, descriptor);
  if (hasId) ApiParam({ name: "id", required: true })(ConnectorPublicApiController.prototype, method, descriptor);
  ApiBody({ type: bodyType })(ConnectorPublicApiController.prototype, method, descriptor);
  if (statusCode === 202) ApiAcceptedResponse({ description: summary })(ConnectorPublicApiController.prototype, method, descriptor);
  else ApiOkResponse({ description: summary })(ConnectorPublicApiController.prototype, method, descriptor);
}
