import { describe, expect, test } from "bun:test";

import {
  CROSS_CUTTING_CAPABILITIES,
  capabilitiesForRequirement,
  missingCrossCuttingSurfaces,
  requirementsWithoutCapabilities,
} from "@platform-core/application/platform-operations/capability-coverage.ts";

const EXPECTED_CAPABILITIES = [
  "i18n",
  "theme",
  "telemetry",
  "errors",
  "backup",
  "data-import-export",
  "secrets",
  "audit",
  "migration-downgrade",
  "graceful-shutdown",
  "coverage",
] as const;

const XCT_REQUIREMENTS = Array.from({ length: 12 }, (_, index) => `XCT-${String(index + 1).padStart(2, "0")}`);
const TST_REQUIREMENTS = Array.from({ length: 10 }, (_, index) => `TST-${String(index + 1).padStart(2, "0")}`);

describe("architecture cross-cutting parity matrix", () => {
  test("contains every cross-cutting capability", () => {
    const ids = CROSS_CUTTING_CAPABILITIES.map((capability) => capability.id);

    expect(ids).toEqual([...EXPECTED_CAPABILITIES]);
  });

  test("maps all XCT-01 through XCT-12 requirements", () => {
    expect(requirementsWithoutCapabilities(XCT_REQUIREMENTS)).toEqual([]);

    for (const requirement of XCT_REQUIREMENTS) {
      expect(capabilitiesForRequirement(requirement).length).toBeGreaterThan(0);
    }
  });

  test("maps all TST-01 through TST-10 requirements", () => {
    expect(requirementsWithoutCapabilities(TST_REQUIREMENTS)).toEqual([]);

    for (const requirement of TST_REQUIREMENTS) {
      expect(capabilitiesForRequirement(requirement).length).toBeGreaterThan(0);
    }
  });

  test("reports missing required surfaces by capability", () => {
    expect(
      missingCrossCuttingSurfaces({
        i18n: ["web", "trpc"],
        theme: ["web", "cli", "tui", "trpc"],
      }),
    ).toContainEqual({ capability: "i18n", missing: ["cli", "tui"] });
  });
});
