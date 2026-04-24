import { describe, expect, it } from "vitest";
import {
  AdapterMetadataSchema,
  ApiEndpointSchema,
  ArtifactContractSchema,
  CommonToolResponseSchema,
  McpToolNameSchema,
  PolicyCheckRequestSchema,
  SurfaceResponseSchema
} from "@fulcrum/shared";

describe("shared contract schemas", () => {
  it("validates surface responses and MCP tool responses", () => {
    expect(
      SurfaceResponseSchema.parse({
        schemaVersion: "1.0",
        status: "ok",
        data: { ok: true },
        redactionStatus: "not_applicable"
      }).status
    ).toBe("ok");

    expect(
      CommonToolResponseSchema.parse({
        schemaVersion: "1.0",
        requestId: "req_01",
        status: "ok",
        data: {},
        redactionStatus: "redacted"
      }).requestId
    ).toBe("req_01");
  });

  it("includes required CLI/API/MCP and adapter contract values", () => {
    expect(ApiEndpointSchema.parse("GET /api/v1/artifacts/{artifactId}")).toBe(
      "GET /api/v1/artifacts/{artifactId}"
    );
    expect(McpToolNameSchema.parse("fulcrum_artifact_attach")).toBe("fulcrum_artifact_attach");
    expect(
      AdapterMetadataSchema.parse({
        adapterId: "adapter_plane",
        category: "external_pm",
        name: "Plane",
        enabled: false,
        ownershipBoundary: "Remote work item is external; Fulcrum run state is local.",
        networkRequired: true,
        credentialStatus: "not_configured",
        privacyNotes: "No sync without operator enablement.",
        offlineBehavior: "Local mirrors remain usable.",
        disablementBehavior: "Local history remains intact.",
        importExportStrategy: "Preview writeback before remote mutation.",
        rebuildStrategy: "Rebuild local mirrors from SQLite."
      }).category
    ).toBe("external_pm");
  });

  it("validates artifact and policy request contracts", () => {
    expect(
      ArtifactContractSchema.parse({
        artifactId: "art_01",
        type: "log",
        localRef: "/tmp/run.log",
        summary: "Run log",
        hash: "abc",
        sizeBytes: 3,
        sourceRefs: [{ type: "file", uri: "/tmp/run.log" }],
        linkedRefs: [],
        storageRef: "proj/run/run.log",
        retention: "keep",
        redactionStatus: "needs_review",
        provenance: { capturedBy: "test", capturedAt: "2026-04-24T00:00:00.000Z" },
        schemaVersion: "1.0"
      }).type
    ).toBe("log");

    expect(
      PolicyCheckRequestSchema.parse({
        action: "public_bind",
        subjectType: "server",
        subjectId: "local-api",
        requester: "test"
      }).localOnly
    ).toBe(true);
  });
});
