interface RedactionStatusProps {
  status?: string;
}

const labels: Record<string, string> = {
  not_applicable: "Not applicable",
  not_redacted: "Not redacted",
  redacted: "Redacted",
  needs_review: "Needs review"
};

export function RedactionStatus({ status = "not_applicable" }: RedactionStatusProps) {
  return (
    <span aria-label={`Redaction status: ${labels[status] ?? status}`}>
      {labels[status] ?? status}
    </span>
  );
}
