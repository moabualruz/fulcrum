import { describe, expect, it } from "vitest";
import {
  AdapterRegistryService,
  ToolHealthAdapter,
  certifyAdapters,
  createDefaultAdapterHealthModules
} from "@fulcrum/core";

describe("adapter certification contract", () => {
  it("certifies optional adapters with offline, disablement, privacy, and evidence fields", async () => {
    const registry = new AdapterRegistryService(createDefaultAdapterHealthModules());

    const certifications = await certifyAdapters(registry);
    const markdown = certifications.find((entry) => entry.adapterId === "adapter_memory_markdown");
    const telemetry = certifications.find(
      (entry) => entry.adapterId === "adapter_telemetry_disabled"
    );

    expect(markdown).toMatchObject({
      status: "certified",
      testMode: "real",
      credentialStatus: "not_required"
    });
    expect(markdown?.offlineBehavior).toContain("Local Fulcrum records remain usable");
    expect(markdown?.healthEvidence[0]).toBe("adapters/adapter_memory_markdown-health.json");
    expect(telemetry).toMatchObject({ status: "optional", testMode: "disabled" });
  });

  it("marks enabled unreachable adapters degraded instead of blocking local operation", async () => {
    const registry = new AdapterRegistryService([
      new ToolHealthAdapter({
        adapterId: "adapter_missing_tool",
        category: "code_tool",
        name: "Missing tool",
        enabled: true,
        command: "fulcrum-tool-that-does-not-exist",
        affectedWorkflows: ["code"],
        localFallback: ["Exact local search remains available."]
      })
    ]);

    const [certification] = await certifyAdapters(registry);

    expect(certification).toMatchObject({
      adapterId: "adapter_missing_tool",
      status: "degraded",
      testMode: "real"
    });
    expect(certification?.disablementBehavior).toContain("Disabling preserves");
  });
});
