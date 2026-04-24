import { describe, expect, it } from "vitest";
import {
  AdapterRegistryService,
  ToolHealthAdapter,
  buildAdapterDegradationSummary,
  type AdapterConfigurationRepositoryPort
} from "@fulcrum/core";
import type { AdapterMetadata } from "@fulcrum/shared";

class MemoryAdapterRepository implements AdapterConfigurationRepositoryPort {
  private readonly records = new Map<string, AdapterMetadata>();

  save(metadata: AdapterMetadata): AdapterMetadata {
    this.records.set(metadata.adapterId, metadata);
    return metadata;
  }

  get(adapterId: string): AdapterMetadata | undefined {
    return this.records.get(adapterId);
  }

  list(): AdapterMetadata[] {
    return [...this.records.values()];
  }
}

describe("adapter degradation integration", () => {
  it("enables, disables, and surfaces outage without blocking local workflows", async () => {
    const registry = new AdapterRegistryService([
      new ToolHealthAdapter({
        adapterId: "adapter_missing_tool",
        category: "code_tool",
        name: "Missing tool",
        enabled: true,
        command: "fulcrum-tool-that-does-not-exist",
        affectedWorkflows: ["code", "context"],
        localFallback: ["Exact local search remains usable."]
      })
    ]);

    const degraded = await buildAdapterDegradationSummary(registry);
    expect(degraded.degraded[0]).toMatchObject({
      capabilityId: "cap_adapter_missing_tool",
      state: "degraded",
      blocking: false
    });
    expect(degraded.lanes.code).toHaveLength(1);

    await registry.disable("adapter_missing_tool", "operator test");
    const disabled = await buildAdapterDegradationSummary(registry);
    expect(disabled.disabled[0]!.cause).toBe("operator test");

    await registry.enable("adapter_missing_tool");
    const enabled = (await registry.listHealth())[0]!;
    expect(enabled.metadata.enabled).toBe(true);
    expect(enabled.health.blocking).toBe(false);
  });

  it("preserves persisted enablement when registry boots", async () => {
    const repository = new MemoryAdapterRepository();
    const firstRegistry = new AdapterRegistryService(
      [
        new ToolHealthAdapter({
          adapterId: "adapter_persistent_semantic",
          category: "semantic_search",
          name: "Persistent semantic",
          enabled: false,
          affectedWorkflows: ["code", "context"],
          localFallback: ["Exact search remains usable."]
        })
      ],
      repository
    );
    await firstRegistry.enable("adapter_persistent_semantic");

    const secondRegistry = new AdapterRegistryService(
      [
        new ToolHealthAdapter({
          adapterId: "adapter_persistent_semantic",
          category: "semantic_search",
          name: "Persistent semantic",
          enabled: false,
          affectedWorkflows: ["code", "context"],
          localFallback: ["Exact search remains usable."]
        })
      ],
      repository
    );

    const [entry] = await secondRegistry.listHealth();
    expect(entry!.metadata.enabled).toBe(true);
    expect(entry!.health.state).toBe("managed");
  });
});
