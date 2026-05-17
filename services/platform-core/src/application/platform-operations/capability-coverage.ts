export type CrossCuttingCapabilityId =
  | "i18n"
  | "theme"
  | "telemetry"
  | "errors"
  | "backup"
  | "data-import-export"
  | "secrets"
  | "audit"
  | "migration-downgrade"
  | "graceful-shutdown"
  | "coverage";

export type CrossCuttingSurface = "web" | "cli" | "tui" | "trpc" | "rest";

export interface CrossCuttingCapability {
  id: CrossCuttingCapabilityId;
  requirements: readonly string[];
  requiredSurfaces: readonly CrossCuttingSurface[];
}

export const CROSS_CUTTING_CAPABILITIES = [
  capability("i18n", ["XCT-01", "XCT-02"], ["web", "cli", "tui", "trpc"]),
  capability("theme", ["XCT-03"], ["web", "cli", "tui", "trpc"]),
  capability("telemetry", ["XCT-04"], ["web", "cli", "tui", "trpc"]),
  capability("errors", ["XCT-05"], ["web", "cli", "tui", "trpc"]),
  capability("backup", ["XCT-06"], ["web", "cli", "tui", "trpc", "rest"]),
  capability("data-import-export", ["XCT-07"], ["web", "cli", "tui", "trpc", "rest"]),
  capability("secrets", ["XCT-08"], ["web", "cli", "tui", "trpc"]),
  capability("audit", ["XCT-09"], ["web", "cli", "tui", "trpc", "rest"]),
  capability("migration-downgrade", ["XCT-10"], ["cli", "tui", "trpc"]),
  capability("graceful-shutdown", ["XCT-11"], ["cli", "tui", "trpc"]),
  capability("coverage", ["XCT-12", "TST-01", "TST-02", "TST-03", "TST-04", "TST-05", "TST-06", "TST-07", "TST-08", "TST-09", "TST-10"], [
    "web",
    "cli",
    "tui",
    "trpc",
  ]),
] as const satisfies readonly CrossCuttingCapability[];

function capability(
  id: CrossCuttingCapabilityId,
  requirements: readonly string[],
  requiredSurfaces: readonly CrossCuttingSurface[],
): CrossCuttingCapability {
  return { id, requirements, requiredSurfaces };
}

export function capabilitiesForRequirement(requirement: string): CrossCuttingCapability[] {
  return CROSS_CUTTING_CAPABILITIES.filter((capability) => capability.requirements.includes(requirement));
}

export function requirementsWithoutCapabilities(requirements: readonly string[]): string[] {
  return requirements.filter((requirement) => capabilitiesForRequirement(requirement).length === 0);
}

export function missingCrossCuttingSurfaces(
  implemented: Partial<Record<CrossCuttingCapabilityId, readonly CrossCuttingSurface[]>>,
): Array<{ capability: CrossCuttingCapabilityId; missing: CrossCuttingSurface[] }> {
  return CROSS_CUTTING_CAPABILITIES.map((capability) => {
    const available = new Set(implemented[capability.id] ?? []);
    return {
      capability: capability.id,
      missing: capability.requiredSurfaces.filter((surface) => !available.has(surface)),
    };
  }).filter((result) => result.missing.length > 0);
}
