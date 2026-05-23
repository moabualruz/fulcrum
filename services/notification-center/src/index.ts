export const serviceExtractionReadiness = {
  service: "notification-center",
  publicRoots: ["src/domain", "src/application", "src/interface"],
  privateRoots: ["src/infrastructure"],
  providerBoundary: "Application services and interface adapters are public. Infrastructure stays private.",
} as const;
