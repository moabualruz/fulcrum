import { describe, expect, it } from "vitest";
import {
  AdapterRegistryService,
  ToolHealthAdapter,
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

describe("adapter replacement recovery", () => {
  it("replaces implementation while preserving Fulcrum-owned local history categories", async () => {
    const registry = new AdapterRegistryService(
      [
        new ToolHealthAdapter({
          adapterId: "adapter_replaceable_memory",
          category: "memory",
          name: "Original memory",
          enabled: true,
          affectedWorkflows: ["memory", "context"]
        })
      ],
      new MemoryAdapterRepository()
    );

    const result = await registry.replace(
      "adapter_replaceable_memory",
      new ToolHealthAdapter({
        adapterId: "adapter_new_memory",
        category: "memory",
        name: "Replacement memory",
        enabled: false,
        affectedWorkflows: ["memory", "context"]
      })
    );

    expect(result.previous.name).toBe("Original memory");
    expect(result.replacement).toMatchObject({
      adapterId: "adapter_replaceable_memory",
      name: "Replacement memory",
      enabled: true
    });
    expect(result.preservedLocalHistory).toEqual(
      expect.arrayContaining(["projects", "tasks", "runs", "artifacts", "provenance"])
    );
  });
});
