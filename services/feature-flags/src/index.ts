export const serviceExtractionReadiness = {
  service: "feature-flags",
  publicRoots: ["src/domain", "src/application", "src/interface"],
  privateRoots: ["src/infrastructure"],
  providerBoundary: "Application services and interface adapters are public. Infrastructure stays private.",
} as const;

export * from "./application/index.ts";
export * from "./domain/feature-flag.ts";
export * from "./interface/feature-flags.ts";
