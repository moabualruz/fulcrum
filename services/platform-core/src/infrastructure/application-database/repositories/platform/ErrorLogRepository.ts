/**
 * ErrorLogRepository — platform domain (Pillar 17 cross-cutting).
 */

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ErrorLog } from "../../entities/platform/ErrorLog.ts";

@Injectable()
export class ErrorLogRepository {
  constructor(
    @InjectRepository(ErrorLog)
    private readonly errorLogs: Repository<ErrorLog>,
  ) {}
}
