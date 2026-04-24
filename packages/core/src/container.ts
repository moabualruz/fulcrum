import type { FulcrumAdapter } from "./adapters/adapter.js";
import type { ArtifactRepositoryPort } from "./artifacts/service.js";

export interface CoreContainer {
  repositories: {
    events: unknown;
    artifacts?: ArtifactRepositoryPort;
  };
  adapters: FulcrumAdapter[];
  policy: {
    evaluate: (request: unknown) => unknown;
  };
  redaction: {
    redactText: (input: string) => { text: string; redacted: boolean; matches: string[] };
  };
}

export function createCoreContainer(container: CoreContainer): CoreContainer {
  return container;
}
