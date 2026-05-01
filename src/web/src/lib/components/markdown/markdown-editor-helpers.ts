// Pure helpers for the MarkdownEditor wrapper. Kept side-effect free so that
// jsdom-bound unit tests don't need the CodeMirror runtime.

export interface CodeMirrorChangeEvent {
  detail: { value: string };
}

export function extractMarkdownChange(event: { detail?: { value?: unknown } }): string | null {
  const value = event.detail?.value;
  return typeof value === "string" ? value : null;
}
