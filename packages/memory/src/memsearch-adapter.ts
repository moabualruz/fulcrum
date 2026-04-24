import { MarkdownMemoryAdapter } from "./markdown-adapter.js";
import { probeMemoryExecutable } from "./probe.js";

export class MemsearchMemoryAdapter extends MarkdownMemoryAdapter {
  readonly backend = "memsearch";

  override health() {
    const probe = probeMemoryExecutable("memsearch", "FULCRUM_MEMSEARCH_ENABLED");
    return {
      state: probe.state,
      limitation:
        probe.state === "managed" ? undefined : `${probe.reason}; local markdown index used.`,
      nextAction:
        probe.state === "managed"
          ? undefined
          : "Install memsearch and set FULCRUM_MEMSEARCH_ENABLED=1 after configuring it.",
      version: probe.version,
      executable: probe.executable
    };
  }
}
