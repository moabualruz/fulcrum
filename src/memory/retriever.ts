import { inject, injectable as Injectable } from "@needle-di/core";
import { z } from "zod";

import type { Memory } from "../db/entities/memory/Memory.ts";
import { MEMORY_KINDS } from "../db/entities/memory/enums.ts";
import { MemoryRepository } from "../db/repositories/memory/MemoryRepository.ts";

const UuidLikeSchema = z.string().regex(
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
);

export const RetrieverOptsSchema = z.object({
  orgId: UuidLikeSchema,
  projectId: UuidLikeSchema.nullable().default(null),
  query: z.string().default(""),
  topK: z.number().int().min(1).max(100).default(20),
  includeArchived: z.boolean().default(false),
  kinds: z.array(z.enum(MEMORY_KINDS)).min(1).optional(),
}).strict();

export type RetrieverOpts = z.input<typeof RetrieverOptsSchema>;
export type NormalizedRetrieverOpts = z.output<typeof RetrieverOptsSchema>;

@Injectable()
export class MemoryRetriever {
  constructor(private readonly memoryRepo = inject(MemoryRepository)) {}

  retrieve(query: string, opts: RetrieverOpts): Promise<Memory[]> {
    const input = RetrieverOptsSchema.parse({ ...opts, query });
    return this.memoryRepo.searchProjectAndGlobal(input);
  }
}
