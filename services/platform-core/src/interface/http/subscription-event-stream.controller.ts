import "reflect-metadata";

import {
  Controller,
  Get,
  Inject,
  Module,
  NotFoundException,
  Query,
  Res,
} from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";

import { getEventBus, serializeSubscriptionEvent } from "@platform-core/application/subscriptions/event-bus.ts";
import { isFeatureEnabled } from "@platform-core/infrastructure/product-store/features.ts";

import { SubscriptionStreamQueryDto, RunUpdateStreamQueryDto } from "./dto/subscription.dto.ts";
export { SubscriptionStreamQueryDto, RunUpdateStreamQueryDto };

export const SUBSCRIPTION_EVENT_STREAM_OPTIONS = Symbol.for("fulcrum.subscriptionEventStream.options");

export interface SubscriptionEventStreamOptions {
  featuresEnv?: string;
  maxEventsPerConnection?: number;
}

interface EventStreamResponse {
  setHeader(name: string, value: string): void;
  write(chunk: string): void | boolean;
  end(): void;
  on?(event: "close", listener: () => void): void;
}

export class SubscriptionEventStreamService {
  constructor(private readonly options: SubscriptionEventStreamOptions | null = null) {}

  async streamRunUpdates(query: RunUpdateStreamQueryDto, response: EventStreamResponse): Promise<void> {
    await this.streamTopic(`agent_run.${query.runId}`, query, response);
  }

  async streamOrchestrationState(query: SubscriptionStreamQueryDto, response: EventStreamResponse): Promise<void> {
    await this.streamTopic(`orchestration.${query.orgId}`, query, response);
  }

  async streamNotifications(query: SubscriptionStreamQueryDto, response: EventStreamResponse): Promise<void> {
    await this.streamTopic(`org.${query.orgId}.notifications`, query, response);
  }

  private async streamTopic(
    topic: string,
    query: SubscriptionStreamQueryDto,
    response: EventStreamResponse,
  ): Promise<void> {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }

    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Fulcrum-Backpressure", "close-at-event-limit");

    await new Promise<void>((resolve) => {
      let closed = false;
      let eventCount = 0;
      const maxEvents = this.options?.maxEventsPerConnection ?? 10_000;
      const finish = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        response.end();
        resolve();
      };
      const unsubscribe = getEventBus().subscribe(topic, (event) => {
        if (closed) return;
        eventCount += 1;
        response.write(`event: message\ndata: ${JSON.stringify(serializeSubscriptionEvent(event))}\n\n`);
        if (query.once === true || eventCount >= maxEvents) finish();
      });
      response.on?.("close", finish);
    });
  }
}

export class SubscriptionEventStreamController {
  constructor(private readonly streams: SubscriptionEventStreamService) {}

  async streamRunUpdates(query: RunUpdateStreamQueryDto, response: EventStreamResponse): Promise<void> {
    await this.streams.streamRunUpdates(query, response);
  }

  async streamOrchestrationState(query: SubscriptionStreamQueryDto, response: EventStreamResponse): Promise<void> {
    await this.streams.streamOrchestrationState(query, response);
  }

  async streamNotifications(query: SubscriptionStreamQueryDto, response: EventStreamResponse): Promise<void> {
    await this.streams.streamNotifications(query, response);
  }
}

export class SubscriptionEventStreamModule {
  static register(options: SubscriptionEventStreamOptions): NestDynamicModule {
    return {
      module: SubscriptionEventStreamModule,
      controllers: [SubscriptionEventStreamController],
      providers: [
        { provide: SUBSCRIPTION_EVENT_STREAM_OPTIONS, useValue: options },
        SubscriptionEventStreamService,
      ],
      exports: [SubscriptionEventStreamService],
    };
  }
}

Inject(SUBSCRIPTION_EVENT_STREAM_OPTIONS)(SubscriptionEventStreamService, undefined, 0);
Inject(SubscriptionEventStreamService)(SubscriptionEventStreamController, undefined, 0);

for (const target of [SubscriptionStreamQueryDto, RunUpdateStreamQueryDto] as const) {
  IsString()(target.prototype, "orgId");
  MinLength(1)(target.prototype, "orgId");
  IsString()(target.prototype, "userId");
  MinLength(1)(target.prototype, "userId");
  IsOptional()(target.prototype, "once");
  IsBoolean()(target.prototype, "once");
}
IsString()(RunUpdateStreamQueryDto.prototype, "runId");
MinLength(1)(RunUpdateStreamQueryDto.prototype, "runId");

const routeDescriptors = {
  streamRunUpdates: Object.getOwnPropertyDescriptor(SubscriptionEventStreamController.prototype, "streamRunUpdates"),
  streamOrchestrationState: Object.getOwnPropertyDescriptor(SubscriptionEventStreamController.prototype, "streamOrchestrationState"),
  streamNotifications: Object.getOwnPropertyDescriptor(SubscriptionEventStreamController.prototype, "streamNotifications"),
} as const;

if (Object.values(routeDescriptors).some((descriptor) => !descriptor)) {
  throw new Error("SubscriptionEventStreamController route descriptors are missing");
}

Controller("api/v1/events")(SubscriptionEventStreamController);
ApiTags("events")(SubscriptionEventStreamController);

applyStreamRoute("streamRunUpdates", "runs", RunUpdateStreamQueryDto, "Stream agent run updates");
applyStreamRoute("streamOrchestrationState", "orchestration", SubscriptionStreamQueryDto, "Stream orchestration state changes");
applyStreamRoute("streamNotifications", "notifications", SubscriptionStreamQueryDto, "Stream notification events");

Module({
  controllers: [SubscriptionEventStreamController],
  providers: [
    { provide: SUBSCRIPTION_EVENT_STREAM_OPTIONS, useValue: null },
    SubscriptionEventStreamService,
  ],
  exports: [SubscriptionEventStreamService],
})(SubscriptionEventStreamModule);

function applyStreamRoute(
  method: keyof typeof routeDescriptors,
  path: string,
  queryType: new () => unknown,
  summary: string,
): void {
  const descriptor = routeDescriptors[method]!;
  Get(path)(SubscriptionEventStreamController.prototype, method, descriptor);
  Query()(SubscriptionEventStreamController.prototype, method, 0);
  Res()(SubscriptionEventStreamController.prototype, method, 1);
  ApiQuery({ type: queryType })(SubscriptionEventStreamController.prototype, method, descriptor);
  ApiOperation({ summary })(SubscriptionEventStreamController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(SubscriptionEventStreamController.prototype, method, descriptor);
}
