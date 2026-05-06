import type { MemoryApplicationContext } from "./types.ts";

export function memoryApplicationScope(ctx: MemoryApplicationContext): MemoryApplicationContext {
  return ctx;
}
