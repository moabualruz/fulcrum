import "reflect-metadata";

import { describe, expect, mock, test } from "bun:test";

import { BadRequestException, InternalServerErrorException, NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import { AppModule } from "@fulcrum/server/app.module.ts";
import {
  WebhookCreateBodyDto,
  WebhookListQueryDto,
  WebhookParamsDto,
  WebhookPublicApiController,
  WebhookPublicApiModule,
  WebhookPublicApiService,
} from "@integration-hub/interface/http/webhook-public-api.controller.ts";
import type { DeliveryDto, WebhookDto, WebhookEventType } from "@integration-hub/domain/webhook.ts";
import { AppValidationError } from "@platform-core/domain/errors.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const WEBHOOK_ID = "22222222-2222-4222-8222-222222222222";
const DELIVERY_ID = "33333333-3333-4333-8333-333333333333";

function webhookRow(overrides: Partial<WebhookDto> = {}): WebhookDto {
  return {
    id: WEBHOOK_ID,
    orgId: ORG_ID,
    name: "Build events",
    url: "https://hooks.example.test/fulcrum",
    secret: "****",
    eventsFilter: ["run.failed"] as WebhookEventType[],
    enabled: true,
    createdAt: new Date("2026-05-14T00:00:00.000Z"),
    updatedAt: new Date("2026-05-14T00:00:00.000Z"),
    lastDeliveryAt: null,
    ...overrides,
  };
}

function deliveryRow(overrides: Partial<DeliveryDto> = {}): DeliveryDto {
  return {
    id: DELIVERY_ID,
    orgId: ORG_ID,
    webhookId: WEBHOOK_ID,
    eventId: null,
    status: "failed",
    attempt: 1,
    responseCode: 500,
    error: "boom",
    nextRetryAt: null,
    createdAt: new Date("2026-05-14T01:00:00.000Z"),
    ...overrides,
  };
}

describe("webhook public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, WebhookPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(WebhookPublicApiController);
    expect(appImports).toContain(WebhookPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, WebhookPublicApiController)).toBe("api/v1/webhooks");
    expect(Reflect.getMetadata(PATH_METADATA, WebhookPublicApiController.prototype.listWebhooks)).toBe("/");
    expect(Reflect.getMetadata(METHOD_METADATA, WebhookPublicApiController.prototype.listWebhooks)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, WebhookPublicApiController.prototype.createWebhook)).toBe("/");
    expect(Reflect.getMetadata(METHOD_METADATA, WebhookPublicApiController.prototype.createWebhook)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, WebhookPublicApiController.prototype.listDeliveries)).toBe(
      ":id/deliveries",
    );
    expect(Reflect.getMetadata(PATH_METADATA, WebhookPublicApiController.prototype.resendDelivery)).toBe(
      "deliveries/:deliveryId/resend",
    );
    expect(Reflect.getMetadata(PATH_METADATA, WebhookPublicApiController.prototype.testWebhook)).toBe(":id/test");
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const original = process.env.FULCRUM_FEATURES;
    delete process.env.FULCRUM_FEATURES;
    try {
      const controller = new WebhookPublicApiController(new WebhookPublicApiService());

      await expect(controller.listWebhooks({ orgId: ORG_ID })).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      if (original === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = original;
    }
  });

  test("fails closed when the public API feature is on but no facade is configured", async () => {
    const controller = new WebhookPublicApiController(
      new WebhookPublicApiService({ featuresEnv: "public-api" }),
    );

    await expect(controller.listWebhooks({ orgId: ORG_ID })).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  test("delegates endpoint and delivery operations to the application facade", async () => {
    const listWebhooks = mock(async () => [webhookRow()]);
    const getWebhook = mock(async () => webhookRow());
    const createWebhook = mock(async () => webhookRow({ id: "44444444-4444-4444-8444-444444444444" }));
    const updateWebhook = mock(async () => webhookRow({ enabled: false }));
    const deleteWebhook = mock(async () => ({ ok: true as const }));
    const listDeliveries = mock(async () => [deliveryRow()]);
    const getDelivery = mock(async () => deliveryRow());
    const resendDelivery = mock(async () => deliveryRow({ status: "retrying", attempt: 2 }));
    const testWebhook = mock(async () => deliveryRow({ status: "pending", attempt: 1 }));
    const controller = new WebhookPublicApiController(
      new WebhookPublicApiService({
        featuresEnv: "public-api",
        application: {
          listWebhooks,
          getWebhook,
          createWebhook,
          updateWebhook,
          deleteWebhook,
          listDeliveries,
          getDelivery,
          resendDelivery,
          testWebhook,
        },
      }),
    );

    await expect(controller.listWebhooks({ orgId: ORG_ID, includeDisabled: "true" })).resolves.toEqual([webhookRow()]);
    await expect(controller.getWebhook({ id: WEBHOOK_ID }, { orgId: ORG_ID })).resolves.toEqual(webhookRow());
    await expect(controller.createWebhook(
      { orgId: ORG_ID },
      { name: "New", url: "https://hooks.example.test/new", secret: "secret" },
    )).resolves.toMatchObject({ id: "44444444-4444-4444-8444-444444444444" });
    await expect(controller.updateWebhook(
      { id: WEBHOOK_ID },
      { orgId: ORG_ID },
      { enabled: false },
    )).resolves.toMatchObject({ enabled: false });
    await expect(controller.deleteWebhook({ id: WEBHOOK_ID }, { orgId: ORG_ID })).resolves.toEqual({ ok: true });
    await expect(controller.listDeliveries({ id: WEBHOOK_ID }, { orgId: ORG_ID, limit: "10" })).resolves.toEqual([
      deliveryRow(),
    ]);
    await expect(controller.getDelivery({ deliveryId: DELIVERY_ID }, { orgId: ORG_ID })).resolves.toEqual(deliveryRow());
    await expect(controller.resendDelivery({ deliveryId: DELIVERY_ID }, { orgId: ORG_ID })).resolves.toMatchObject({
      status: "retrying",
      attempt: 2,
    });
    await expect(controller.testWebhook({ id: WEBHOOK_ID }, { orgId: ORG_ID })).resolves.toMatchObject({
      status: "pending",
      attempt: 1,
    });

    expect(listWebhooks).toHaveBeenCalledWith({ orgId: ORG_ID, includeDisabled: true });
    expect(createWebhook).toHaveBeenCalledWith({
      orgId: ORG_ID,
      name: "New",
      url: "https://hooks.example.test/new",
      secret: "secret",
    });
    expect(listDeliveries).toHaveBeenCalledWith({ orgId: ORG_ID, webhookId: WEBHOOK_ID, limit: 10 });
    expect(testWebhook).toHaveBeenCalledWith({ orgId: ORG_ID, id: WEBHOOK_ID });
  });

  test("maps missing rows and validation failures to Nest errors", async () => {
    const controller = new WebhookPublicApiController(
      new WebhookPublicApiService({
        featuresEnv: "public-api",
        application: {
          listWebhooks: async () => [],
          getWebhook: async () => null,
          createWebhook: async () => {
            throw new AppValidationError("Webhook URL must be valid.");
          },
          updateWebhook: async () => null,
          deleteWebhook: async () => ({ ok: true }),
          listDeliveries: async () => [],
          getDelivery: async () => null,
          resendDelivery: async () => null,
          testWebhook: async () => null,
        },
      }),
    );

    await expect(controller.getWebhook({ id: WEBHOOK_ID }, { orgId: ORG_ID })).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.getDelivery({ deliveryId: DELIVERY_ID }, { orgId: ORG_ID })).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.createWebhook(
      { orgId: ORG_ID },
      { name: "Bad", url: "not-a-url" },
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  test("keeps request validation at the Nest boundary", () => {
    const query = Object.assign(new WebhookListQueryDto(), { orgId: ORG_ID, includeDisabled: "true" });
    const params = Object.assign(new WebhookParamsDto(), { id: WEBHOOK_ID });
    const invalidParams = Object.assign(new WebhookParamsDto(), { id: "not-a-uuid" });
    const body = Object.assign(new WebhookCreateBodyDto(), {
      name: "Build events",
      url: "https://hooks.example.test/fulcrum",
      eventsFilter: ["run.failed"],
      enabled: true,
    });

    expect(validateSync(query)).toHaveLength(0);
    expect(validateSync(params)).toHaveLength(0);
    expect(validateSync(invalidParams).map((error) => error.property)).toEqual(["id"]);
    expect(validateSync(body)).toHaveLength(0);
  });
});
