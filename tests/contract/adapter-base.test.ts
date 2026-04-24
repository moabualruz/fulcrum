import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AdapterRegistryService,
  ToolHealthAdapter,
  createDefaultAdapterHealthModules
} from "@fulcrum/core";

describe("adapter base contract", () => {
  it("reports metadata, health, capabilities, preview, export, and rebuild without secrets", async () => {
    const previousToken = process.env.FULCRUM_REMOTE_PROVIDER_TOKEN;
    process.env.FULCRUM_REMOTE_PROVIDER_TOKEN = "secret-value";
    try {
      const adapter = new ToolHealthAdapter({
        adapterId: "adapter_contract_remote",
        category: "remote_provider",
        name: "Contract remote provider",
        enabled: true,
        credentialEnv: "FULCRUM_REMOTE_PROVIDER_TOKEN",
        networkRequired: true,
        affectedWorkflows: ["run", "policy"],
        policyGated: ["remote_provider"]
      });

      const health = await adapter.healthCheck();
      const capabilities = await adapter.describeCapabilities();
      const preview = await adapter.preview("execute");
      const exported = (await adapter.exportLocalState("all")) as { metadata: { credentialStatus: string } };

      expect(adapter.metadata.credentialStatus).toBe("configured");
      expect(JSON.stringify(exported)).not.toContain("secret-value");
      expect(health.privacyStatus).toBe("local_first");
      expect(capabilities.policyGated).toContain("remote_provider");
      expect(preview.externalVisibility).toBe("remote");
      await expect(adapter.execute("execute", {}, undefined)).rejects.toThrow(
        "Policy decision required"
      );
      expect(await adapter.execute("execute", {}, "pol_approved")).toMatchObject({
        capabilityId: "cap_adapter_contract_remote"
      });
      expect(await adapter.rebuild("all")).toMatchObject({ capabilityId: "cap_adapter_contract_remote" });
    } finally {
      if (previousToken === undefined) {
        delete process.env.FULCRUM_REMOTE_PROVIDER_TOKEN;
      } else {
        process.env.FULCRUM_REMOTE_PROVIDER_TOKEN = previousToken;
      }
    }
  });

  it("loads default optional adapter registry entries with explicit degraded/disabled status", async () => {
    const registry = new AdapterRegistryService(createDefaultAdapterHealthModules());
    const entries = await registry.listHealth();

    expect(entries.map((entry) => entry.metadata.adapterId)).toContain("adapter_copilot_cli");
    expect(entries.find((entry) => entry.metadata.adapterId === "adapter_telemetry_disabled")?.health.state).toBe(
      "disabled"
    );
  });

  it("checks standalone copilot command instead of gh copilot extension", async () => {
    const previousPath = process.env.PATH;
    const binDir = mkdtempSync(path.join(tmpdir(), "fulcrum-copilot-"));
    const ghPath = path.join(binDir, "gh");
    writeFileSync(ghPath, "#!/usr/bin/env sh\nexit 0\n");
    chmodSync(ghPath, 0o755);
    process.env.PATH = binDir;
    try {
      const registry = new AdapterRegistryService(createDefaultAdapterHealthModules());
      await registry.enable("adapter_copilot_cli");

      const entry = await registry.health("adapter_copilot_cli");

      expect(entry.health.cause).toBe("copilot unavailable.");
      expect(entry.metadata.privacyNotes).toContain("gh copilot is intentionally not accepted");
    } finally {
      if (previousPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = previousPath;
      }
      rmSync(binDir, { force: true, recursive: true });
    }
  });
});
