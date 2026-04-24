import { describe, expect, it } from "vitest";
import { ToolHealthAdapter } from "@fulcrum/core";

describe("adapter credential privacy", () => {
  it("returns credential status only, never credential values", async () => {
    const previousToken = process.env.FULCRUM_TEST_ADAPTER_TOKEN;
    process.env.FULCRUM_TEST_ADAPTER_TOKEN = "super-secret-token";
    try {
      const adapter = new ToolHealthAdapter({
        adapterId: "adapter_private_credentials",
        category: "remote_provider",
        name: "Private credentials",
        enabled: true,
        networkRequired: true,
        credentialEnv: "FULCRUM_TEST_ADAPTER_TOKEN",
        affectedWorkflows: ["policy"]
      });

      const health = await adapter.healthCheck();
      const exported = await adapter.exportLocalState("privacy");
      const serialized = JSON.stringify({ metadata: adapter.metadata, health, exported });

      expect(adapter.metadata.credentialStatus).toBe("configured");
      expect(serialized).toContain("configured");
      expect(serialized).not.toContain("super-secret-token");
      expect(serialized).not.toContain("FULCRUM_TEST_ADAPTER_TOKEN");

      delete process.env.FULCRUM_TEST_ADAPTER_TOKEN;
      await adapter.healthCheck();
      expect(adapter.metadata.credentialStatus).toBe("not_configured");
    } finally {
      if (previousToken === undefined) {
        delete process.env.FULCRUM_TEST_ADAPTER_TOKEN;
      } else {
        process.env.FULCRUM_TEST_ADAPTER_TOKEN = previousToken;
      }
    }
  });
});
