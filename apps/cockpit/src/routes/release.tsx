import { useState } from "react";

interface ReleaseCheck {
  checkId: string;
  status: "passed" | "failed";
  artifacts: string[];
  nextAction: string;
}

interface ReleaseValidation {
  pass: boolean;
  evidenceRoot: string;
  evidenceManifest: string;
  redactionStatus: string;
  checks: ReleaseCheck[];
}

const fallbackRelease: ReleaseValidation = {
  pass: false,
  evidenceRoot: "fulcrum-release-evidence",
  evidenceManifest: "fulcrum-release-evidence/release-evidence.json",
  redactionStatus: "not_redacted",
  checks: [
    {
      checkId: "release.api",
      status: "failed",
      artifacts: [],
      nextAction: "Start the Fulcrum server and run release validation."
    }
  ]
};

export function ReleaseEvidenceRoute() {
  const [release, setRelease] = useState<ReleaseValidation>(fallbackRelease);
  const [status, setStatus] = useState<"idle" | "running" | "ready" | "degraded">("idle");

  async function validateRelease() {
    setStatus("running");
    try {
      const response = await fetch("/api/v1/release/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          evidence: "fulcrum-release-evidence",
          localOnly: true
        })
      });
      const payload = (await response.json()) as { data?: ReleaseValidation };
      if (payload.data) {
        setRelease(payload.data);
        setStatus("ready");
        return;
      }
      setRelease(fallbackRelease);
      setStatus("degraded");
    } catch {
      setRelease(fallbackRelease);
      setStatus("degraded");
    }
  }

  return (
    <main>
      <header>
        <h1>Release Evidence</h1>
        <p>
          {status === "degraded" ? "Release API degraded" : release.pass ? "passing" : "blocked"}
        </p>
        <button
          type="button"
          onClick={() => void validateRelease()}
          disabled={status === "running"}
        >
          {status === "running" ? "Validating" : "Validate"}
        </button>
      </header>
      <section aria-label="Release evidence summary">
        <h2>Summary</h2>
        <dl>
          <div>
            <dt>Status</dt>
            <dd>{release.pass ? "passing" : "blocked"}</dd>
          </div>
          <div>
            <dt>Evidence</dt>
            <dd>{release.evidenceManifest}</dd>
          </div>
          <div>
            <dt>Redaction</dt>
            <dd>{release.redactionStatus}</dd>
          </div>
        </dl>
      </section>
      <section aria-label="Release checks">
        <h2>Checks</h2>
        <table>
          <thead>
            <tr>
              <th>Check</th>
              <th>Status</th>
              <th>Artifacts</th>
              <th>Next action</th>
            </tr>
          </thead>
          <tbody>
            {release.checks.map((check) => (
              <tr key={check.checkId}>
                <td>{check.checkId}</td>
                <td>{check.status}</td>
                <td>{check.artifacts.join(", ") || "none"}</td>
                <td>{check.nextAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
