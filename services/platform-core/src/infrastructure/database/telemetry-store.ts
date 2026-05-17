import { randomUUID } from "node:crypto";

import { DataSource } from "typeorm";

import {
  OrganizationMemberEntity,
} from "@identity-access/infrastructure/database/organization.entities.ts";
import { scrubTelemetryPayload } from "@platform-core/application/telemetry/commands.ts";
import {
  FulcrumTelemetryEventEntity,
  FulcrumTelemetrySettingEntity,
  type FulcrumTelemetryEvent,
  type FulcrumTelemetrySetting,
} from "@platform-core/infrastructure/database/telemetry.entities.ts";

export interface TelemetryStatusRow {
  opted_in: boolean;
  row_count: number;
}

export class TelemetryPermissionError extends Error {}

export class TelemetryPublicStore {
  constructor(private readonly dataSource: DataSource) {}

  async status(input: { orgId: string; userId: string }): Promise<TelemetryStatusRow> {
    await this.requireActiveMembership(input);
    return {
      opted_in: await this.getOptedIn(input.orgId),
      row_count: await this.count(input.orgId),
    };
  }

  async setOptedIn(input: { orgId: string; userId: string; value: boolean }): Promise<void> {
    await this.requireActiveMembership(input);
    const existing = await this.settingRepository().findOneBy({ orgId: input.orgId });
    if (existing) {
      existing.optedIn = input.value;
      await this.settingRepository().save(existing);
      return;
    }

    await this.settingRepository().save({
      id: randomUUID(),
      orgId: input.orgId,
      optedIn: input.value,
    });
  }

  async purge(input: { orgId: string; userId: string }): Promise<number> {
    await this.requireActiveMembership(input);
    const result = await this.eventRepository().delete({ orgId: input.orgId });
    return Number(result.affected ?? 0);
  }

  async write(input: {
    orgId: string;
    userId?: string | null;
    kind: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    await this.eventRepository().save({
      id: randomUUID(),
      orgId: input.orgId,
      userId: input.userId ?? null,
      kind: input.kind,
      payload: scrubTelemetryPayload(input.payload ?? {}),
    });
  }

  private async getOptedIn(orgId: string): Promise<boolean> {
    const setting = await this.settingRepository().findOneBy({ orgId });
    return setting?.optedIn === true;
  }

  private async count(orgId: string): Promise<number> {
    return await this.eventRepository().countBy({ orgId });
  }

  private async requireActiveMembership(input: { orgId: string; userId: string }): Promise<void> {
    const membership = await this.dataSource.getRepository(OrganizationMemberEntity).findOneBy({
      orgId: input.orgId,
      userId: input.userId,
    });
    if (!membership) throw new TelemetryPermissionError("Active organization membership required for telemetry access.");
  }

  private settingRepository() {
    return this.dataSource.getRepository<FulcrumTelemetrySetting>(FulcrumTelemetrySettingEntity);
  }

  private eventRepository() {
    return this.dataSource.getRepository<FulcrumTelemetryEvent>(FulcrumTelemetryEventEntity);
  }
}
