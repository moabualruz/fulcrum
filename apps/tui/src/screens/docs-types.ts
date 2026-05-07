export const TUI_DOC_TYPES = [
  "spec",
  "adr",
  "wiki",
  "runbook",
  "meeting",
  "postmortem",
  "rfc",
  "note",
  "scratch",
] as const;

export type TuiDocType = (typeof TUI_DOC_TYPES)[number];
export type TuiDocScope = "project" | "global";
