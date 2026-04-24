import { useEffect, useMemo, useState } from "react";

interface TraceabilityLink {
  graphLinkId: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relation: string;
  reason: string;
  freshness: string;
  limitation?: string;
}

interface TraceabilityView {
  root: { type: string; id: string };
  links: TraceabilityLink[];
  limitations: Array<{ graphLinkId: string; message: string }>;
  affected: Record<string, string[]>;
}

const emptyTrace: TraceabilityView = {
  root: { type: "task", id: "select" },
  links: [],
  limitations: [],
  affected: {}
};

export function TraceabilityRoute({ trace: initialTrace }: { trace?: TraceabilityView }) {
  const query = useMemo(() => {
    const params = new URLSearchParams((globalThis.location?.hash ?? "").split("?")[1] ?? "");
    return {
      type: params.get("type") ?? "task",
      id: params.get("id") ?? "",
      includeStale: params.get("includeStale") === "true"
    };
  }, []);
  const [trace, setTrace] = useState<TraceabilityView>(initialTrace ?? emptyTrace);
  const [status, setStatus] = useState<"loading" | "ready" | "degraded">(
    initialTrace ? "ready" : "loading"
  );

  useEffect(() => {
    if (initialTrace) return;
    if (!query.id) {
      setStatus("degraded");
      return;
    }
    let active = true;
    const params = new URLSearchParams({
      type: query.type,
      id: query.id,
      includeStale: String(query.includeStale)
    });
    fetch(`/api/v1/graph/trace?${params}`)
      .then((response) => response.json())
      .then((payload: { data?: TraceabilityView }) => {
        if (!active) return;
        if (payload.data) {
          setTrace(payload.data);
          setStatus("ready");
        } else {
          setStatus("degraded");
        }
      })
      .catch(() => {
        if (active) setStatus("degraded");
      });
    return () => {
      active = false;
    };
  }, [initialTrace, query.id, query.includeStale, query.type]);

  return (
    <main>
      <header>
        <p>Traceability</p>
        <h1>
          {trace.root.type}:{trace.root.id}
        </h1>
        <p>{status === "degraded" ? "Traceability API degraded" : `${trace.links.length} links`}</p>
      </header>

      <section aria-label="Affected records">
        {Object.entries(trace.affected).map(([type, ids]) => (
          <article key={type}>
            <h2>{type}</h2>
            <p>{ids.join(", ")}</p>
          </article>
        ))}
      </section>

      <section aria-label="Graph links">
        {trace.links.map((link) => (
          <article key={link.graphLinkId}>
            <h2>{link.relation}</h2>
            <p>
              {link.sourceType}:{link.sourceId} to {link.targetType}:{link.targetId}
            </p>
            <p>{link.reason}</p>
            <p>{link.freshness}</p>
            {link.limitation ? <p>{link.limitation}</p> : null}
          </article>
        ))}
      </section>

      <section aria-label="Limitations">
        {trace.limitations.map((limitation) => (
          <article key={limitation.graphLinkId}>
            <h2>{limitation.graphLinkId}</h2>
            <p>{limitation.message}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
