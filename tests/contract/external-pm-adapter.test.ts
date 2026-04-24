import { describe, expect, it } from "vitest";
import { SimulatedPlaneAdapter } from "@fulcrum/plane";

describe("external PM adapter contract", () => {
  it("reports Plane metadata, health, capabilities, and writeback preview policy shape", async () => {
    const adapter = new SimulatedPlaneAdapter([
      { externalId: "PLN-1", title: "Mirror work", status: "todo" }
    ]);

    const health = await adapter.healthCheck();
    const capabilities = await adapter.describeCapabilities();
    const preview = await adapter.previewWriteback({
      externalId: "PLN-1",
      comment: "Ready for review",
      status: "done"
    });

    expect(adapter.metadata.category).toBe("external_pm");
    expect(adapter.metadata.networkRequired).toBe(true);
    expect(health.state).toBe("managed");
    expect(capabilities.policyGated).toContain("external_writeback");
    expect(preview.externalVisibility).toBe("remote");
    expect(preview.policyRequirements).toContain("external_writeback");
    expect(preview.dataSharedExternally).toContain("Ready for review");
  });
});
