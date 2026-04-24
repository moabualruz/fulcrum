import { useEffect, useMemo, useState } from "react";
import { LiveActivity } from "../components/live-activity.js";

interface RunDetail {
  runId: string;
  taskId: string;
  projectId: string;
  agentId: string;
  status: string;
  heartbeatAt?: string;
  heartbeatState: string;
  summary?: string;
  artifactIds: string[];
  qualityGateIds: string[];
  policyDecisionIds: string[];
}

export function RunDetailRoute() {
  const runId = useMemo(() => {
    const [, id] = (globalThis.location?.hash ?? "").match(/^#\/runs\/([^/]+)/) ?? [];
    return id ?? "";
  }, []);
  const [run, setRun] = useState<RunDetail | undefined>();
  const [status, setStatus] = useState<"loading" | "ready" | "degraded">("loading");

  useEffect(() => {
    if (!runId) {
      setStatus("degraded");
      return;
    }
    let active = true;
    fetch(`/api/v1/runs/${encodeURIComponent(runId)}`)
      .then((response) => response.json())
      .then((payload: { data?: RunDetail }) => {
        if (!active) {
          return;
        }
        setRun(payload.data);
        setStatus(payload.data ? "ready" : "degraded");
      })
      .catch(() => {
        if (active) {
          setStatus("degraded");
        }
      });
    return () => {
      active = false;
    };
  }, [runId]);

  return (
    <main>
      <h1>Run Detail</h1>
      <p>{status === "degraded" ? "Run API degraded" : run?.status ?? "Loading"}</p>
      {run ? (
        <section aria-label="Run state">
          <dl>
            <dt>Agent</dt>
            <dd>{run.agentId}</dd>
            <dt>Task</dt>
            <dd>{run.taskId}</dd>
            <dt>Heartbeat</dt>
            <dd>
              {run.heartbeatState}
              {run.heartbeatAt ? ` at ${run.heartbeatAt}` : ""}
            </dd>
            <dt>Artifacts</dt>
            <dd>{run.artifactIds.length}</dd>
            <dt>Quality Gates</dt>
            <dd>{run.qualityGateIds.length}</dd>
            <dt>Policy Decisions</dt>
            <dd>{run.policyDecisionIds.length}</dd>
            <dt>Summary</dt>
            <dd>{run.summary ?? "Pending"}</dd>
          </dl>
        </section>
      ) : null}
      {runId ? <LiveActivity runId={runId} /> : null}
    </main>
  );
}
