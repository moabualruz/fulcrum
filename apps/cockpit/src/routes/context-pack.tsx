import { useEffect, useMemo, useState } from "react";

interface ContextItemView {
  contextItemId: string;
  lane: string;
  title: string;
  evidenceType: string;
  sourceRef: { uri: string; label?: string };
  inclusionReason: string;
  freshness: string;
  redactionStatus?: string;
  confidence?: number;
  limitation?: string;
  rank: number;
}

interface ContextPackView {
  pack: {
    contextPackId: string;
    taskId: string;
    status: string;
    budget: number;
    budgetUsed: number;
    generatedAt?: string;
    redactionStatus?: string;
    laneSummaries: Array<{
      lane: string;
      included: number;
      budgetUsed: number;
      budgetLimit: number;
    }>;
    degradedLanes: Array<{ lane: string; cause: string; fallback?: string }>;
    omissions: Array<{ lane: string; reason: string; omittedRef?: { uri: string } }>;
    exportRefs: Array<{ uri: string; label?: string }>;
  };
  items: ContextItemView[];
}

const demoPack: ContextPackView = {
  pack: {
    contextPackId: "ctx_select_a_pack",
    taskId: "task_select_a_task",
    status: "ready",
    budget: 8000,
    budgetUsed: 0,
    laneSummaries: [],
    degradedLanes: [],
    omissions: [],
    exportRefs: []
  },
  items: []
};

export function ContextPackRoute({
  contextPack: initialContextPack
}: {
  contextPack?: ContextPackView;
}) {
  const contextPackId = useMemo(() => {
    const [, id] = (globalThis.location?.hash ?? "").match(/^#\/context-packs\/([^/]+)/) ?? [];
    return id ?? "";
  }, []);
  const [contextPack, setContextPack] = useState<ContextPackView>(initialContextPack ?? demoPack);
  const [status, setStatus] = useState<"loading" | "ready" | "degraded">(
    initialContextPack ? "ready" : "loading"
  );

  useEffect(() => {
    if (initialContextPack) {
      return;
    }
    if (!contextPackId) {
      setStatus("degraded");
      return;
    }
    let active = true;
    fetch(`/api/v1/context-packs/${encodeURIComponent(contextPackId)}`)
      .then((response) => response.json())
      .then((payload: { data?: ContextPackView }) => {
        if (!active) {
          return;
        }
        if (payload.data) {
          setContextPack(payload.data);
          setStatus("ready");
        } else {
          setStatus("degraded");
        }
      })
      .catch(() => {
        if (active) {
          setStatus("degraded");
        }
      });
    return () => {
      active = false;
    };
  }, [contextPackId, initialContextPack]);

  return (
    <main>
      <header>
        <p>Context Pack</p>
        <h1>{contextPack.pack.contextPackId}</h1>
        <p>{status === "degraded" ? "Context API degraded" : contextPack.pack.taskId}</p>
        <dl>
          <div>
            <dt>Status</dt>
            <dd>{contextPack.pack.status}</dd>
          </div>
          <div>
            <dt>Budget</dt>
            <dd>
              {contextPack.pack.budgetUsed}/{contextPack.pack.budget}
            </dd>
          </div>
          <div>
            <dt>Generated</dt>
            <dd>{contextPack.pack.generatedAt ?? "Pending"}</dd>
          </div>
          <div>
            <dt>Redaction</dt>
            <dd>{contextPack.pack.redactionStatus ?? "not_applicable"}</dd>
          </div>
        </dl>
      </header>

      <section aria-label="Lane budgets">
        {contextPack.pack.laneSummaries.map((lane) => (
          <article key={lane.lane}>
            <h2>{lane.lane}</h2>
            <p>
              {lane.included} items / {lane.budgetUsed}/{lane.budgetLimit}
            </p>
          </article>
        ))}
      </section>

      <section aria-label="Context evidence">
        {contextPack.items.map((item) => (
          <article key={item.contextItemId}>
            <h2>{item.title}</h2>
            <p>
              {item.lane} / {item.evidenceType} / rank {item.rank}
            </p>
            <p>{item.inclusionReason}</p>
            <p>{item.sourceRef.uri}</p>
            <p>{item.freshness}</p>
            {item.redactionStatus ? <p>{item.redactionStatus}</p> : null}
            {item.confidence === undefined ? null : <p>{item.confidence}</p>}
            {item.limitation ? <p>{item.limitation}</p> : null}
          </article>
        ))}
      </section>

      <section aria-label="Degraded lanes">
        {contextPack.pack.degradedLanes.map((lane) => (
          <article key={lane.lane}>
            <h2>{lane.lane}</h2>
            <p>{lane.cause}</p>
            {lane.fallback ? <p>{lane.fallback}</p> : null}
          </article>
        ))}
      </section>

      <section aria-label="Omissions">
        {contextPack.pack.omissions.map((omission) => (
          <article key={`${omission.lane}-${omission.reason}`}>
            <h2>{omission.lane}</h2>
            <p>{omission.reason}</p>
            {omission.omittedRef ? <p>{omission.omittedRef.uri}</p> : null}
          </article>
        ))}
      </section>

      <section aria-label="Export references">
        {contextPack.pack.exportRefs.map((ref) => (
          <article key={ref.uri}>
            <h2>{ref.label ?? "Export"}</h2>
            <p>{ref.uri}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
