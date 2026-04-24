import { useEffect, useState } from "react";

interface MemoryEntry {
  memoryId: string;
  title: string;
  status: string;
  freshness: string;
  backend: string;
  redactionStatus: string;
  sourceRefs: Array<{ uri: string; label?: string }>;
}

export function MemoryRoute() {
  const params = new URLSearchParams(globalThis.location?.search ?? "");
  const projectId = params.get("projectId") ?? "";
  const [entries, setEntries] = useState<MemoryEntry[]>([]);

  useEffect(() => {
    if (!projectId) {
      return;
    }
    fetch(`/api/v1/memory/export?projectId=${encodeURIComponent(projectId)}`)
      .then((response) => response.json())
      .then((payload: { data?: { entries?: MemoryEntry[] } }) =>
        setEntries(payload.data?.entries ?? [])
      )
      .catch(() => setEntries([]));
  }, [projectId]);

  return (
    <main>
      <header>
        <h1>Memory</h1>
        <p>Drafts and source provenance</p>
      </header>
      <section aria-label="Memory entries">
        {entries.map((entry) => (
          <article key={entry.memoryId} tabIndex={0}>
            <h2>{entry.title}</h2>
            <dl>
              <dt>Status</dt>
              <dd>{entry.status}</dd>
              <dt>Freshness</dt>
              <dd>{entry.freshness}</dd>
              <dt>Backend</dt>
              <dd>{entry.backend}</dd>
              <dt>Redaction</dt>
              <dd>{entry.redactionStatus}</dd>
              <dt>Sources</dt>
              <dd>{entry.sourceRefs.map((ref) => ref.label ?? ref.uri).join(", ")}</dd>
            </dl>
          </article>
        ))}
      </section>
    </main>
  );
}
