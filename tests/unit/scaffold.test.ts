import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "@fulcrum/shared";
import { buildSetupDoctorReport } from "@fulcrum/core";

describe("core exports", () => {
  it("exposes shared schema version and real setup doctor data", () => {
    expect(SCHEMA_VERSION).toBe("1.0");
    expect(buildSetupDoctorReport({ noNetwork: true }).capabilities).toContainEqual(
      expect.objectContaining({ capabilityId: "cap_event_log" })
    );
  });
});
