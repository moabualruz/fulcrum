export const MEMORY_KINDS = [
  "note",
  "decision",
  "blocker",
  "file_ref",
  "section_anchor",
  "link",
  "fact",
] as const;

export const MEMORY_IMPORTANCE = ["low", "medium", "high"] as const;
export const MEMORY_SOURCES = ["heuristic", "llm", "manual"] as const;
export const MEMORY_LINK_TARGET_KINDS = [
  "task",
  "doc",
  "agent_run",
  "artifact",
] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number];
export type MemoryImportance = (typeof MEMORY_IMPORTANCE)[number];
export type MemorySource = (typeof MEMORY_SOURCES)[number];
export type MemoryLinkTargetKind = (typeof MEMORY_LINK_TARGET_KINDS)[number];
