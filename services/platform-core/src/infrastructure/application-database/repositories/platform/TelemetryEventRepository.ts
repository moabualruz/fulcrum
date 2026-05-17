/**
 * TelemetryEventRepository — platform domain (Pillar 17 cross-cutting).
 */

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { TelemetryEvent } from "../../entities/platform/TelemetryEvent.ts";

@Injectable()
export class TelemetryEventRepository {
  constructor(
    @InjectRepository(TelemetryEvent)
    private readonly telemetryEvents: Repository<TelemetryEvent>,
  ) {}
}
