import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "@fulcrum/shared";
import { doctorScaffold } from "@fulcrum/core";

describe("scaffold", () => {
  it("exposes shared schema version and doctor data", () => {
    expect(SCHEMA_VERSION).toBe("1.0");
    expect(doctorScaffold()).toContainEqual(
      expect.objectContaining({ capabilityId: "cap_local_state" })
    );
  });
});
