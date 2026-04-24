import type { CodeEvidence } from "@fulcrum/shared";

export interface CodeEvidenceListProps {
  evidence: CodeEvidence[];
  emptyLabel?: string;
}

export function CodeEvidenceList({
  evidence,
  emptyLabel = "No code evidence"
}: CodeEvidenceListProps) {
  if (evidence.length === 0) {
    return <p>{emptyLabel}</p>;
  }

  return (
    <section aria-label="Code evidence">
      <h2>Code Evidence</h2>
      <ul>
        {evidence.map((item) => (
          <li key={item.evidenceId}>
            <strong>{item.filePath}</strong>
            {item.lineStart ? <span>:{item.lineStart}</span> : null}
            <span> - {item.evidenceType}</span>
            <p>{item.reason}</p>
            <small>
              {item.sourceTool} · {item.freshness} · ignore {item.ignoredPathStatus}
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
}
