export interface StateChangePreview {
  action: string;
  subjectType: string;
  subjectId: string;
  effects: string[];
  recordsAffected: string[];
  externalVisibility: "none" | "loopback" | "remote" | "public";
  policyRequired: boolean;
  redactionStatus: "not_applicable" | "not_redacted" | "redacted" | "needs_review";
}

export function previewStateChange(
  input: Omit<StateChangePreview, "policyRequired">
): StateChangePreview {
  const dangerous =
    input.externalVisibility !== "none" ||
    input.effects.some((effect) => /delete|purge|reset|public|remote/i.test(effect));
  return { ...input, policyRequired: dangerous };
}
