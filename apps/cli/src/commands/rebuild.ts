import path from "node:path";
import {
  FileWorkRepository,
  type JsonStateMigrationResult,
  type JsonStateMigrationService
} from "@fulcrum/core";

export function rebuildJsonMirrorCommand(
  migration: JsonStateMigrationService,
  input: { stateRoot: string; mirrorPath?: string }
): JsonStateMigrationResult {
  const mirrorPath = input.mirrorPath ?? path.join(input.stateRoot, "work-state.json");
  const result = migration.rebuildJsonMirror(new FileWorkRepository(mirrorPath));
  return { ...result, mirrorPath };
}
