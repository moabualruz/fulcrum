import { useEffect, useState } from "react";

interface ComplianceRequirement {
  requirementId: string;
  sourceFile: string;
  sourceLine: string | number;
  status: string;
  nextAction: string;
  implementationRefs: string[];
  testRefs: string[];
}

interface ComplianceAudit {
  pass: boolean;
  summary: Record<string, number>;
  requirements: ComplianceRequirement[];
  blockingRequirementIds: string[];
}

const fallbackAudit: ComplianceAudit = {
  pass: false,
  summary: {
    implemented: 0,
    partial: 0,
    missing: 1,
    deferred: 0,
    superseded: 0,
    mockOnly: 0,
    previewOnly: 0,
    documentationOnly: 0
  },
  requirements: [
    {
      requirementId: "COMPLIANCE-API-DEGRADED",
      sourceFile: "local",
      sourceLine: 1,
      status: "missing",
      nextAction: "Start the Fulcrum server and rerun compliance audit.",
      implementationRefs: [],
      testRefs: []
    }
  ],
  blockingRequirementIds: ["COMPLIANCE-API-DEGRADED"]
};

export function ComplianceRoute() {
  const [audit, setAudit] = useState<ComplianceAudit>(fallbackAudit);
  const [status, setStatus] = useState<"loading" | "ready" | "degraded">("loading");

  async function loadAudit() {
    try {
      const response = await fetch("/api/v1/compliance");
      if (!response.ok) {
        setAudit(fallbackAudit);
        setStatus("degraded");
        return;
      }
      const payload = (await response.json()) as { data?: ComplianceAudit };
      if (payload.data) {
        setAudit(payload.data);
        setStatus("ready");
        return;
      }
      setAudit(fallbackAudit);
      setStatus("degraded");
    } catch {
      setAudit(fallbackAudit);
      setStatus("degraded");
    }
  }

  useEffect(() => {
    void loadAudit();
  }, []);

  return (
    <main>
      <header>
        <h1>Compliance</h1>
        <p>{status === "degraded" ? "Compliance API degraded" : "Product/SRS authority"}</p>
      </header>
      <section aria-label="Compliance summary">
        <h2>Summary</h2>
        <p>{audit.pass ? "passing" : `${audit.blockingRequirementIds.length} blocking`}</p>
        <dl>
          {Object.entries(audit.summary).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-label="Compliance requirements">
        <h2>Requirements</h2>
        <table>
          <thead>
            <tr>
              <th>Requirement</th>
              <th>Source</th>
              <th>Status</th>
              <th>Next action</th>
            </tr>
          </thead>
          <tbody>
            {audit.requirements.map((requirement) => (
              <tr key={`${requirement.requirementId}-${requirement.sourceFile}`}>
                <td>{requirement.requirementId}</td>
                <td>
                  {requirement.sourceFile}:{requirement.sourceLine}
                </td>
                <td>{requirement.status}</td>
                <td>{requirement.nextAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
