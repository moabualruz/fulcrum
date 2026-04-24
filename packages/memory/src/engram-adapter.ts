import { MarkdownMemoryAdapter } from "./markdown-adapter.js";

export class EngramMemoryAdapter extends MarkdownMemoryAdapter {
  readonly backend = "engram";

  override health() {
    return {
      state:
        process.env.FULCRUM_ENGRAM_ENABLED === "1" ? ("managed" as const) : ("degraded" as const),
      limitation:
        process.env.FULCRUM_ENGRAM_ENABLED === "1"
          ? undefined
          : "Engram backend not configured; local markdown index used.",
      nextAction:
        process.env.FULCRUM_ENGRAM_ENABLED === "1"
          ? undefined
          : "Set FULCRUM_ENGRAM_ENABLED=1 after configuring Engram."
    };
  }
}
