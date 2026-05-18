/**
 * AcpSessionRepository — persisted ACP bridge sessions.
 */

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  limitTrafficEntries,
  type TrafficEntry,
} from "@agent-client-protocol/application/traffic.ts";
import { AcpSession } from "@agent-client-protocol/infrastructure/database/entities/AcpSession.ts";

@Injectable()
export class AcpSessionRepository {
  constructor(
    @InjectRepository(AcpSession)
    private readonly sessions: Repository<AcpSession>,
  ) {}

  async findById(id: string): Promise<AcpSession | null> {
    return this.sessions.findOneBy({ id });
  }

  async findActive(): Promise<AcpSession[]> {
    return this.sessions.find({ where: { status: "active" } });
  }

  async save(session: Partial<AcpSession> & { id: string }): Promise<AcpSession> {
    return this.sessions.save(session);
  }

  async appendTraffic(id: string, entries: TrafficEntry[], maxEntries?: number): Promise<AcpSession | null> {
    const session = await this.findById(id);
    if (!session) return null;

    session.trafficLog = limitTrafficEntries(
      [...toTrafficEntries(session.trafficLog), ...entries],
      maxEntries,
    );
    return this.sessions.save(session);
  }

  async updatePermissionMode(id: string, permissionMode: string | null): Promise<void> {
    await this.sessions.update(id, { permissionMode });
  }

  async updateStatus(id: string, status: string): Promise<void> {
    await this.sessions.update(id, { status });
  }

  async remove(id: string): Promise<void> {
    await this.sessions.delete(id);
  }
}

function toTrafficEntries(value: unknown): TrafficEntry[] {
  return Array.isArray(value) ? (value as TrafficEntry[]) : [];
}
