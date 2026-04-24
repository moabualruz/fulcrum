import { MarkdownMemoryAdapter } from "./markdown-adapter.js";
import { probeMemoryExecutable } from "./probe.js";

export class EngramMemoryAdapter extends MarkdownMemoryAdapter {
  readonly backend = "engram";

  override health() {
    const probe = probeMemoryExecutable("engram", "FULCRUM_ENGRAM_ENABLED");
    return {
      state: probe.state,
      limitation:
        probe.state === "managed" ? undefined : `${probe.reason}; local markdown index used.`,
      nextAction:
        probe.state === "managed"
          ? undefined
          : "Install Engram and set FULCRUM_ENGRAM_ENABLED=1 after configuring it.",
      version: probe.version,
      executable: probe.executable
    };
  }
}
