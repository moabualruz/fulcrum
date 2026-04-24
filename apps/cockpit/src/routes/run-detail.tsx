import { useEffect, useMemo, useState } from "react";
import { LiveActivity } from "../components/live-activity.js";
import { QualityGates } from "../components/quality-gates.js";
import type { QualityGateDefinition, QualityGateResult } from "@fulcrum/shared";

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
  const [gates, setGates] = useState<QualityGateDefinition[]>([]);
  const [gateResults, setGateResults] = useState<QualityGateResult[]>([]);
  const [qualityStatus, setQualityStatus] = useState<"loading" | "ready" | "degraded">("loading");
  const [runActionStatus, setRunActionStatus] = useState("");

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
        if (!payload.data) {
          setQualityStatus("degraded");
          return;
        }
        const projectId = encodeURIComponent(payload.data.projectId);
        const encodedRunId = encodeURIComponent(payload.data.runId);
        return Promise.all([
          fetch(`/api/v1/quality/gates?projectId=${projectId}`).then((response) => response.json()),
          fetch(`/api/v1/quality/results?projectId=${projectId}&runId=${encodedRunId}`).then(
            (response) => response.json()
          )
        ])
          .then(
            ([gatesPayload, resultsPayload]: [
              { data?: QualityGateDefinition[] },
              { data?: QualityGateResult[] }
            ]) => {
              if (!active) {
                return;
              }
              setGates(gatesPayload.data ?? []);
              setGateResults(resultsPayload.data ?? []);
              setQualityStatus("ready");
            }
          )
          .catch(() => {
            if (active) {
              setQualityStatus("degraded");
            }
          });
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

  async function startRun() {
    if (!run?.taskId || !run?.agentId) {
      setRunActionStatus("Run start requires task and agent");
      return;
    }
    const response = await fetch("/api/v1/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId: run.taskId, agentId: run.agentId })
    });
    setRunActionStatus(response.ok ? "Run start requested" : "Run start failed");
  }

  async function cancelRun() {
    if (!runId) {
      return;
    }
    const response = await fetch(`/api/v1/runs/${encodeURIComponent(runId)}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "operator_cancelled_from_cockpit" })
    });
    if (response.ok) {
      setRun((current) => (current ? { ...current, status: "cancel_requested" } : current));
    }
    setRunActionStatus(response.ok ? "Run cancel requested" : "Run cancel failed");
  }

  return (
    <main>
      <h1>Run Detail</h1>
      <p>{status === "degraded" ? "Run API degraded" : (run?.status ?? "Loading")}</p>
      <section aria-label="Run controls">
        <h2>Run Controls</h2>
        <button type="button" onClick={() => void startRun()} disabled={!run}>
          Start run
        </button>
        <button type="button" onClick={() => void cancelRun()} disabled={!runId}>
          Cancel run
        </button>
        <p aria-live="polite">{runActionStatus}</p>
      </section>
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
      {run ? (
        <>
          <QualityGates gates={gates} results={gateResults} />
          {qualityStatus === "degraded" ? <p>Quality gate API degraded</p> : null}
        </>
      ) : null}
      {runId ? <LiveActivity runId={runId} /> : null}
    </main>
  );
}
