import type { CodeEvidenceService } from "@fulcrum/core";

export function codeSearchCommand(
  code: CodeEvidenceService,
  input: { projectId: string; query: string; limit?: number; semantic?: boolean }
) {
  return code.search({
    projectId: input.projectId,
    query: input.query,
    limit: input.limit,
    includeSemantic: input.semantic
  });
}

export function codeCleanupStaleCommand(code: CodeEvidenceService, projectId: string) {
  return code.cleanupStale(projectId);
}

export function codeStructuralCommand(
  code: CodeEvidenceService,
  input: { projectId: string; pattern: string; limit?: number }
) {
  return code.structural(input);
}
