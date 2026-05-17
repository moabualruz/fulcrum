import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";

import type { ConnectorDescriptor } from "@integration-hub/application/connectors/web-actions.ts";
import {
  IntegrationConnectorRunEntity,
  IntegrationConnectorStateEntity,
  type IntegrationConnectorRun,
  type IntegrationConnectorRunStatus,
  type IntegrationConnectorState,
} from "@integration-hub/infrastructure/database/connector.entities.ts";

export interface ConnectorRunPublicRow {
  id: string;
  orgId: string;
  connectorId: string;
  status: IntegrationConnectorRunStatus;
  trigger: string;
  summary: Record<string, unknown> | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date | null;
}

export class ConnectorStore {
  constructor(private readonly dataSource: DataSource) {}

  async list(input: {
    orgId: string;
    descriptors: ConnectorDescriptor[];
  }): Promise<ConnectorDescriptor[]> {
    const states = await this.stateRepository().findBy({ orgId: input.orgId });
    const byConnector = new Map(states.map((state) => [state.connectorId, state]));
    return input.descriptors.map((descriptor) => mergeDescriptor(descriptor, byConnector.get(descriptor.name)));
  }

  async get(input: {
    orgId: string;
    descriptor: ConnectorDescriptor;
  }): Promise<ConnectorDescriptor> {
    const state = await this.stateRepository().findOneBy({
      orgId: input.orgId,
      connectorId: input.descriptor.name,
    });
    return mergeDescriptor(input.descriptor, state ?? undefined);
  }

  async enable(input: {
    orgId: string;
    descriptor: ConnectorDescriptor;
    config?: Record<string, unknown> | null;
  }): Promise<ConnectorDescriptor> {
    const repository = this.stateRepository();
    const existing = await repository.findOneBy({
      orgId: input.orgId,
      connectorId: input.descriptor.name,
    });
    const state = repository.create({
      id: existing?.id ?? randomUUID(),
      orgId: input.orgId,
      connectorId: input.descriptor.name,
      enabled: true,
      configJson: toJsonRecord(input.config ?? existing?.configJson ?? input.descriptor.config),
    });
    await repository.save(state);
    return mergeDescriptor(input.descriptor, state);
  }

  async disable(input: {
    orgId: string;
    descriptor: ConnectorDescriptor;
  }): Promise<ConnectorDescriptor> {
    const repository = this.stateRepository();
    const existing = await repository.findOneBy({
      orgId: input.orgId,
      connectorId: input.descriptor.name,
    });
    const state = repository.create({
      id: existing?.id ?? randomUUID(),
      orgId: input.orgId,
      connectorId: input.descriptor.name,
      enabled: false,
      configJson: toJsonRecord(existing?.configJson ?? input.descriptor.config),
    });
    await repository.save(state);
    return mergeDescriptor(input.descriptor, state);
  }

  async sync(input: {
    orgId: string;
    descriptor: ConnectorDescriptor;
    trigger?: string;
  }): Promise<ConnectorRunPublicRow> {
    const state = await this.stateRepository().findOneBy({
      orgId: input.orgId,
      connectorId: input.descriptor.name,
    });
    const enabled = state?.enabled ?? input.descriptor.enabled;
    if (!enabled) throw new ConnectorNotEnabledError(input.descriptor.name);

    const run = await this.runRepository().save({
      id: randomUUID(),
      orgId: input.orgId,
      connectorId: input.descriptor.name,
      status: "queued",
      trigger: input.trigger ?? "manual",
      summaryJson: {
        message: "Connector sync request recorded for the execution queue.",
      },
      startedAt: null,
      completedAt: null,
    });
    return toRunPublicRow(run);
  }

  async listRuns(input: {
    orgId: string;
    connectorId?: string;
  }): Promise<ConnectorRunPublicRow[]> {
    const runs = await this.runRepository().find({
      where: compactObject({
        orgId: input.orgId,
        connectorId: input.connectorId,
      }),
      order: { createdAt: "DESC", id: "ASC" },
    });
    return runs.map(toRunPublicRow);
  }

  async getRun(input: {
    orgId: string;
    runId: string;
  }): Promise<ConnectorRunPublicRow | null> {
    const run = await this.runRepository().findOneBy({
      orgId: input.orgId,
      id: input.runId,
    });
    return run ? toRunPublicRow(run) : null;
  }

  private stateRepository() {
    return this.dataSource.getRepository(IntegrationConnectorStateEntity);
  }

  private runRepository() {
    return this.dataSource.getRepository(IntegrationConnectorRunEntity);
  }
}

export class ConnectorNotEnabledError extends Error {
  constructor(connectorId: string) {
    super(`Connector ${connectorId} is not enabled.`);
  }
}

function mergeDescriptor(
  descriptor: ConnectorDescriptor,
  state: IntegrationConnectorState | undefined,
): ConnectorDescriptor {
  if (!state) return descriptor;
  return {
    name: descriptor.name,
    enabled: state.enabled,
    config: state.configJson as ConnectorDescriptor["config"],
  };
}

function toRunPublicRow(run: IntegrationConnectorRun): ConnectorRunPublicRow {
  return {
    id: run.id,
    orgId: run.orgId,
    connectorId: run.connectorId,
    status: run.status,
    trigger: run.trigger,
    summary: run.summaryJson,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    createdAt: run.createdAt ?? null,
  };
}

function compactObject<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function toJsonRecord(value: Record<string, unknown> | ConnectorDescriptor["config"] | null): Record<string, unknown> | null {
  return value === null ? null : value as Record<string, unknown>;
}
