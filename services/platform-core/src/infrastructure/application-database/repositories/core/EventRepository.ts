import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Event } from "../../entities/core/Event.ts";

@Injectable()
export class EventRepository {
  constructor(
    @InjectRepository(Event)
    private readonly events: Repository<Event>,
  ) {}
}
