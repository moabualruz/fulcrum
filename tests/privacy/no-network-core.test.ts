import { describe, expect, it } from "vitest";
import { localOnlyAllows } from "@fulcrum/policy";

describe("local-only network guard", () => {
  it("denies remote actions while local-only is active", () => {
    expect(localOnlyAllows(true, "remote_provider")).toBe(false);
    expect(localOnlyAllows(true, "telemetry")).toBe(false);
    expect(localOnlyAllows(false, "remote_provider")).toBe(true);
  });
});
