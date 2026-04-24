import { MarkdownMemoryAdapter } from "./markdown-adapter.js";

export class MemsearchMemoryAdapter extends MarkdownMemoryAdapter {
  readonly backend = "memsearch";

  override health() {
    return {
      state:
        process.env.FULCRUM_MEMSEARCH_ENABLED === "1"
          ? ("managed" as const)
          : ("degraded" as const),
      limitation:
        process.env.FULCRUM_MEMSEARCH_ENABLED === "1"
          ? undefined
          : "memsearch backend not configured; local markdown index used.",
      nextAction:
        process.env.FULCRUM_MEMSEARCH_ENABLED === "1"
          ? undefined
          : "Set FULCRUM_MEMSEARCH_ENABLED=1 after configuring memsearch."
    };
  }
}
