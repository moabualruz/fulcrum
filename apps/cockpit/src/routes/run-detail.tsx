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
  const [qualityStatus, setQualityStatus] = useState<"loading" | "ready" | "degraded">(
    "loading"
  );

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
          fetch(`/api/v1/quality/gates?projectId=${projectId}`).then((response) =>
            response.json()
          ),
          fetch(`/api/v1/quality/results?projectId=${projectId}&runId=${encodedRunId}`).then(
            (response) => response.json()
          )
        ])
          .then(
            ([
              gatesPayload,
              resultsPayload
            ]: [
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
