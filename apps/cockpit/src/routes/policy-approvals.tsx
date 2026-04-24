import { useEffect, useState } from "react";
import { RedactionStatus } from "../components/redaction-status.js";

interface PolicyDecision {
  policyDecisionId: string;
  action: string;
  subjectType?: string;
  subjectId?: string;
  requester?: string;
  status: string;
  reason: string;
  bypassScope?: string;
  previewRef?: string;
  redactionStatus: string;
}

export function PolicyApprovalsRoute() {
  const [decisions, setDecisions] = useState<PolicyDecision[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    fetch("/api/v1/queues/policy")
      .then((response) => response.json())
      .then((payload: { data?: PolicyDecision[] }) => {
        if (!active) {
          return;
        }
        setDecisions(payload.data ?? []);
        setStatus("ready");
      })
      .catch(() => {
        if (active) {
          setStatus("error");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function approve(decisionId: string) {
    const response = await fetch(`/api/v1/policy/${decisionId}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approvedBy: "operator" })
    });
    if (response.ok) {
      setDecisions((current) =>
        current.map((decision) =>
          decision.policyDecisionId === decisionId ? { ...decision, status: "approved" } : decision
        )
      );
    }
  }

  function deny(decisionId: string) {
    setDecisions((current) =>
      current.map((decision) =>
        decision.policyDecisionId === decisionId ? { ...decision, status: "denied" } : decision
      )
    );
  }

  return (
    <main>
      <header>
        <h1>Policy Approvals</h1>
        <p>{status === "error" ? "Policy queue unavailable" : "Approval queue"}</p>
      </header>
      <section aria-label="Policy approval queue">
        {decisions.length === 0 && status === "ready" ? <p>No pending approvals</p> : null}
        <div role="list">
          {decisions.map((decision) => (
            <article role="listitem" tabIndex={0} key={decision.policyDecisionId}>
              <h2>{decision.action}</h2>
              <dl>
                <dt>Status</dt>
                <dd>{decision.status}</dd>
                <dt>Requester</dt>
                <dd>{decision.requester ?? "unknown"}</dd>
                <dt>Subject</dt>
                <dd>
                  {decision.subjectType ?? "unknown"} {decision.subjectId ?? "unknown"}
                </dd>
                <dt>Reason</dt>
                <dd>{decision.reason}</dd>
                <dt>Scope</dt>
                <dd>{decision.bypassScope ?? "single action"}</dd>
                <dt>Preview</dt>
                <dd>{decision.previewRef ?? "inline"}</dd>
                <dt>Redaction</dt>
                <dd>
                  <RedactionStatus status={decision.redactionStatus} />
                </dd>
              </dl>
              {decision.status === "approval_required" ? (
                <div>
                  <button type="button" onClick={() => void approve(decision.policyDecisionId)}>
                    Approve
                  </button>
                  <button type="button" onClick={() => deny(decision.policyDecisionId)}>
                    Deny
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
