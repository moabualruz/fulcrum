export const SEEDED_DOC_TYPES = [
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

const SEEDED_DOC_TYPE_SET = new Set<string>(SEEDED_DOC_TYPES);

export interface TemplatePickerState {
  kind: string;
  body: string;
  lastTemplate: string;
  bodyEdited: boolean;
}

export function buildDocTypeOptions(templates: Record<string, string>): string[] {
  const seeded = SEEDED_DOC_TYPES.filter((kind) =>
    Object.prototype.hasOwnProperty.call(templates, kind),
  );
  const extras = Object.keys(templates)
    .filter((kind) => !SEEDED_DOC_TYPE_SET.has(kind))
    .sort();
  return [...seeded, ...extras];
}

export function createInitialTemplateState(input: {
  formKind: string | null | undefined;
  formBody: string | null | undefined;
  templates: Record<string, string>;
}): TemplatePickerState {
  const kinds = buildDocTypeOptions(input.templates);
  const formKind = input.formKind ?? "";
  const kind = kinds.includes(formKind) ? formKind : (kinds[0] ?? formKind);
  const lastTemplate = input.templates[kind] ?? "";
  const formBody = input.formBody ?? "";
  const body = formBody.length > 0 ? formBody : lastTemplate;

  return {
    kind,
    body,
    lastTemplate,
    bodyEdited: body.length > 0 && body !== lastTemplate,
  };
}

export function applyTemplateSelectionChange(
  state: TemplatePickerState,
  nextKind: string,
  templates: Record<string, string>,
): TemplatePickerState {
  const nextTemplate = templates[nextKind] ?? "";
  const shouldApplyTemplate = !state.bodyEdited || state.body === state.lastTemplate;

  return {
    kind: nextKind,
    body: shouldApplyTemplate ? nextTemplate : state.body,
    lastTemplate: nextTemplate,
    bodyEdited: shouldApplyTemplate ? false : state.bodyEdited,
  };
}

export function markTemplateBodyEdited(
  state: TemplatePickerState,
  nextBody: string,
): TemplatePickerState {
  return {
    ...state,
    body: nextBody,
    bodyEdited: nextBody !== state.lastTemplate,
  };
}
