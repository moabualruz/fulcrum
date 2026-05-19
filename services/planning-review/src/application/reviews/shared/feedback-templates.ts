export interface PlanDenyFeedbackOptions {
  planFilePath?: string;
}

export type ReviewFeedbackTemplateKind =
  | "missing-criteria"
  | "stale-context"
  | "prototype-mismatch"
  | "test-gap"
  | "code-risk";

export type ReviewFeedbackTemplateScope = "workspace" | "planning" | "uat" | "code-review";

export interface ReviewFeedbackTemplateField {
  name: string;
  label: string;
  required?: boolean;
}

export interface ReviewFeedbackTemplate {
  id: string;
  kind: ReviewFeedbackTemplateKind;
  label: string;
  scope: ReviewFeedbackTemplateScope;
  fields: ReviewFeedbackTemplateField[];
  bodyTemplate: string;
}

export interface RenderReviewFeedbackTemplateInput {
  templateId: string;
  values: Record<string, string>;
  editableText?: string;
  sourceRef?: {
    kind: "plan-section" | "diff-file" | "prototype" | "annotation";
    target: string;
    range?: string;
  };
  customTemplates?: ReviewFeedbackTemplate[];
}

export interface RenderedReviewFeedbackTemplate {
  templateId: string;
  kind: ReviewFeedbackTemplateKind;
  scope: ReviewFeedbackTemplateScope;
  text: string;
  fields: Record<string, string>;
  sourceRef: RenderReviewFeedbackTemplateInput["sourceRef"] | null;
}

export interface CreateCustomReviewFeedbackTemplateInput {
  id: string;
  label: string;
  scope: ReviewFeedbackTemplateScope;
  bodyTemplate: string;
  fields?: ReviewFeedbackTemplateField[];
  kind?: ReviewFeedbackTemplateKind;
}

export const BUILT_IN_REVIEW_FEEDBACK_TEMPLATES: readonly ReviewFeedbackTemplate[] = [
  {
    id: "missing-criteria",
    kind: "missing-criteria",
    label: "Missing acceptance criteria",
    scope: "planning",
    fields: [
      { name: "section", label: "Plan section", required: true },
      { name: "gap", label: "Missing signal", required: true },
      { name: "requestedFix", label: "Requested fix", required: true },
    ],
    bodyTemplate: "Plan section {section} is missing acceptance criteria for {gap}. Add {requestedFix}.",
  },
  {
    id: "stale-context",
    kind: "stale-context",
    label: "Stale context",
    scope: "planning",
    fields: [
      { name: "source", label: "Stale source", required: true },
      { name: "current", label: "Current source", required: true },
    ],
    bodyTemplate: "{source} no longer matches current implementation. Reconcile it with {current}.",
  },
  {
    id: "prototype-mismatch",
    kind: "prototype-mismatch",
    label: "Prototype mismatch",
    scope: "uat",
    fields: [
      { name: "surface", label: "Surface", required: true },
      { name: "difference", label: "Difference", required: true },
    ],
    bodyTemplate: "{surface} diverges from the prototype: {difference}. Update implementation or prototype before approval.",
  },
  {
    id: "test-gap",
    kind: "test-gap",
    label: "Test gap",
    scope: "code-review",
    fields: [
      { name: "behavior", label: "Behavior", required: true },
      { name: "coverage", label: "Expected coverage", required: true },
    ],
    bodyTemplate: "{behavior} lacks test coverage. Add {coverage}.",
  },
  {
    id: "code-risk",
    kind: "code-risk",
    label: "Code risk",
    scope: "code-review",
    fields: [
      { name: "target", label: "File or symbol", required: true },
      { name: "risk", label: "Risk", required: true },
      { name: "mitigation", label: "Mitigation", required: true },
    ],
    bodyTemplate: "{target} introduces {risk} risk. Mitigation required: {mitigation}.",
  },
] as const;

export const planDenyFeedback = (
  feedback: string,
  toolName = "ExitPlanMode",
  options?: PlanDenyFeedbackOptions,
): string => {
  const planFileRule = options?.planFilePath
    ? `- Your plan is saved at: ${options.planFilePath}\n  You can edit this file to make targeted changes, then pass its path to ${toolName}.\n`
    : "";

  return `YOUR PLAN WAS NOT APPROVED.\n\nYou MUST revise the plan to address ALL of the feedback below before calling ${toolName} again.\n\nRules:\n${planFileRule}- Do not resubmit the same plan unchanged.\n- Do NOT change the plan title (first # heading) unless the user explicitly asks you to.\n\n${feedback || "Plan changes requested"}`;
};

function allReviewFeedbackTemplates(customTemplates: readonly ReviewFeedbackTemplate[] = []): ReviewFeedbackTemplate[] {
  return [...BUILT_IN_REVIEW_FEEDBACK_TEMPLATES, ...customTemplates];
}

function findReviewFeedbackTemplate(
  templateId: string,
  customTemplates: readonly ReviewFeedbackTemplate[] = [],
): ReviewFeedbackTemplate {
  const template = allReviewFeedbackTemplates(customTemplates).find((candidate) => candidate.id === templateId);
  if (!template) throw new Error(`Unknown review feedback template: ${templateId}`);
  return template;
}

export function listReviewFeedbackTemplates(input?: {
  scope?: ReviewFeedbackTemplateScope;
  customTemplates?: ReviewFeedbackTemplate[];
}): ReviewFeedbackTemplate[] {
  const templates = allReviewFeedbackTemplates(input?.customTemplates);
  if (!input?.scope) return templates;
  return templates.filter((template) => template.scope === "workspace" || template.scope === input.scope);
}

export function createCustomReviewFeedbackTemplate(
  input: CreateCustomReviewFeedbackTemplateInput,
): ReviewFeedbackTemplate {
  const id = input.id.trim();
  const label = input.label.trim();
  const bodyTemplate = input.bodyTemplate.trim();
  if (!id) throw new Error("Custom review feedback template id is required");
  if (!label) throw new Error("Custom review feedback template label is required");
  if (!bodyTemplate) throw new Error("Custom review feedback template body is required");

  return {
    id,
    kind: input.kind ?? "code-risk",
    label,
    scope: input.scope,
    fields: input.fields ?? [],
    bodyTemplate,
  };
}

export function renderReviewFeedbackTemplate(
  input: RenderReviewFeedbackTemplateInput,
): RenderedReviewFeedbackTemplate {
  const template = findReviewFeedbackTemplate(input.templateId, input.customTemplates);
  const fields: Record<string, string> = {};
  for (const field of template.fields) {
    const value = input.values[field.name]?.trim() ?? "";
    fields[field.name] = value;
    if (field.required && value.length === 0) {
      throw new Error(`Missing required review feedback template field: ${field.name}`);
    }
  }

  let text = input.editableText?.trim();
  if (!text) {
    text = template.bodyTemplate;
    for (const [name, value] of Object.entries(fields)) {
      text = text.replaceAll(`{${name}}`, value);
    }
  }

  if (input.sourceRef) {
    const range = input.sourceRef.range ? `:${input.sourceRef.range}` : "";
    text = `${text}\n\nSource: ${input.sourceRef.kind} ${input.sourceRef.target}${range}`;
  }

  return {
    templateId: template.id,
    kind: template.kind,
    scope: template.scope,
    text,
    fields,
    sourceRef: input.sourceRef ?? null,
  };
}
