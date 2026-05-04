export const DOC_TYPE_LABELS: Record<string, string> = {
  spec: "Spec",
  adr: "ADR",
  wiki: "Wiki",
  runbook: "Runbook",
  meeting: "Meeting",
  postmortem: "Postmortem",
  rfc: "RFC",
  note: "Note",
  scratch: "Scratch",
};

export const DOC_TYPE_DESCRIPTIONS: Record<string, string> = {
  spec: "Requirements and implementation shape.",
  adr: "Architecture decision with context and consequences.",
  wiki: "Durable team knowledge.",
  runbook: "Operational steps and escalation.",
  meeting: "Agenda, notes, and action items.",
  postmortem: "Incident impact, timeline, and follow-ups.",
  rfc: "Proposal, motivation, and alternatives.",
  note: "Lightweight document.",
  scratch: "Temporary working notes.",
};

export interface WebDocTemplate {
  id: string;
  orgId: string;
  projectId: string | null;
  docType: string;
  name: string;
  frontmatterTemplate: Record<string, unknown>;
  bodyTemplate: string;
  isDefault: boolean;
  createdAt: Date;
}

export function resolveDefaultTemplate(
  templates: WebDocTemplate[],
  docType: string,
): WebDocTemplate | undefined {
  const matches = templates.filter((template) => template.docType === docType);
  return (
    matches.find((template) => template.projectId !== null && template.isDefault) ??
    matches.find((template) => template.projectId !== null) ??
    matches.find((template) => template.projectId === null && template.isDefault) ??
    matches[0]
  );
}

export function templateRowsToBodyMap(
  templates: WebDocTemplate[],
): Record<string, string> {
  const docTypes = [...new Set(templates.map((template) => template.docType))];
  return Object.fromEntries(
    docTypes.map((docType) => [
      docType,
      resolveDefaultTemplate(templates, docType)?.bodyTemplate ?? "",
    ]),
  );
}

export function groupTemplatesByDocType(
  templates: WebDocTemplate[],
): Record<string, WebDocTemplate[]> {
  return templates.reduce<Record<string, WebDocTemplate[]>>((groups, template) => {
    groups[template.docType] ??= [];
    groups[template.docType]!.push(template);
    groups[template.docType]!.sort(compareTemplates);
    return groups;
  }, {});
}

function compareTemplates(a: WebDocTemplate, b: WebDocTemplate): number {
  const projectRank = Number(b.projectId !== null) - Number(a.projectId !== null);
  if (projectRank !== 0) return projectRank;
  const defaultRank = Number(b.isDefault) - Number(a.isDefault);
  if (defaultRank !== 0) return defaultRank;
  return a.name.localeCompare(b.name);
}
