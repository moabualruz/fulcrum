import "reflect-metadata";

import {
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
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import { NOTIFICATION_CENTER_ENTITIES } from "@notification-center/infrastructure/database/notification.entities.ts";
import { NotificationPublicStore } from "@notification-center/infrastructure/database/notification-public-store.ts";
import { isFeatureEnabled } from "@platform-core/infrastructure/product-store/features.ts";

export const NOTIFICATION_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.notificationPublicApi.options");

export interface NotificationPublicApplication {
  listNotifications(input: {
    orgId: string;
    userId: string;
    unread?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ data: unknown[] }>;
  markRead(input: { orgId: string; userId: string; id: string }): Promise<unknown>;
  unreadCount(input: { orgId: string; userId: string }): Promise<{ count: number }>;
  markAllRead(input: { orgId: string; userId: string }): Promise<{ count: number }>;
  getSettings?(input: { orgId: string; userId: string }): Promise<NotificationSettingsResponseDto>;
  configureChannel?(input: {
    orgId: string;
    userId: string;
    channel: string;
    enabled?: boolean;
    email?: string;
    token?: string;
    url?: string;
    secret?: string;
    subscription?: string | null;
  }): Promise<{ ok: true }>;
  testChannel?(input: { orgId: string; userId: string; channel: string }): Promise<{ id: string; channel: string; status: "pending" }>;
  listRules?(input: { orgId: string; userId: string }): Promise<unknown[]>;
  getRule?(input: { orgId: string; userId: string; id: string }): Promise<unknown | null>;
  createRule?(input: NotificationRuleCreateBodyDto & { orgId: string; userId: string }): Promise<unknown>;
  updateRule?(input: NotificationRulePatchBodyDto & { orgId: string; userId: string; id: string }): Promise<unknown | null>;
  deleteRule?(input: { orgId: string; userId: string; id: string }): Promise<{ ok: true }>;
  getQuietHours?(input: { orgId: string; userId: string }): Promise<unknown | null>;
  setQuietHours?(input: NotificationQuietHoursSetBodyDto & { orgId: string; userId: string }): Promise<unknown>;
  listMutes?(input: { orgId: string; userId: string }): Promise<unknown[]>;
  mute?(input: NotificationMuteBodyDto & { orgId: string; userId: string }): Promise<unknown>;
  unmute?(input: NotificationMuteParamsDto & { orgId: string; userId: string }): Promise<{ ok: true }>;
}

export interface NotificationPublicApiOptions {
  application?: NotificationPublicApplication;
  featuresEnv?: string;
}

export class NotificationListQueryDto {
  orgId!: string;
  userId!: string;
  unread?: boolean | string;
  limit?: number | string;
  offset?: number | string;
}

export class NotificationMarkReadParamsDto {
  id!: string;
}

export class NotificationChannelParamsDto {
  channel!: string;
}

export class NotificationChannelConfigBodyDto {
  enabled?: boolean;
  email?: string;
  token?: string;
  url?: string;
  secret?: string;
  subscription?: string;
}

export class NotificationRuleParamsDto {
  id!: string;
}

export class NotificationRuleCreateBodyDto {
  name!: string;
  subjectKind?: string | null;
  eventPattern?: Record<string, unknown>;
  channels?: string[];
  enabled?: boolean;
  deliveryMode?: "immediate" | "digest" | "delayed";
  digestWindowSeconds?: number | null;
  delaySeconds?: number | null;
  critical?: boolean;
}

export class NotificationRulePatchBodyDto {
  name?: string;
  subjectKind?: string | null;
  eventPattern?: Record<string, unknown>;
  channels?: string[];
  enabled?: boolean;
  deliveryMode?: "immediate" | "digest" | "delayed";
  digestWindowSeconds?: number | null;
  delaySeconds?: number | null;
  critical?: boolean;
}

export class NotificationQuietHoursSetBodyDto {
  tz!: string;
  startHour!: number;
  endHour!: number;
  daysOfWeek!: number[];
}

export class NotificationMuteParamsDto {
  subjectKind!: string;
  subjectId!: string;
}

export class NotificationMuteBodyDto {
  subjectKind!: string;
  subjectId!: string;
  mutedUntil?: string | null;
}

export class NotificationListResponseDto {
  data!: unknown[];
}

export class NotificationUnreadCountResponseDto {
  count!: number;
}

export class NotificationMarkAllReadResponseDto {
  count!: number;
}

export class NotificationSettingsResponseDto {
  channels!: unknown[];
  rules!: unknown[];
  quietHours!: unknown | null;
  mutes!: unknown[];
}

export class NotificationPublicApiService {
  constructor(
    private readonly options: NotificationPublicApiOptions | null = null,
    private readonly store: NotificationPublicStore | null = null,
  ) {}

  async listNotifications(query: NotificationListQueryDto): Promise<NotificationListResponseDto> {
    const application = this.requireApplication();
    return await application.listNotifications({
      orgId: query.orgId,
      userId: query.userId,
      unread: booleanQuery(query.unread),
      limit: integerQuery(query.limit),
      offset: integerQuery(query.offset),
    });
  }

  async markRead(
    params: NotificationMarkReadParamsDto,
    query: NotificationListQueryDto,
  ): Promise<void> {
    const application = this.requireApplication();
    const result = await application.markRead({
      id: params.id,
      orgId: query.orgId,
      userId: query.userId,
    });
    if (!result) {
      throw new NotFoundException({ error: "Notification not found." });
    }
  }

  async unreadCount(query: NotificationListQueryDto): Promise<NotificationUnreadCountResponseDto> {
    const application = this.requireApplication();
    return await application.unreadCount({ orgId: query.orgId, userId: query.userId });
  }

  async markAllRead(query: NotificationListQueryDto): Promise<NotificationMarkAllReadResponseDto> {
    const application = this.requireApplication();
    return await application.markAllRead({ orgId: query.orgId, userId: query.userId });
  }

  async getSettings(query: NotificationListQueryDto): Promise<NotificationSettingsResponseDto> {
    const application = this.requireApplication();
    if (application.getSettings) {
      return await application.getSettings({ orgId: query.orgId, userId: query.userId });
    }
    if (this.store) {
      return await this.store.getSettings({ orgId: query.orgId, userId: query.userId });
    }
    throw new InternalServerErrorException("Notification settings public API facade is not configured.");
  }

  async configureChannel(
    params: NotificationChannelParamsDto,
    query: NotificationListQueryDto,
    body: NotificationChannelConfigBodyDto,
  ): Promise<{ ok: true }> {
    const application = this.requireApplication();
    const input = {
      orgId: query.orgId,
      userId: query.userId,
      channel: params.channel,
      enabled: body.enabled,
      email: body.email,
      token: body.token,
      url: body.url,
      secret: body.secret,
      subscription: body.subscription ?? null,
    };
    if (application.configureChannel) {
      return await application.configureChannel(input);
    }
    if (this.store) {
      return await this.store.configureChannel(input);
    }
    throw new InternalServerErrorException("Notification channel public API facade is not configured.");
  }

  async testChannel(
    params: NotificationChannelParamsDto,
    query: NotificationListQueryDto,
  ): Promise<{ id: string; channel: string; status: "pending" }> {
    const application = this.requireApplication();
    const input = { orgId: query.orgId, userId: query.userId, channel: params.channel };
    if (application.testChannel) return await application.testChannel(input);
    return { id: crypto.randomUUID(), channel: params.channel, status: "pending" };
  }

  async listRules(query: NotificationListQueryDto): Promise<unknown[]> {
    const application = this.requireApplication();
    if (application.listRules) return await application.listRules({ orgId: query.orgId, userId: query.userId });
    if (this.store) return await this.store.listRules({ orgId: query.orgId, userId: query.userId });
    throw new InternalServerErrorException("Notification rule public API facade is not configured.");
  }

  async getRule(params: NotificationRuleParamsDto, query: NotificationListQueryDto): Promise<unknown> {
    const application = this.requireApplication();
    const input = { orgId: query.orgId, userId: query.userId, id: params.id };
    const rule = application.getRule ? await application.getRule(input) : this.store ? await this.store.getRule(input) : null;
    if (!rule) throw new NotFoundException({ error: "Notification rule not found." });
    return rule;
  }

  async createRule(query: NotificationListQueryDto, body: NotificationRuleCreateBodyDto): Promise<unknown> {
    const application = this.requireApplication();
    const input = { ...body, orgId: query.orgId, userId: query.userId };
    if (application.createRule) return await application.createRule(input);
    if (this.store) return await this.store.createRule(input);
    throw new InternalServerErrorException("Notification rule public API facade is not configured.");
  }

  async updateRule(
    params: NotificationRuleParamsDto,
    query: NotificationListQueryDto,
    body: NotificationRulePatchBodyDto,
  ): Promise<unknown> {
    const application = this.requireApplication();
    const input = { ...body, orgId: query.orgId, userId: query.userId, id: params.id };
    const rule = application.updateRule ? await application.updateRule(input) : this.store ? await this.store.updateRule(input) : null;
    if (!rule) throw new NotFoundException({ error: "Notification rule not found." });
    return rule;
  }

  async deleteRule(params: NotificationRuleParamsDto, query: NotificationListQueryDto): Promise<{ ok: true }> {
    const application = this.requireApplication();
    const input = { orgId: query.orgId, userId: query.userId, id: params.id };
    if (application.deleteRule) return await application.deleteRule(input);
    if (this.store) return await this.store.deleteRule(input);
    throw new InternalServerErrorException("Notification rule public API facade is not configured.");
  }

  async getQuietHours(query: NotificationListQueryDto): Promise<unknown | null> {
    const application = this.requireApplication();
    if (application.getQuietHours) return await application.getQuietHours({ orgId: query.orgId, userId: query.userId });
    if (this.store) return await this.store.getQuietHours({ orgId: query.orgId, userId: query.userId });
    throw new InternalServerErrorException("Notification quiet-hours public API facade is not configured.");
  }

  async setQuietHours(query: NotificationListQueryDto, body: NotificationQuietHoursSetBodyDto): Promise<unknown> {
    const application = this.requireApplication();
    const input = { ...body, orgId: query.orgId, userId: query.userId };
    if (application.setQuietHours) return await application.setQuietHours(input);
    if (this.store) return await this.store.setQuietHours(input);
    throw new InternalServerErrorException("Notification quiet-hours public API facade is not configured.");
  }

  async listMutes(query: NotificationListQueryDto): Promise<unknown[]> {
    const application = this.requireApplication();
    if (application.listMutes) return await application.listMutes({ orgId: query.orgId, userId: query.userId });
    if (this.store) return await this.store.listMutes({ orgId: query.orgId, userId: query.userId });
    throw new InternalServerErrorException("Notification mute public API facade is not configured.");
  }

  async mute(query: NotificationListQueryDto, body: NotificationMuteBodyDto): Promise<unknown> {
    const application = this.requireApplication();
    const input = { ...body, orgId: query.orgId, userId: query.userId };
    if (application.mute) return await application.mute(input);
    if (this.store) return await this.store.mute(input);
    throw new InternalServerErrorException("Notification mute public API facade is not configured.");
  }

  async unmute(params: NotificationMuteParamsDto, query: NotificationListQueryDto): Promise<{ ok: true }> {
    const application = this.requireApplication();
    const input = { ...params, orgId: query.orgId, userId: query.userId };
    if (application.unmute) return await application.unmute(input);
    if (this.store) return await this.store.unmute(input);
    throw new InternalServerErrorException("Notification mute public API facade is not configured.");
  }

  private requireApplication(): NotificationPublicApplication {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    const application = this.options?.application;
    if (application) return application;
    if (this.store) return this.store;
    throw new InternalServerErrorException("Notification public API application facade is not configured.");
  }
}

export class NotificationPublicApiController {
  constructor(private readonly notifications: NotificationPublicApiService) {}

  async listNotifications(query: NotificationListQueryDto): Promise<NotificationListResponseDto> {
    return await this.notifications.listNotifications(query);
  }

  async markRead(
    params: NotificationMarkReadParamsDto,
    query: NotificationListQueryDto,
  ): Promise<void> {
    await this.notifications.markRead(params, query);
  }

  async unreadCount(query: NotificationListQueryDto): Promise<NotificationUnreadCountResponseDto> {
    return await this.notifications.unreadCount(query);
  }

  async markAllRead(query: NotificationListQueryDto): Promise<NotificationMarkAllReadResponseDto> {
    return await this.notifications.markAllRead(query);
  }

  async getSettings(query: NotificationListQueryDto): Promise<NotificationSettingsResponseDto> {
    return await this.notifications.getSettings(query);
  }

  async configureChannel(
    params: NotificationChannelParamsDto,
    query: NotificationListQueryDto,
    body: NotificationChannelConfigBodyDto,
  ): Promise<{ ok: true }> {
    return await this.notifications.configureChannel(params, query, body);
  }

  async testChannel(
    params: NotificationChannelParamsDto,
    query: NotificationListQueryDto,
  ): Promise<{ id: string; channel: string; status: "pending" }> {
    return await this.notifications.testChannel(params, query);
  }

  async listRules(query: NotificationListQueryDto): Promise<unknown[]> {
    return await this.notifications.listRules(query);
  }

  async getRule(params: NotificationRuleParamsDto, query: NotificationListQueryDto): Promise<unknown> {
    return await this.notifications.getRule(params, query);
  }

  async createRule(query: NotificationListQueryDto, body: NotificationRuleCreateBodyDto): Promise<unknown> {
    return await this.notifications.createRule(query, body);
  }

  async updateRule(
    params: NotificationRuleParamsDto,
    query: NotificationListQueryDto,
    body: NotificationRulePatchBodyDto,
  ): Promise<unknown> {
    return await this.notifications.updateRule(params, query, body);
  }

  async deleteRule(params: NotificationRuleParamsDto, query: NotificationListQueryDto): Promise<{ ok: true }> {
    return await this.notifications.deleteRule(params, query);
  }

  async getQuietHours(query: NotificationListQueryDto): Promise<unknown | null> {
    return await this.notifications.getQuietHours(query);
  }

  async setQuietHours(query: NotificationListQueryDto, body: NotificationQuietHoursSetBodyDto): Promise<unknown> {
    return await this.notifications.setQuietHours(query, body);
  }

  async listMutes(query: NotificationListQueryDto): Promise<unknown[]> {
    return await this.notifications.listMutes(query);
  }

  async mute(query: NotificationListQueryDto, body: NotificationMuteBodyDto): Promise<unknown> {
    return await this.notifications.mute(query, body);
  }

  async unmute(params: NotificationMuteParamsDto, query: NotificationListQueryDto): Promise<{ ok: true }> {
    return await this.notifications.unmute(params, query);
  }
}

export class NotificationPublicApiModule {
  static register(options: NotificationPublicApiOptions): NestDynamicModule {
    return {
      module: NotificationPublicApiModule,
      imports: [TypeOrmModule.forFeature(NOTIFICATION_CENTER_ENTITIES)],
      controllers: [NotificationPublicApiController],
      providers: [
        { provide: NOTIFICATION_PUBLIC_API_OPTIONS, useValue: options },
        NotificationPublicStore,
        NotificationPublicApiService,
      ],
      exports: [NotificationPublicApiService],
    };
  }
}

Inject(NOTIFICATION_PUBLIC_API_OPTIONS)(NotificationPublicApiService, undefined, 0);
Inject(NotificationPublicStore)(NotificationPublicApiService, undefined, 1);
Inject(DataSource)(NotificationPublicStore, undefined, 0);
Inject(NotificationPublicApiService)(NotificationPublicApiController, undefined, 0);

for (const property of ["orgId", "userId"] as const) {
  IsString()(NotificationListQueryDto.prototype, property);
  MinLength(1)(NotificationListQueryDto.prototype, property);
}
for (const property of ["unread", "limit", "offset"] as const) {
  IsOptional()(NotificationListQueryDto.prototype, property);
}

IsString()(NotificationMarkReadParamsDto.prototype, "id");
MinLength(1)(NotificationMarkReadParamsDto.prototype, "id");

IsString()(NotificationChannelParamsDto.prototype, "channel");
IsIn(["in-app", "email", "slack", "discord", "webhook", "push"])(NotificationChannelParamsDto.prototype, "channel");

for (const property of ["email", "token", "url", "secret", "subscription"] as const) {
  IsOptional()(NotificationChannelConfigBodyDto.prototype, property);
  IsString()(NotificationChannelConfigBodyDto.prototype, property);
}

IsString()(NotificationRuleParamsDto.prototype, "id");
MinLength(1)(NotificationRuleParamsDto.prototype, "id");

IsString()(NotificationRuleCreateBodyDto.prototype, "name");
MinLength(1)(NotificationRuleCreateBodyDto.prototype, "name");
for (const target of [NotificationRuleCreateBodyDto, NotificationRulePatchBodyDto] as const) {
  IsOptional()(target.prototype, "subjectKind");
  IsString()(target.prototype, "subjectKind");
  MinLength(1)(target.prototype, "subjectKind");
  IsOptional()(target.prototype, "eventPattern");
  IsObject()(target.prototype, "eventPattern");
  IsOptional()(target.prototype, "channels");
  IsArray()(target.prototype, "channels");
  IsIn(["in-app", "email", "slack", "discord", "webhook", "push"], { each: true })(target.prototype, "channels");
  IsOptional()(target.prototype, "enabled");
  IsBoolean()(target.prototype, "enabled");
  IsOptional()(target.prototype, "deliveryMode");
  IsIn(["immediate", "digest", "delayed"])(target.prototype, "deliveryMode");
  for (const property of ["digestWindowSeconds", "delaySeconds"] as const) {
    IsOptional()(target.prototype, property);
    IsInt()(target.prototype, property);
    Min(1)(target.prototype, property);
    Max(86_400)(target.prototype, property);
  }
  IsOptional()(target.prototype, "critical");
  IsBoolean()(target.prototype, "critical");
}

IsString()(NotificationQuietHoursSetBodyDto.prototype, "tz");
MinLength(1)(NotificationQuietHoursSetBodyDto.prototype, "tz");
for (const property of ["startHour", "endHour"] as const) {
  IsInt()(NotificationQuietHoursSetBodyDto.prototype, property);
  Min(0)(NotificationQuietHoursSetBodyDto.prototype, property);
  Max(23)(NotificationQuietHoursSetBodyDto.prototype, property);
}
IsArray()(NotificationQuietHoursSetBodyDto.prototype, "daysOfWeek");
IsInt({ each: true })(NotificationQuietHoursSetBodyDto.prototype, "daysOfWeek");
Min(0, { each: true })(NotificationQuietHoursSetBodyDto.prototype, "daysOfWeek");
Max(6, { each: true })(NotificationQuietHoursSetBodyDto.prototype, "daysOfWeek");

for (const property of ["subjectKind", "subjectId"] as const) {
  IsString()(NotificationMuteParamsDto.prototype, property);
  MinLength(1)(NotificationMuteParamsDto.prototype, property);
  IsString()(NotificationMuteBodyDto.prototype, property);
  MinLength(1)(NotificationMuteBodyDto.prototype, property);
}
IsOptional()(NotificationMuteBodyDto.prototype, "mutedUntil");
IsString()(NotificationMuteBodyDto.prototype, "mutedUntil");

const listNotificationsDescriptor = Object.getOwnPropertyDescriptor(
  NotificationPublicApiController.prototype,
  "listNotifications",
);
const markReadDescriptor = Object.getOwnPropertyDescriptor(
  NotificationPublicApiController.prototype,
  "markRead",
);
const unreadCountDescriptor = Object.getOwnPropertyDescriptor(
  NotificationPublicApiController.prototype,
  "unreadCount",
);
const markAllReadDescriptor = Object.getOwnPropertyDescriptor(
  NotificationPublicApiController.prototype,
  "markAllRead",
);
const getSettingsDescriptor = Object.getOwnPropertyDescriptor(
  NotificationPublicApiController.prototype,
  "getSettings",
);
const configureChannelDescriptor = Object.getOwnPropertyDescriptor(
  NotificationPublicApiController.prototype,
  "configureChannel",
);
const testChannelDescriptor = Object.getOwnPropertyDescriptor(
  NotificationPublicApiController.prototype,
  "testChannel",
);
const listRulesDescriptor = Object.getOwnPropertyDescriptor(
  NotificationPublicApiController.prototype,
  "listRules",
);
const getRuleDescriptor = Object.getOwnPropertyDescriptor(
  NotificationPublicApiController.prototype,
  "getRule",
);
const createRuleDescriptor = Object.getOwnPropertyDescriptor(
  NotificationPublicApiController.prototype,
  "createRule",
);
const updateRuleDescriptor = Object.getOwnPropertyDescriptor(
  NotificationPublicApiController.prototype,
  "updateRule",
);
const deleteRuleDescriptor = Object.getOwnPropertyDescriptor(
  NotificationPublicApiController.prototype,
  "deleteRule",
);
const getQuietHoursDescriptor = Object.getOwnPropertyDescriptor(
  NotificationPublicApiController.prototype,
  "getQuietHours",
);
const setQuietHoursDescriptor = Object.getOwnPropertyDescriptor(
  NotificationPublicApiController.prototype,
  "setQuietHours",
);
const listMutesDescriptor = Object.getOwnPropertyDescriptor(
  NotificationPublicApiController.prototype,
  "listMutes",
);
const muteDescriptor = Object.getOwnPropertyDescriptor(
  NotificationPublicApiController.prototype,
  "mute",
);
const unmuteDescriptor = Object.getOwnPropertyDescriptor(
  NotificationPublicApiController.prototype,
  "unmute",
);

if (
  !listNotificationsDescriptor ||
  !markReadDescriptor ||
  !unreadCountDescriptor ||
  !markAllReadDescriptor ||
  !getSettingsDescriptor ||
  !configureChannelDescriptor ||
  !testChannelDescriptor ||
  !listRulesDescriptor ||
  !getRuleDescriptor ||
  !createRuleDescriptor ||
  !updateRuleDescriptor ||
  !deleteRuleDescriptor ||
  !getQuietHoursDescriptor ||
  !setQuietHoursDescriptor ||
  !listMutesDescriptor ||
  !muteDescriptor ||
  !unmuteDescriptor
) {
  throw new Error("NotificationPublicApiController route descriptors are missing");
}

Controller("api/v1/notifications")(NotificationPublicApiController);
ApiTags("notifications")(NotificationPublicApiController);

Get()(NotificationPublicApiController.prototype, "listNotifications", listNotificationsDescriptor);
Query()(NotificationPublicApiController.prototype, "listNotifications", 0);
ApiOperation({ summary: "List user notifications" })(
  NotificationPublicApiController.prototype,
  "listNotifications",
  listNotificationsDescriptor,
);
ApiOkResponse({ type: NotificationListResponseDto })(
  NotificationPublicApiController.prototype,
  "listNotifications",
  listNotificationsDescriptor,
);

Patch(":id/mark-read")(NotificationPublicApiController.prototype, "markRead", markReadDescriptor);
HttpCode(204)(NotificationPublicApiController.prototype, "markRead", markReadDescriptor);
Param()(NotificationPublicApiController.prototype, "markRead", 0);
Query()(NotificationPublicApiController.prototype, "markRead", 1);
ApiOperation({ summary: "Mark notification as read" })(
  NotificationPublicApiController.prototype,
  "markRead",
  markReadDescriptor,
);
ApiParam({ name: "id", required: true })(
  NotificationPublicApiController.prototype,
  "markRead",
  markReadDescriptor,
);
ApiNoContentResponse({ description: "Marked as read" })(
  NotificationPublicApiController.prototype,
  "markRead",
  markReadDescriptor,
);

Get("unread-count")(NotificationPublicApiController.prototype, "unreadCount", unreadCountDescriptor);
Query()(NotificationPublicApiController.prototype, "unreadCount", 0);
ApiOperation({ summary: "Count unread user notifications" })(
  NotificationPublicApiController.prototype,
  "unreadCount",
  unreadCountDescriptor,
);
ApiOkResponse({ type: NotificationUnreadCountResponseDto })(
  NotificationPublicApiController.prototype,
  "unreadCount",
  unreadCountDescriptor,
);

Patch("mark-all-read")(NotificationPublicApiController.prototype, "markAllRead", markAllReadDescriptor);
HttpCode(200)(NotificationPublicApiController.prototype, "markAllRead", markAllReadDescriptor);
Query()(NotificationPublicApiController.prototype, "markAllRead", 0);
ApiOperation({ summary: "Mark all user notifications as read" })(
  NotificationPublicApiController.prototype,
  "markAllRead",
  markAllReadDescriptor,
);
ApiOkResponse({ type: NotificationMarkAllReadResponseDto })(
  NotificationPublicApiController.prototype,
  "markAllRead",
  markAllReadDescriptor,
);

Get("settings")(NotificationPublicApiController.prototype, "getSettings", getSettingsDescriptor);
Query()(NotificationPublicApiController.prototype, "getSettings", 0);
ApiOperation({ summary: "Get notification settings" })(
  NotificationPublicApiController.prototype,
  "getSettings",
  getSettingsDescriptor,
);
ApiOkResponse({ type: NotificationSettingsResponseDto })(
  NotificationPublicApiController.prototype,
  "getSettings",
  getSettingsDescriptor,
);

Patch("channels/:channel")(NotificationPublicApiController.prototype, "configureChannel", configureChannelDescriptor);
HttpCode(200)(NotificationPublicApiController.prototype, "configureChannel", configureChannelDescriptor);
Param()(NotificationPublicApiController.prototype, "configureChannel", 0);
Query()(NotificationPublicApiController.prototype, "configureChannel", 1);
Body()(NotificationPublicApiController.prototype, "configureChannel", 2);
ApiOperation({ summary: "Configure notification channel" })(
  NotificationPublicApiController.prototype,
  "configureChannel",
  configureChannelDescriptor,
);
ApiParam({ name: "channel", required: true })(
  NotificationPublicApiController.prototype,
  "configureChannel",
  configureChannelDescriptor,
);
ApiOkResponse({ description: "Configured notification channel" })(
  NotificationPublicApiController.prototype,
  "configureChannel",
  configureChannelDescriptor,
);

Post("channels/:channel/test")(NotificationPublicApiController.prototype, "testChannel", testChannelDescriptor);
HttpCode(200)(NotificationPublicApiController.prototype, "testChannel", testChannelDescriptor);
Param()(NotificationPublicApiController.prototype, "testChannel", 0);
Query()(NotificationPublicApiController.prototype, "testChannel", 1);
ApiOperation({ summary: "Test notification channel" })(
  NotificationPublicApiController.prototype,
  "testChannel",
  testChannelDescriptor,
);
ApiParam({ name: "channel", required: true })(
  NotificationPublicApiController.prototype,
  "testChannel",
  testChannelDescriptor,
);
ApiOkResponse({ description: "Queued notification channel test" })(
  NotificationPublicApiController.prototype,
  "testChannel",
  testChannelDescriptor,
);

Get("rules")(NotificationPublicApiController.prototype, "listRules", listRulesDescriptor);
Query()(NotificationPublicApiController.prototype, "listRules", 0);
ApiOperation({ summary: "List notification rules" })(
  NotificationPublicApiController.prototype,
  "listRules",
  listRulesDescriptor,
);
ApiOkResponse({ description: "Notification rules" })(
  NotificationPublicApiController.prototype,
  "listRules",
  listRulesDescriptor,
);

Get("rules/:id")(NotificationPublicApiController.prototype, "getRule", getRuleDescriptor);
Param()(NotificationPublicApiController.prototype, "getRule", 0);
Query()(NotificationPublicApiController.prototype, "getRule", 1);
ApiOperation({ summary: "Get notification rule" })(
  NotificationPublicApiController.prototype,
  "getRule",
  getRuleDescriptor,
);
ApiParam({ name: "id", required: true })(NotificationPublicApiController.prototype, "getRule", getRuleDescriptor);
ApiOkResponse({ description: "Notification rule" })(
  NotificationPublicApiController.prototype,
  "getRule",
  getRuleDescriptor,
);

Post("rules")(NotificationPublicApiController.prototype, "createRule", createRuleDescriptor);
Query()(NotificationPublicApiController.prototype, "createRule", 0);
Body()(NotificationPublicApiController.prototype, "createRule", 1);
ApiOperation({ summary: "Create notification rule" })(
  NotificationPublicApiController.prototype,
  "createRule",
  createRuleDescriptor,
);
ApiCreatedResponse({ description: "Created notification rule" })(
  NotificationPublicApiController.prototype,
  "createRule",
  createRuleDescriptor,
);

Patch("rules/:id")(NotificationPublicApiController.prototype, "updateRule", updateRuleDescriptor);
Param()(NotificationPublicApiController.prototype, "updateRule", 0);
Query()(NotificationPublicApiController.prototype, "updateRule", 1);
Body()(NotificationPublicApiController.prototype, "updateRule", 2);
ApiOperation({ summary: "Update notification rule" })(
  NotificationPublicApiController.prototype,
  "updateRule",
  updateRuleDescriptor,
);
ApiParam({ name: "id", required: true })(NotificationPublicApiController.prototype, "updateRule", updateRuleDescriptor);
ApiOkResponse({ description: "Updated notification rule" })(
  NotificationPublicApiController.prototype,
  "updateRule",
  updateRuleDescriptor,
);

Delete("rules/:id")(NotificationPublicApiController.prototype, "deleteRule", deleteRuleDescriptor);
Param()(NotificationPublicApiController.prototype, "deleteRule", 0);
Query()(NotificationPublicApiController.prototype, "deleteRule", 1);
ApiOperation({ summary: "Delete notification rule" })(
  NotificationPublicApiController.prototype,
  "deleteRule",
  deleteRuleDescriptor,
);
ApiParam({ name: "id", required: true })(NotificationPublicApiController.prototype, "deleteRule", deleteRuleDescriptor);
ApiOkResponse({ description: "Deleted notification rule" })(
  NotificationPublicApiController.prototype,
  "deleteRule",
  deleteRuleDescriptor,
);

Get("quiet-hours")(NotificationPublicApiController.prototype, "getQuietHours", getQuietHoursDescriptor);
Query()(NotificationPublicApiController.prototype, "getQuietHours", 0);
ApiOperation({ summary: "Get notification quiet hours" })(
  NotificationPublicApiController.prototype,
  "getQuietHours",
  getQuietHoursDescriptor,
);
ApiOkResponse({ description: "Notification quiet hours" })(
  NotificationPublicApiController.prototype,
  "getQuietHours",
  getQuietHoursDescriptor,
);

Patch("quiet-hours")(NotificationPublicApiController.prototype, "setQuietHours", setQuietHoursDescriptor);
Query()(NotificationPublicApiController.prototype, "setQuietHours", 0);
Body()(NotificationPublicApiController.prototype, "setQuietHours", 1);
ApiOperation({ summary: "Set notification quiet hours" })(
  NotificationPublicApiController.prototype,
  "setQuietHours",
  setQuietHoursDescriptor,
);
ApiOkResponse({ description: "Updated notification quiet hours" })(
  NotificationPublicApiController.prototype,
  "setQuietHours",
  setQuietHoursDescriptor,
);

Get("mutes")(NotificationPublicApiController.prototype, "listMutes", listMutesDescriptor);
Query()(NotificationPublicApiController.prototype, "listMutes", 0);
ApiOperation({ summary: "List notification mutes" })(
  NotificationPublicApiController.prototype,
  "listMutes",
  listMutesDescriptor,
);
ApiOkResponse({ description: "Notification mutes" })(
  NotificationPublicApiController.prototype,
  "listMutes",
  listMutesDescriptor,
);

Post("mutes")(NotificationPublicApiController.prototype, "mute", muteDescriptor);
Query()(NotificationPublicApiController.prototype, "mute", 0);
Body()(NotificationPublicApiController.prototype, "mute", 1);
ApiOperation({ summary: "Mute notification subject" })(
  NotificationPublicApiController.prototype,
  "mute",
  muteDescriptor,
);
ApiCreatedResponse({ description: "Muted notification subject" })(
  NotificationPublicApiController.prototype,
  "mute",
  muteDescriptor,
);

Delete("mutes/:subjectKind/:subjectId")(NotificationPublicApiController.prototype, "unmute", unmuteDescriptor);
Param()(NotificationPublicApiController.prototype, "unmute", 0);
Query()(NotificationPublicApiController.prototype, "unmute", 1);
ApiOperation({ summary: "Unmute notification subject" })(
  NotificationPublicApiController.prototype,
  "unmute",
  unmuteDescriptor,
);
ApiParam({ name: "subjectKind", required: true })(
  NotificationPublicApiController.prototype,
  "unmute",
  unmuteDescriptor,
);
ApiParam({ name: "subjectId", required: true })(
  NotificationPublicApiController.prototype,
  "unmute",
  unmuteDescriptor,
);
ApiOkResponse({ description: "Unmuted notification subject" })(
  NotificationPublicApiController.prototype,
  "unmute",
  unmuteDescriptor,
);

Module({
  imports: [TypeOrmModule.forFeature(NOTIFICATION_CENTER_ENTITIES)],
  controllers: [NotificationPublicApiController],
  providers: [
    { provide: NOTIFICATION_PUBLIC_API_OPTIONS, useValue: null },
    NotificationPublicStore,
    NotificationPublicApiService,
  ],
  exports: [NotificationPublicApiService],
})(NotificationPublicApiModule);

function booleanQuery(value: boolean | string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  return value === "true" || value === "1";
}

function integerQuery(value: number | string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}
