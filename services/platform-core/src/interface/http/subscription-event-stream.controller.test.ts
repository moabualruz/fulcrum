import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import { AppModule } from "@fulcrum/server/app.module.ts";
import { getEventBus, resetEventBus } from "@platform-core/application/subscriptions/event-bus.ts";
import {
  RunUpdateStreamQueryDto,
  SubscriptionEventStreamController,
  SubscriptionEventStreamModule,
  SubscriptionEventStreamService,
  SubscriptionStreamQueryDto,
} from "@platform-core/interface/http/subscription-event-stream.controller.ts";

afterEach(() => {
  resetEventBus();
});

describe("subscription event stream Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, SubscriptionEventStreamModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(SubscriptionEventStreamController);
    expect(appImports).toContain(SubscriptionEventStreamModule);
    expect(Reflect.getMetadata(PATH_METADATA, SubscriptionEventStreamController)).toBe("api/v1/events");
    expect(Reflect.getMetadata(METHOD_METADATA, SubscriptionEventStreamController.prototype.streamRunUpdates)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(METHOD_METADATA, SubscriptionEventStreamController.prototype.streamNotifications)).toBe(RequestMethod.GET);
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const controller = new SubscriptionEventStreamController(new SubscriptionEventStreamService());

    await expect(controller.streamNotifications(
      { orgId: "workspace-1", userId: "user-1", once: true },
      new FakeEventStreamResponse(),
    )).rejects.toBeInstanceOf(NotFoundException);
  });

  test("keeps request validation at the Nest boundary", () => {
    const invalidRun = Object.assign(new RunUpdateStreamQueryDto(), {
      orgId: "",
      userId: "",
      runId: "",
    });
    const invalidBase = Object.assign(new SubscriptionStreamQueryDto(), {
      orgId: "",
      userId: "",
    });

    expect(validateSync(invalidRun).map((error) => error.property).sort()).toEqual(["orgId", "runId", "userId"]);
    expect(validateSync(invalidBase).map((error) => error.property).sort()).toEqual(["orgId", "userId"]);
  });

  test("streams run, orchestration, and notification event-bus topics as SSE", async () => {
    const controller = new SubscriptionEventStreamController(
      new SubscriptionEventStreamService({ featuresEnv: "public-api" }),
    );

    await expectStream(
      (response) => controller.streamRunUpdates(
        { orgId: "workspace-1", userId: "user-1", runId: "run-1", once: true },
        response,
      ),
      "agent_run.run-1",
      { runId: "run-1", status: "running" },
    );
    await expectStream(
      (response) => controller.streamOrchestrationState(
        { orgId: "workspace-1", userId: "user-1", once: true },
        response,
      ),
      "orchestration.workspace-1",
      { state: "reviewing", previousState: "running" },
    );
    await expectStream(
      (response) => controller.streamNotifications(
        { orgId: "workspace-1", userId: "user-1", once: true },
        response,
      ),
      "org.workspace-1.notifications",
      { id: "notification-1", title: "Ready" },
    );
  });

  test("closes long-lived streams at configured event limit", async () => {
    const controller = new SubscriptionEventStreamController(
      new SubscriptionEventStreamService({ featuresEnv: "public-api", maxEventsPerConnection: 2 }),
    );
    const response = new FakeEventStreamResponse();
    const stream = controller.streamNotifications(
      { orgId: "workspace-1", userId: "user-1" },
      response,
    );

    getEventBus().publish("org.workspace-1.notifications", { id: "n1" });
    getEventBus().publish("org.workspace-1.notifications", { id: "n2" });
    await stream;

    expect(response.ended).toBe(true);
    expect(response.chunks).toHaveLength(2);
    expect(getEventBus().listenerCount("org.workspace-1.notifications")).toBe(0);
  });
});

async function expectStream(
  start: (response: FakeEventStreamResponse) => Promise<void>,
  topic: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const response = new FakeEventStreamResponse();
  const stream = start(response);
  getEventBus().publish(topic, payload);
  await stream;

    expect(response.headers).toMatchObject({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Fulcrum-Backpressure": "close-at-event-limit",
    });
    expect(response.ended).toBe(true);
  const event = JSON.parse(response.chunks.join("").match(/^data: (.*)$/m)?.[1] ?? "{}");
  expect(event).toMatchObject({ topic, payload });
  expect(new Date(event.timestamp).toString()).not.toBe("Invalid Date");
}

class FakeEventStreamResponse {
  readonly headers: Record<string, string> = {};
  readonly chunks: string[] = [];
  ended = false;
  private closeHandler: (() => void) | undefined;

  setHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  write(chunk: string): void {
    this.chunks.push(chunk);
  }

  end(): void {
    this.ended = true;
  }

  on(event: "close", listener: () => void): void {
    if (event === "close") this.closeHandler = listener;
  }

  close(): void {
    this.closeHandler?.();
  }
}
