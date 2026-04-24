const labels: Record<string, string> = {
  not_applicable: "Redaction: not applicable",
  not_redacted: "Redaction: not redacted",
  redacted: "Redaction: redacted",
  needs_review: "Redaction: needs review"
};

export function formatRedactionStatus(status: string | undefined): string {
  return labels[status ?? "not_applicable"] ?? `Redaction: ${status}`;
}
