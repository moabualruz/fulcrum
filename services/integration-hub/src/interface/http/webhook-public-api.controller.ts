import "reflect-metadata";

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  InternalServerErrorException,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiAcceptedResponse, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUrl, IsUUID } from "class-validator";

import type {
  CreateWebhookInput,
  DeliveryDto,
  UpdateWebhookInput,
  WebhookDto,
  WebhookEventType,
} from "@integration-hub/domain/webhook.ts";
import { INTEGRATION_HUB_WEBHOOK_ENTITIES } from "@integration-hub/infrastructure/database/webhook.entities.ts";
import { WebhookPublicStore } from "@integration-hub/infrastructure/database/webhook-public-store.ts";
import { AppError, AppNotFoundError } from "@platform-core/domain/errors.ts";
import { isFeatureEnabled } from "@feature-flags/application/env-features.ts";

import { WebhookListQueryDto, WebhookParamsDto, WebhookDeliveryParamsDto, WebhookDeliveryListQueryDto, WebhookCreateBodyDto, WebhookUpdateBodyDto } from "./dto/webhook.dto.ts";
export { WebhookListQueryDto, WebhookParamsDto, WebhookDeliveryParamsDto, WebhookDeliveryListQueryDto, WebhookCreateBodyDto, WebhookUpdateBodyDto };

export const WEBHOOK_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.webhookPublicApi.options");

export interface WebhookPublicApplication {
  listWebhooks(input: { orgId: string; includeDisabled?: boolean }): Promise<WebhookDto[]>;
  getWebhook(input: { orgId: string; id: string }): Promise<WebhookDto | null>;
  createWebhook(input: CreateWebhookInput & { orgId: string }): Promise<WebhookDto>;
  updateWebhook(input: UpdateWebhookInput & { orgId: string }): Promise<WebhookDto | null>;
  deleteWebhook(input: { orgId: string; id: string }): Promise<{ ok: true }>;
  listDeliveries(input: { orgId: string; webhookId: string; limit?: number }): Promise<DeliveryDto[]>;
  getDelivery(input: { orgId: string; id: string }): Promise<DeliveryDto | null>;
  resendDelivery(input: { orgId: string; id: string }): Promise<DeliveryDto | null>;
  testWebhook(input: { orgId: string; id: string }): Promise<DeliveryDto | null>;
}

export interface WebhookPublicApiOptions {
  application?: WebhookPublicApplication;
  featuresEnv?: string;
}

export class WebhookPublicApiService {
  constructor(
    private readonly options: WebhookPublicApiOptions | null = null,
    private readonly store: WebhookPublicStore | null = null,
  ) {}

  async listWebhooks(query: WebhookListQueryDto): Promise<WebhookDto[]> {
    return await this.requireApplication().listWebhooks({
      orgId: query.orgId,
      includeDisabled: parseOptionalBoolean(query.includeDisabled),
    });
  }

  async getWebhook(params: WebhookParamsDto, query: WebhookListQueryDto): Promise<WebhookDto> {
    const webhook = await this.requireApplication().getWebhook({ orgId: query.orgId, id: params.id });
    if (!webhook) throw new NotFoundException({ error: "Webhook not found." });
    return webhook;
  }

  async createWebhook(query: WebhookListQueryDto, body: WebhookCreateBodyDto): Promise<WebhookDto> {
    return await this.mapAppError(() => this.requireApplication().createWebhook({ ...body, orgId: query.orgId }));
  }

  async updateWebhook(params: WebhookParamsDto, query: WebhookListQueryDto, body: WebhookUpdateBodyDto): Promise<WebhookDto> {
    const webhook = await this.mapAppError(() =>
      this.requireApplication().updateWebhook({ ...body, orgId: query.orgId, id: params.id })
    );
    if (!webhook) throw new NotFoundException({ error: "Webhook not found." });
    return webhook;
  }

  async deleteWebhook(params: WebhookParamsDto, query: WebhookListQueryDto): Promise<{ ok: true }> {
    return await this.mapAppError(() => this.requireApplication().deleteWebhook({ orgId: query.orgId, id: params.id }));
  }

  async listDeliveries(params: WebhookParamsDto, query: WebhookDeliveryListQueryDto): Promise<DeliveryDto[]> {
    return await this.requireApplication().listDeliveries({
      orgId: query.orgId,
      webhookId: params.id,
      limit: integerQuery(query.limit) ?? 50,
    });
  }

  async getDelivery(params: WebhookDeliveryParamsDto, query: WebhookListQueryDto): Promise<DeliveryDto> {
    const delivery = await this.requireApplication().getDelivery({ orgId: query.orgId, id: params.deliveryId });
    if (!delivery) throw new NotFoundException({ error: "Webhook delivery not found." });
    return delivery;
  }

  async resendDelivery(params: WebhookDeliveryParamsDto, query: WebhookListQueryDto): Promise<DeliveryDto> {
    const delivery = await this.requireApplication().resendDelivery({ orgId: query.orgId, id: params.deliveryId });
    if (!delivery) throw new NotFoundException({ error: "Webhook delivery not found." });
    return delivery;
  }

  async testWebhook(params: WebhookParamsDto, query: WebhookListQueryDto): Promise<DeliveryDto> {
    const delivery = await this.requireApplication().testWebhook({ orgId: query.orgId, id: params.id });
    if (!delivery) throw new NotFoundException({ error: "Webhook not found." });
    return delivery;
  }

  private requireApplication(): WebhookPublicApplication {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    const application = this.options?.application;
    if (application) return application;
    if (this.store) return this.store;
    throw new InternalServerErrorException("Webhook public API application facade is not configured.");
  }

  private async mapAppError<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof AppNotFoundError) throw new NotFoundException({ error: error.message });
      if (error instanceof AppError && error.kind === "validation") throw new BadRequestException({ error: error.message });
      if (error instanceof AppError) throw new InternalServerErrorException(error.message);
      throw error;
    }
  }
}

export class WebhookPublicApiController {
  constructor(private readonly webhooks: WebhookPublicApiService) {}

  async listWebhooks(query: WebhookListQueryDto): Promise<WebhookDto[]> {
    return await this.webhooks.listWebhooks(query);
  }

  async getWebhook(params: WebhookParamsDto, query: WebhookListQueryDto): Promise<WebhookDto> {
    return await this.webhooks.getWebhook(params, query);
  }

  async createWebhook(query: WebhookListQueryDto, body: WebhookCreateBodyDto): Promise<WebhookDto> {
    return await this.webhooks.createWebhook(query, body);
  }

  async updateWebhook(params: WebhookParamsDto, query: WebhookListQueryDto, body: WebhookUpdateBodyDto): Promise<WebhookDto> {
    return await this.webhooks.updateWebhook(params, query, body);
  }

  async deleteWebhook(params: WebhookParamsDto, query: WebhookListQueryDto): Promise<{ ok: true }> {
    return await this.webhooks.deleteWebhook(params, query);
  }

  async listDeliveries(params: WebhookParamsDto, query: WebhookDeliveryListQueryDto): Promise<DeliveryDto[]> {
    return await this.webhooks.listDeliveries(params, query);
  }

  async getDelivery(params: WebhookDeliveryParamsDto, query: WebhookListQueryDto): Promise<DeliveryDto> {
    return await this.webhooks.getDelivery(params, query);
  }

  async resendDelivery(params: WebhookDeliveryParamsDto, query: WebhookListQueryDto): Promise<DeliveryDto> {
    return await this.webhooks.resendDelivery(params, query);
  }

  async testWebhook(params: WebhookParamsDto, query: WebhookListQueryDto): Promise<DeliveryDto> {
    return await this.webhooks.testWebhook(params, query);
  }
}

export class WebhookPublicApiModule {
  static register(options: WebhookPublicApiOptions): NestDynamicModule {
    return {
      module: WebhookPublicApiModule,
      imports: [TypeOrmModule.forFeature(INTEGRATION_HUB_WEBHOOK_ENTITIES)],
      controllers: [WebhookPublicApiController],
      providers: [
        { provide: WEBHOOK_PUBLIC_API_OPTIONS, useValue: options },
        WebhookPublicStore,
        WebhookPublicApiService,
      ],
      exports: [WebhookPublicApiService],
    };
  }
}

function parseOptionalBoolean(value: boolean | string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function integerQuery(value: number | string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;
  return Math.min(parsed, 200);
}

Inject(WEBHOOK_PUBLIC_API_OPTIONS)(WebhookPublicApiService, undefined, 0);
Inject(WebhookPublicStore)(WebhookPublicApiService, undefined, 1);
Inject(WebhookPublicApiService)(WebhookPublicApiController, undefined, 0);

IsUUID()(WebhookListQueryDto.prototype, "orgId");
IsOptional()(WebhookListQueryDto.prototype, "includeDisabled");
IsUUID()(WebhookParamsDto.prototype, "id");
IsUUID()(WebhookDeliveryParamsDto.prototype, "deliveryId");
IsUUID()(WebhookDeliveryListQueryDto.prototype, "orgId");
IsOptional()(WebhookDeliveryListQueryDto.prototype, "limit");
IsString()(WebhookCreateBodyDto.prototype, "name");
IsUrl()(WebhookCreateBodyDto.prototype, "url");
IsOptional()(WebhookCreateBodyDto.prototype, "secret");
IsString()(WebhookCreateBodyDto.prototype, "secret");
IsOptional()(WebhookCreateBodyDto.prototype, "eventsFilter");
IsArray()(WebhookCreateBodyDto.prototype, "eventsFilter");
IsIn(["task.created", "task.updated", "task.completed", "run.started", "run.completed", "run.failed", "doc.created", "doc.updated", "sprint.started", "sprint.completed"], { each: true })(
  WebhookCreateBodyDto.prototype,
  "eventsFilter",
);
IsOptional()(WebhookCreateBodyDto.prototype, "enabled");
IsBoolean()(WebhookCreateBodyDto.prototype, "enabled");
IsOptional()(WebhookUpdateBodyDto.prototype, "name");
IsString()(WebhookUpdateBodyDto.prototype, "name");
IsOptional()(WebhookUpdateBodyDto.prototype, "url");
IsUrl()(WebhookUpdateBodyDto.prototype, "url");
IsOptional()(WebhookUpdateBodyDto.prototype, "secret");
IsString()(WebhookUpdateBodyDto.prototype, "secret");
IsOptional()(WebhookUpdateBodyDto.prototype, "eventsFilter");
IsArray()(WebhookUpdateBodyDto.prototype, "eventsFilter");
IsIn(["task.created", "task.updated", "task.completed", "run.started", "run.completed", "run.failed", "doc.created", "doc.updated", "sprint.started", "sprint.completed"], { each: true })(
  WebhookUpdateBodyDto.prototype,
  "eventsFilter",
);
IsOptional()(WebhookUpdateBodyDto.prototype, "enabled");
IsBoolean()(WebhookUpdateBodyDto.prototype, "enabled");

const listWebhooksDescriptor = Object.getOwnPropertyDescriptor(WebhookPublicApiController.prototype, "listWebhooks");
const getWebhookDescriptor = Object.getOwnPropertyDescriptor(WebhookPublicApiController.prototype, "getWebhook");
const createWebhookDescriptor = Object.getOwnPropertyDescriptor(WebhookPublicApiController.prototype, "createWebhook");
const updateWebhookDescriptor = Object.getOwnPropertyDescriptor(WebhookPublicApiController.prototype, "updateWebhook");
const deleteWebhookDescriptor = Object.getOwnPropertyDescriptor(WebhookPublicApiController.prototype, "deleteWebhook");
const listDeliveriesDescriptor = Object.getOwnPropertyDescriptor(WebhookPublicApiController.prototype, "listDeliveries");
const getDeliveryDescriptor = Object.getOwnPropertyDescriptor(WebhookPublicApiController.prototype, "getDelivery");
const resendDeliveryDescriptor = Object.getOwnPropertyDescriptor(WebhookPublicApiController.prototype, "resendDelivery");
const testWebhookDescriptor = Object.getOwnPropertyDescriptor(WebhookPublicApiController.prototype, "testWebhook");

if (
  !listWebhooksDescriptor ||
  !getWebhookDescriptor ||
  !createWebhookDescriptor ||
  !updateWebhookDescriptor ||
  !deleteWebhookDescriptor ||
  !listDeliveriesDescriptor ||
  !getDeliveryDescriptor ||
  !resendDeliveryDescriptor ||
  !testWebhookDescriptor
) {
  throw new Error("WebhookPublicApiController route descriptors are missing");
}

Controller("api/v1/webhooks")(WebhookPublicApiController);
ApiTags("webhooks")(WebhookPublicApiController);

Get()(WebhookPublicApiController.prototype, "listWebhooks", listWebhooksDescriptor);
Query()(WebhookPublicApiController.prototype, "listWebhooks", 0);
ApiOperation({ summary: "List webhook endpoints" })(WebhookPublicApiController.prototype, "listWebhooks", listWebhooksDescriptor);
ApiOkResponse({ description: "Webhook endpoints" })(WebhookPublicApiController.prototype, "listWebhooks", listWebhooksDescriptor);

Get(":id")(WebhookPublicApiController.prototype, "getWebhook", getWebhookDescriptor);
Param()(WebhookPublicApiController.prototype, "getWebhook", 0);
Query()(WebhookPublicApiController.prototype, "getWebhook", 1);
ApiOperation({ summary: "Get a webhook endpoint" })(WebhookPublicApiController.prototype, "getWebhook", getWebhookDescriptor);
ApiParam({ name: "id", required: true })(WebhookPublicApiController.prototype, "getWebhook", getWebhookDescriptor);
ApiOkResponse({ description: "Webhook endpoint" })(WebhookPublicApiController.prototype, "getWebhook", getWebhookDescriptor);

Post()(WebhookPublicApiController.prototype, "createWebhook", createWebhookDescriptor);
Query()(WebhookPublicApiController.prototype, "createWebhook", 0);
Body()(WebhookPublicApiController.prototype, "createWebhook", 1);
ApiOperation({ summary: "Create a webhook endpoint" })(WebhookPublicApiController.prototype, "createWebhook", createWebhookDescriptor);
ApiCreatedResponse({ description: "Created webhook endpoint" })(WebhookPublicApiController.prototype, "createWebhook", createWebhookDescriptor);

Patch(":id")(WebhookPublicApiController.prototype, "updateWebhook", updateWebhookDescriptor);
Param()(WebhookPublicApiController.prototype, "updateWebhook", 0);
Query()(WebhookPublicApiController.prototype, "updateWebhook", 1);
Body()(WebhookPublicApiController.prototype, "updateWebhook", 2);
ApiOperation({ summary: "Update a webhook endpoint" })(WebhookPublicApiController.prototype, "updateWebhook", updateWebhookDescriptor);
ApiParam({ name: "id", required: true })(WebhookPublicApiController.prototype, "updateWebhook", updateWebhookDescriptor);
ApiOkResponse({ description: "Updated webhook endpoint" })(WebhookPublicApiController.prototype, "updateWebhook", updateWebhookDescriptor);

Delete(":id")(WebhookPublicApiController.prototype, "deleteWebhook", deleteWebhookDescriptor);
HttpCode(200)(WebhookPublicApiController.prototype, "deleteWebhook", deleteWebhookDescriptor);
Param()(WebhookPublicApiController.prototype, "deleteWebhook", 0);
Query()(WebhookPublicApiController.prototype, "deleteWebhook", 1);
ApiOperation({ summary: "Delete a webhook endpoint" })(WebhookPublicApiController.prototype, "deleteWebhook", deleteWebhookDescriptor);
ApiNoContentResponse({ description: "Deleted webhook endpoint" })(WebhookPublicApiController.prototype, "deleteWebhook", deleteWebhookDescriptor);

Get(":id/deliveries")(WebhookPublicApiController.prototype, "listDeliveries", listDeliveriesDescriptor);
Param()(WebhookPublicApiController.prototype, "listDeliveries", 0);
Query()(WebhookPublicApiController.prototype, "listDeliveries", 1);
ApiOperation({ summary: "List webhook delivery attempts" })(WebhookPublicApiController.prototype, "listDeliveries", listDeliveriesDescriptor);
ApiParam({ name: "id", required: true })(WebhookPublicApiController.prototype, "listDeliveries", listDeliveriesDescriptor);
ApiOkResponse({ description: "Webhook delivery attempts" })(WebhookPublicApiController.prototype, "listDeliveries", listDeliveriesDescriptor);

Get("deliveries/:deliveryId")(WebhookPublicApiController.prototype, "getDelivery", getDeliveryDescriptor);
Param()(WebhookPublicApiController.prototype, "getDelivery", 0);
Query()(WebhookPublicApiController.prototype, "getDelivery", 1);
ApiOperation({ summary: "Get a webhook delivery attempt" })(WebhookPublicApiController.prototype, "getDelivery", getDeliveryDescriptor);
ApiParam({ name: "deliveryId", required: true })(WebhookPublicApiController.prototype, "getDelivery", getDeliveryDescriptor);
ApiOkResponse({ description: "Webhook delivery attempt" })(WebhookPublicApiController.prototype, "getDelivery", getDeliveryDescriptor);

Post("deliveries/:deliveryId/resend")(WebhookPublicApiController.prototype, "resendDelivery", resendDeliveryDescriptor);
HttpCode(202)(WebhookPublicApiController.prototype, "resendDelivery", resendDeliveryDescriptor);
Param()(WebhookPublicApiController.prototype, "resendDelivery", 0);
Query()(WebhookPublicApiController.prototype, "resendDelivery", 1);
ApiOperation({ summary: "Queue a webhook delivery retry" })(WebhookPublicApiController.prototype, "resendDelivery", resendDeliveryDescriptor);
ApiParam({ name: "deliveryId", required: true })(WebhookPublicApiController.prototype, "resendDelivery", resendDeliveryDescriptor);
ApiAcceptedResponse({ description: "Webhook delivery retry queued" })(WebhookPublicApiController.prototype, "resendDelivery", resendDeliveryDescriptor);

Post(":id/test")(WebhookPublicApiController.prototype, "testWebhook", testWebhookDescriptor);
HttpCode(202)(WebhookPublicApiController.prototype, "testWebhook", testWebhookDescriptor);
Param()(WebhookPublicApiController.prototype, "testWebhook", 0);
Query()(WebhookPublicApiController.prototype, "testWebhook", 1);
ApiOperation({ summary: "Queue a webhook test delivery" })(WebhookPublicApiController.prototype, "testWebhook", testWebhookDescriptor);
ApiParam({ name: "id", required: true })(WebhookPublicApiController.prototype, "testWebhook", testWebhookDescriptor);
ApiAcceptedResponse({ description: "Webhook test delivery queued" })(WebhookPublicApiController.prototype, "testWebhook", testWebhookDescriptor);

Module({
  imports: [TypeOrmModule.forFeature(INTEGRATION_HUB_WEBHOOK_ENTITIES)],
  controllers: [WebhookPublicApiController],
  providers: [
    { provide: WEBHOOK_PUBLIC_API_OPTIONS, useValue: null },
    WebhookPublicStore,
    WebhookPublicApiService,
  ],
  exports: [WebhookPublicApiService],
})(WebhookPublicApiModule);
