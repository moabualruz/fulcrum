import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type { EntityManager, DeepPartial } from "typeorm";
import { Event } from "../../entities/core/Event.ts";

@Injectable()
export class EventRepository {
  constructor(
    @InjectRepository(Event)
    private readonly events: Repository<Event>,
  ) {}

  get manager(): EntityManager {
    return this.events.manager;
  }

  create(data?: DeepPartial<Event>): Event {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.events.create(data as any);
  }

  save(entity: Event): Promise<Event> {
    type SaveSingle = (entity: Event) => Promise<Event>;
    return (this.events.save as unknown as SaveSingle)(entity);
  }
}
