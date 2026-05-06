import type { OrchestrationApplicationContext } from "./types.ts";

export function orchestrationApplicationScope(ctx: OrchestrationApplicationContext): OrchestrationApplicationContext {
  return ctx;
}
