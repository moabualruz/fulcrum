import { describe, expect, it } from "vitest";
import { redactText } from "@fulcrum/policy";
import { formatRedactionStatus } from "../../apps/cli/src/output/redaction.js";

describe("secret redaction display", () => {
  it("masks known secret patterns and reports redacted status", () => {
    const result = redactText(
      "token=super-secret-value Authorization: Bearer abcdefghijklmnop ghp_123456789012345678901234"
    );

    expect(result.redacted).toBe(true);
    expect(result.text).not.toContain("super-secret-value");
    expect(result.text).not.toContain("abcdefghijklmnop");
    expect(result.text).not.toContain("ghp_123456789012345678901234");
    expect(formatRedactionStatus("redacted")).toBe("Redaction: redacted");
  });
});
