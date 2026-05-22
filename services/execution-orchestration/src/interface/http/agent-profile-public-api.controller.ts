import "reflect-metadata";

import { existsSync, statSync } from "node:fs";

import {
  BadRequestException,
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
import type { DynamicModule } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { z } from "zod";

import { createAcpConfigState } from "@agent-client-protocol/application/config-store.ts";
import { createAcpClientBridge } from "@agent-client-protocol/application/client-bridge-factory.ts";
import {
  abortActiveSession,
  deleteSavedSession,
  forkActiveSessionFromCheckpoint,
  pauseActiveSession,
  reconnectActiveSession,
  resolveSessionPermission,
  restoreActiveSessionCheckpoint,
  resumeActiveSession,
  resumeSavedSession,
  updateTrafficControl,
} from "@agent-client-protocol/application/session-manager.ts";
import { createAcpSessionState } from "@agent-client-protocol/application/session-store.ts";
import {
  AcpSessionManager,
  createIdleSessionWorkbenchModel,
  getActiveSessionManager,
  setActiveSessionManager,
} from "@agent-client-protocol/interface/session-workbench.ts";
import { isFeatureEnabled } from "@feature-flags/application/env-features.ts";
import {
  getAgentProfilePageData,
  listAgentProfilesPageData,
  testProfile,
} from "@execution-orchestration/application/agents/queries.ts";
import { dispatchTaskRun } from "@execution-orchestration/application/runs/commands.ts";
import { AgentRun } from "@execution-orchestration/infrastructure/database/entities/orchestration/AgentRun.ts";
import { AgentProfile } from "@execution-orchestration/infrastructure/database/entities/sandbox/AgentProfile.ts";
import { startGuidedAcpPlanningSession } from "@planning-review/application/acp-guided-planning-actions.ts";

export const AGENT_PROFILE_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.agentProfilePublicApi.options");

export interface AgentProfilePublicApiOptions {
  orgId?: string;
  featuresEnv?: string;
}

export class AgentProfileListQueryDto {
  orgId?: string;
  userId?: string | null;
  projectId?: string | null;
}

export class AgentProfileNameParamsDto {
  name!: string;
}

export class AgentProfileTestBodyDto {
  orgId?: string;
  name!: string;
}

export class AgentTaskDispatchBodyDto {
  orgId?: string;
  userId?: string | null;
  projectId?: string | null;
  taskId!: string;
  agent!: string;
}

export class AgentGuidedPlanningBodyDto {
  orgId?: string;
  userId?: string | null;
  projectId?: string | null;
  acpSessionId?: string;
  agentName!: string;
  cwd!: string;
  userPrompt!: string;
  modeId?: string;
  modelId?: string;
  permissionMode?: "review_each_tool" | "allow_workspace" | "read_only";
}

export class AgentSessionPermissionBodyDto {
  sessionId!: string;
  optionId!: string;
}

export class AgentTrafficControlBodyDto {
  action!: string;
  value?: string;
}

export class AgentAbortSessionBodyDto {
  reason?: string | null;
  note?: string | null;
}

export class AgentCheckpointBodyDto {
  checkpointId!: string;
}

export class AgentSavedSessionBodyDto {
  savedSessionId!: string;
}

export class AgentConnectBridgeBodyDto {
  agentName!: string;
  transportType!: string;
  command?: string;
  url?: string;
  modeId?: string;
  modelId?: string;
  cwd!: string;
}

type AgentContext = { orgId: string; userId: string | null; projectId: string | null };

const nullableString = z.preprocess((value) => value === "" ? null : value, z.string().min(1).nullable().optional());
const contextSchema = z.object({
  orgId: z.string().min(1).optional(),
  userId: nullableString,
  projectId: nullableString,
});
const agentNameParamsSchema = z.object({ name: z.string().trim().min(1) });
const testProfileBodySchema = contextSchema.extend({ name: z.string().trim().min(1) });
const dispatchTaskBodySchema = contextSchema.extend({
  taskId: z.string().trim().min(1),
  agent: z.string().trim().min(1),
});
const guidedPlanningBodySchema = contextSchema.extend({
  acpSessionId: z.string().trim().min(1).optional(),
  agentName: z.string().trim().min(1),
  cwd: z.string().trim().min(1),
  userPrompt: z.string().trim().min(1),
  modeId: z.string().trim().min(1).optional(),
  modelId: z.string().trim().min(1).optional(),
  permissionMode: z.enum(["review_each_tool", "allow_workspace", "read_only"]).optional(),
});
const permissionBodySchema = z.object({
  sessionId: z.string().trim().min(1),
  optionId: z.string().trim().min(1),
});
const trafficControlBodySchema = z.object({
  action: z.string().trim().min(1),
  value: z.string().optional(),
});
const abortBodySchema = z.object({
  reason: nullableString,
  note: nullableString,
});
const checkpointBodySchema = z.object({ checkpointId: z.string().trim().min(1) });
const savedSessionBodySchema = z.object({ savedSessionId: z.string().trim().min(1) });
const connectBridgeBodySchema = z.object({
  agentName: z.string().trim().min(1),
  transportType: z.string().trim().min(1),
  command: z.string().optional(),
  url: z.string().optional(),
  modeId: z.string().trim().min(1).optional(),
  modelId: z.string().trim().min(1).optional(),
  cwd: z.string().trim().min(1),
});

export class AgentProfilePublicApiService {
  constructor(
    private readonly options: AgentProfilePublicApiOptions | null = null,
    private readonly dataSource: DataSource | null = null,
  ) {}

  async listAgents(query: AgentProfileListQueryDto): Promise<unknown> {
    const ctx = this.contextFrom(contextSchema.parse(query));
    return {
      ...(await listAgentProfilesPageData(this.requireManager(), ctx)),
      sessionWorkbench: getActiveSessionManager()?.getWorkbenchModel() ?? createIdleSessionWorkbenchModel(),
    };
  }

  async getAgent(params: AgentProfileNameParamsDto, query: AgentProfileListQueryDto): Promise<unknown> {
    const { name } = agentNameParamsSchema.parse(params);
    const data = await getAgentProfilePageData(this.requireManager(), this.contextFrom(contextSchema.parse(query)), name);
    if (!data) throw new NotFoundException({ error: "agent profile not found" });
    return data;
  }

  async testAgent(body: AgentProfileTestBodyDto): Promise<unknown> {
    const input = testProfileBodySchema.parse(body);
    return await testProfile(this.requireManager(), this.requireOrgId(input.orgId), input.name);
  }

  async startGuidedPlanning(body: AgentGuidedPlanningBodyDto): Promise<unknown> {
    const input = guidedPlanningBodySchema.parse(body);
    const ctx = this.contextFrom(input);
    return await startGuidedAcpPlanningSession(this.requireManager(), ctx, {
      acpSessionId: input.acpSessionId,
      agentName: input.agentName,
      cwd: input.cwd,
      userPrompt: input.userPrompt,
      modeId: input.modeId,
      modelId: input.modelId,
      permissionMode: input.permissionMode,
    });
  }

  async dispatchTask(body: AgentTaskDispatchBodyDto): Promise<unknown> {
    const input = dispatchTaskBodySchema.parse(body);
    return await dispatchTaskRun(this.requireManager(), this.contextFrom(input), {
      taskId: input.taskId,
      agent: input.agent,
    });
  }

  async resolvePermission(body: AgentSessionPermissionBodyDto): Promise<{ ok: true }> {
    await resolveSessionPermission(this.requireManager(), permissionBodySchema.parse(body));
    return { ok: true };
  }

  async updateTraffic(body: AgentTrafficControlBodyDto): Promise<{ ok: true }> {
    await updateTrafficControl(this.requireManager(), trafficControlBodySchema.parse(body));
    return { ok: true };
  }

  async reconnectSession(): Promise<{ ok: true }> {
    await reconnectActiveSession(this.requireManager());
    return { ok: true };
  }

  async abortSession(body: AgentAbortSessionBodyDto): Promise<{ ok: true }> {
    await abortActiveSession(this.requireManager(), abortBodySchema.parse(body));
    return { ok: true };
  }

  async pauseSession(): Promise<{ ok: true }> {
    await pauseActiveSession(this.requireManager());
    return { ok: true };
  }

  async resumeSession(): Promise<{ ok: true }> {
    await resumeActiveSession(this.requireManager());
    return { ok: true };
  }

  async restoreCheckpoint(body: AgentCheckpointBodyDto): Promise<{ ok: true }> {
    await restoreActiveSessionCheckpoint(this.requireManager(), checkpointBodySchema.parse(body));
    return { ok: true };
  }

  async forkFromCheckpoint(body: AgentCheckpointBodyDto): Promise<{ ok: true }> {
    await forkActiveSessionFromCheckpoint(this.requireManager(), checkpointBodySchema.parse(body));
    return { ok: true };
  }

  async resumeSavedSession(body: AgentSavedSessionBodyDto): Promise<{ ok: true }> {
    await resumeSavedSession(this.requireManager(), savedSessionBodySchema.parse(body));
    return { ok: true };
  }

  async deleteSavedSession(body: AgentSavedSessionBodyDto): Promise<{ ok: true }> {
    await deleteSavedSession(this.requireManager(), savedSessionBodySchema.parse(body));
    return { ok: true };
  }

  async connectBridge(body: AgentConnectBridgeBodyDto): Promise<{ sessionId: string }> {
    const input = connectBridgeBodySchema.parse(body);
    if (!existsSync(input.cwd) || !statSync(input.cwd).isDirectory()) {
      throw new BadRequestException("working directory must be an existing folder");
    }
    const agentConfig = this.agentConfigFor(input);
    const config = createAcpConfigState({ config: { agents: { [input.agentName]: agentConfig } } });
    const manager = new AcpSessionManager({
      state: createAcpSessionState(),
      config,
      createBridge: async (bridgeInput) => createAcpClientBridge({ config: config.getAgent(bridgeInput.name)!, cwd: input.cwd }),
    });
    setActiveSessionManager(manager);
    const session = await manager.createSession(input.agentName, input.cwd);
    if (input.modeId) await manager.setMode(input.modeId);
    if (input.modelId) await manager.setModel(input.modelId);
    return { sessionId: session.sessionId };
  }

  private agentConfigFor(input: z.infer<typeof connectBridgeBodySchema>): Record<string, unknown> {
    if (input.transportType === "stdio" && input.command) {
      return { type: "stdio", command: input.command, args: [], env: {} };
    }
    if (input.transportType === "websocket" && input.url) {
      return { type: "remote", transport: "websocket", url: input.url, headers: {} };
    }
    throw new BadRequestException("invalid transport config");
  }

  private contextFrom(input: z.infer<typeof contextSchema>): AgentContext {
    return {
      orgId: this.requireOrgId(input.orgId),
      userId: input.userId ?? null,
      projectId: input.projectId ?? null,
    };
  }

  private requireOrgId(scopedOrgId?: string): string {
    const options = this.requireOptions();
    const orgId = scopedOrgId ?? options.orgId;
    if (!orgId) throw new InternalServerErrorException("Agent-profile public API org context is not configured.");
    return orgId;
  }

  private requireManager() {
    this.requireOptions();
    if (!this.dataSource) {
      throw new InternalServerErrorException("Agent-profile public API TypeORM store is not configured.");
    }
    return this.dataSource.manager;
  }

  private requireOptions(): AgentProfilePublicApiOptions {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    return this.options ?? {};
  }
}

export class AgentProfilePublicApiController {
  constructor(private readonly agents: AgentProfilePublicApiService) {}

  async listAgents(query: AgentProfileListQueryDto): Promise<unknown> {
    return await this.agents.listAgents(query);
  }

  async getAgent(params: AgentProfileNameParamsDto, query: AgentProfileListQueryDto): Promise<unknown> {
    return await this.agents.getAgent(params, query);
  }

  async testAgent(body: AgentProfileTestBodyDto): Promise<unknown> {
    return await this.agents.testAgent(body);
  }

  async startGuidedPlanning(body: AgentGuidedPlanningBodyDto): Promise<unknown> {
    return await this.agents.startGuidedPlanning(body);
  }

  async dispatchTask(body: AgentTaskDispatchBodyDto): Promise<unknown> {
    return await this.agents.dispatchTask(body);
  }

  async resolvePermission(body: AgentSessionPermissionBodyDto): Promise<{ ok: true }> {
    return await this.agents.resolvePermission(body);
  }

  async updateTraffic(body: AgentTrafficControlBodyDto): Promise<{ ok: true }> {
    return await this.agents.updateTraffic(body);
  }

  async reconnectSession(): Promise<{ ok: true }> {
    return await this.agents.reconnectSession();
  }

  async abortSession(body: AgentAbortSessionBodyDto): Promise<{ ok: true }> {
    return await this.agents.abortSession(body);
  }

  async pauseSession(): Promise<{ ok: true }> {
    return await this.agents.pauseSession();
  }

  async resumeSession(): Promise<{ ok: true }> {
    return await this.agents.resumeSession();
  }

  async restoreCheckpoint(body: AgentCheckpointBodyDto): Promise<{ ok: true }> {
    return await this.agents.restoreCheckpoint(body);
  }

  async forkFromCheckpoint(body: AgentCheckpointBodyDto): Promise<{ ok: true }> {
    return await this.agents.forkFromCheckpoint(body);
  }

  async resumeSavedSession(body: AgentSavedSessionBodyDto): Promise<{ ok: true }> {
    return await this.agents.resumeSavedSession(body);
  }

  async deleteSavedSession(body: AgentSavedSessionBodyDto): Promise<{ ok: true }> {
    return await this.agents.deleteSavedSession(body);
  }

  async connectBridge(body: AgentConnectBridgeBodyDto): Promise<{ sessionId: string }> {
    return await this.agents.connectBridge(body);
  }
}

export class AgentProfilePublicApiModule {
  static register(options: AgentProfilePublicApiOptions): DynamicModule {
    return {
      module: AgentProfilePublicApiModule,
      imports: [TypeOrmModule.forFeature([AgentProfile, AgentRun])],
      controllers: [AgentProfilePublicApiController],
      providers: [
        { provide: AGENT_PROFILE_PUBLIC_API_OPTIONS, useValue: options },
        AgentProfilePublicApiService,
      ],
      exports: [AgentProfilePublicApiService],
    };
  }
}

Inject(AGENT_PROFILE_PUBLIC_API_OPTIONS)(AgentProfilePublicApiService, undefined, 0);
Inject(DataSource)(AgentProfilePublicApiService, undefined, 1);
Inject(AgentProfilePublicApiService)(AgentProfilePublicApiController, undefined, 0);

const listAgentsDescriptor = Object.getOwnPropertyDescriptor(AgentProfilePublicApiController.prototype, "listAgents");
const getAgentDescriptor = Object.getOwnPropertyDescriptor(AgentProfilePublicApiController.prototype, "getAgent");
const testAgentDescriptor = Object.getOwnPropertyDescriptor(AgentProfilePublicApiController.prototype, "testAgent");
const startGuidedPlanningDescriptor = Object.getOwnPropertyDescriptor(AgentProfilePublicApiController.prototype, "startGuidedPlanning");
const dispatchTaskDescriptor = Object.getOwnPropertyDescriptor(AgentProfilePublicApiController.prototype, "dispatchTask");
const resolvePermissionDescriptor = Object.getOwnPropertyDescriptor(AgentProfilePublicApiController.prototype, "resolvePermission");
const updateTrafficDescriptor = Object.getOwnPropertyDescriptor(AgentProfilePublicApiController.prototype, "updateTraffic");
const reconnectSessionDescriptor = Object.getOwnPropertyDescriptor(AgentProfilePublicApiController.prototype, "reconnectSession");
const abortSessionDescriptor = Object.getOwnPropertyDescriptor(AgentProfilePublicApiController.prototype, "abortSession");
const pauseSessionDescriptor = Object.getOwnPropertyDescriptor(AgentProfilePublicApiController.prototype, "pauseSession");
const resumeSessionDescriptor = Object.getOwnPropertyDescriptor(AgentProfilePublicApiController.prototype, "resumeSession");
const restoreCheckpointDescriptor = Object.getOwnPropertyDescriptor(AgentProfilePublicApiController.prototype, "restoreCheckpoint");
const forkFromCheckpointDescriptor = Object.getOwnPropertyDescriptor(AgentProfilePublicApiController.prototype, "forkFromCheckpoint");
const resumeSavedSessionDescriptor = Object.getOwnPropertyDescriptor(AgentProfilePublicApiController.prototype, "resumeSavedSession");
const deleteSavedSessionDescriptor = Object.getOwnPropertyDescriptor(AgentProfilePublicApiController.prototype, "deleteSavedSession");
const connectBridgeDescriptor = Object.getOwnPropertyDescriptor(AgentProfilePublicApiController.prototype, "connectBridge");

if (
  !listAgentsDescriptor ||
  !getAgentDescriptor ||
  !testAgentDescriptor ||
  !startGuidedPlanningDescriptor ||
  !dispatchTaskDescriptor ||
  !resolvePermissionDescriptor ||
  !updateTrafficDescriptor ||
  !reconnectSessionDescriptor ||
  !abortSessionDescriptor ||
  !pauseSessionDescriptor ||
  !resumeSessionDescriptor ||
  !restoreCheckpointDescriptor ||
  !forkFromCheckpointDescriptor ||
  !resumeSavedSessionDescriptor ||
  !deleteSavedSessionDescriptor ||
  !connectBridgeDescriptor
) {
  throw new Error("AgentProfilePublicApiController route descriptors are missing");
}

Controller("api/v1/agents")(AgentProfilePublicApiController);
ApiTags("agents")(AgentProfilePublicApiController);

Get()(AgentProfilePublicApiController.prototype, "listAgents", listAgentsDescriptor);
Query()(AgentProfilePublicApiController.prototype, "listAgents", 0);
ApiOperation({ summary: "List agent profiles page data" })(AgentProfilePublicApiController.prototype, "listAgents", listAgentsDescriptor);
ApiOkResponse({ description: "Agent profile list page data" })(AgentProfilePublicApiController.prototype, "listAgents", listAgentsDescriptor);

Get(":name")(AgentProfilePublicApiController.prototype, "getAgent", getAgentDescriptor);
Param()(AgentProfilePublicApiController.prototype, "getAgent", 0);
Query()(AgentProfilePublicApiController.prototype, "getAgent", 1);
ApiParam({ name: "name" })(AgentProfilePublicApiController.prototype, "getAgent", getAgentDescriptor);
ApiOperation({ summary: "Load agent profile page data" })(AgentProfilePublicApiController.prototype, "getAgent", getAgentDescriptor);
ApiOkResponse({ description: "Agent profile detail page data" })(AgentProfilePublicApiController.prototype, "getAgent", getAgentDescriptor);

Post("test")(AgentProfilePublicApiController.prototype, "testAgent", testAgentDescriptor);
Body()(AgentProfilePublicApiController.prototype, "testAgent", 0);
ApiOperation({ summary: "Test an agent profile" })(AgentProfilePublicApiController.prototype, "testAgent", testAgentDescriptor);
ApiOkResponse({ description: "Agent profile test result" })(AgentProfilePublicApiController.prototype, "testAgent", testAgentDescriptor);

Post("planning/guided/start")(AgentProfilePublicApiController.prototype, "startGuidedPlanning", startGuidedPlanningDescriptor);
Body()(AgentProfilePublicApiController.prototype, "startGuidedPlanning", 0);
ApiOperation({ summary: "Start a guided ACP planning session" })(AgentProfilePublicApiController.prototype, "startGuidedPlanning", startGuidedPlanningDescriptor);
ApiOkResponse({ description: "Guided ACP planning session" })(AgentProfilePublicApiController.prototype, "startGuidedPlanning", startGuidedPlanningDescriptor);

Post("runs/dispatch")(AgentProfilePublicApiController.prototype, "dispatchTask", dispatchTaskDescriptor);
Body()(AgentProfilePublicApiController.prototype, "dispatchTask", 0);
ApiOperation({ summary: "Dispatch a task run through an agent profile" })(AgentProfilePublicApiController.prototype, "dispatchTask", dispatchTaskDescriptor);
ApiOkResponse({ description: "Dispatched agent run" })(AgentProfilePublicApiController.prototype, "dispatchTask", dispatchTaskDescriptor);

Post("sessions/permissions/resolve")(AgentProfilePublicApiController.prototype, "resolvePermission", resolvePermissionDescriptor);
Body()(AgentProfilePublicApiController.prototype, "resolvePermission", 0);
Post("sessions/traffic")(AgentProfilePublicApiController.prototype, "updateTraffic", updateTrafficDescriptor);
Body()(AgentProfilePublicApiController.prototype, "updateTraffic", 0);
Post("sessions/reconnect")(AgentProfilePublicApiController.prototype, "reconnectSession", reconnectSessionDescriptor);
Post("sessions/abort")(AgentProfilePublicApiController.prototype, "abortSession", abortSessionDescriptor);
Body()(AgentProfilePublicApiController.prototype, "abortSession", 0);
Post("sessions/pause")(AgentProfilePublicApiController.prototype, "pauseSession", pauseSessionDescriptor);
Post("sessions/resume")(AgentProfilePublicApiController.prototype, "resumeSession", resumeSessionDescriptor);
Post("sessions/checkpoints/restore")(AgentProfilePublicApiController.prototype, "restoreCheckpoint", restoreCheckpointDescriptor);
Body()(AgentProfilePublicApiController.prototype, "restoreCheckpoint", 0);
Post("sessions/checkpoints/fork")(AgentProfilePublicApiController.prototype, "forkFromCheckpoint", forkFromCheckpointDescriptor);
Body()(AgentProfilePublicApiController.prototype, "forkFromCheckpoint", 0);
Post("sessions/saved/resume")(AgentProfilePublicApiController.prototype, "resumeSavedSession", resumeSavedSessionDescriptor);
Body()(AgentProfilePublicApiController.prototype, "resumeSavedSession", 0);
Post("sessions/saved/delete")(AgentProfilePublicApiController.prototype, "deleteSavedSession", deleteSavedSessionDescriptor);
Body()(AgentProfilePublicApiController.prototype, "deleteSavedSession", 0);
Post("sessions/connect")(AgentProfilePublicApiController.prototype, "connectBridge", connectBridgeDescriptor);
Body()(AgentProfilePublicApiController.prototype, "connectBridge", 0);

Module({
  imports: [TypeOrmModule.forFeature([AgentProfile, AgentRun])],
  controllers: [AgentProfilePublicApiController],
  providers: [
    { provide: AGENT_PROFILE_PUBLIC_API_OPTIONS, useValue: null },
    AgentProfilePublicApiService,
  ],
  exports: [AgentProfilePublicApiService],
})(AgentProfilePublicApiModule);
