import { describe, expect, it } from "vitest";
import { createObservabilityAdapters, ObservabilityAdapter } from "@fulcrum/core";

describe("observability adapters disabled by default", () => {
  it("keeps OpenTelemetry, Langfuse, and Helicone-style exporters disabled until opt-in", async () => {
    const adapters = createObservabilityAdapters();
    const health = await Promise.all(adapters.map((adapter) => adapter.healthCheck()));

    expect(adapters.map((adapter) => adapter.metadata.name)).toEqual([
      "OpenTelemetry",
      "Langfuse",
      "Helicone-style"
    ]);
    expect(health.every((record) => record.state === "disabled")).toBe(true);
    expect(health.every((record) => record.privacyStatus === "local_first")).toBe(true);
    expect(adapters.every((adapter) => adapter.metadata.enabled === false)).toBe(true);
  });

  it("blocks enabled remote export in local-only mode and reports redaction/export status", async () => {
    const adapter = new ObservabilityAdapter({
      kind: "opentelemetry",
      enabled: true,
      endpoint: "https://otel.example.invalid",
      credentialConfigured: true,
      redactionEnabled: true,
      localOnly: true
    });

    const preview = await adapter.preview("export", { events: [{ secret: "token" }] });
    const result = await adapter.execute("export", {
      events: [{ message: "task completed" }],
      localOnly: true
    });
    const health = await adapter.healthCheck({ events: [], localOnly: true });

    expect(preview.policyRequirements).toEqual(["telemetry", "remote_observability"]);
    expect(preview.redactionStatus).toBe("redacted");
    expect(result.exported).toBe(false);
    expect(result.blockedReason).toContain("Local-only");
    expect(result.redactionStatus).toBe("redacted");
    expect(health.state).toBe("blocked");
    expect(health.blocking).toBe(true);
  });

  it("allows redacted local export path without sharing data externally", async () => {
    const adapter = new ObservabilityAdapter({
      kind: "langfuse",
      enabled: true,
      exportPath: "/tmp/fulcrum-observability.jsonl",
      redactionEnabled: true
    });

    const preview = await adapter.preview("export", { events: [{ prompt: "redacted" }] });
    const result = await adapter.execute("export", { events: [{ prompt: "redacted" }] });

    expect(preview.externalVisibility).toBe("none");
    expect(preview.dataSharedExternally).toEqual([]);
    expect(result).toMatchObject({
      exported: true,
      destination: "local_file",
      exportPath: "/tmp/fulcrum-observability.jsonl",
      redactionStatus: "redacted",
      eventCount: 1
    });
  });
});
