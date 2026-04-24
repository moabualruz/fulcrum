import { useEffect, useState } from "react";

interface ExternalMirror {
  mirrorId: string;
  externalSystem: string;
  externalId: string;
  sourceTitle: string;
  sourceStatus?: string;
  syncStatus: string;
  nextAction?: string;
}

export function ExternalMirrorPanel({ projectId }: { projectId?: string }) {
  const [mirrors, setMirrors] = useState<ExternalMirror[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "degraded">("loading");
  const [preview, setPreview] = useState<string>("");

  useEffect(() => {
    let active = true;
    const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
    fetch(`/api/v1/external-pm/mirrors${query}`)
      .then((response) => response.json())
      .then((payload: { data?: ExternalMirror[] }) => {
        if (!active) {
          return;
        }
        setMirrors(payload.data ?? []);
        setStatus("ready");
      })
      .catch(() => {
        if (active) {
          setStatus("degraded");
        }
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  return (
    <section aria-label="External project management mirrors">
      <h2>External Mirrors</h2>
      <p>{status === "degraded" ? "External PM adapter degraded" : `${mirrors.length} mirrors`}</p>
      <ul>
        {mirrors.map((mirror) => (
          <li key={mirror.mirrorId}>
            <strong>{mirror.sourceTitle}</strong>
            <span> {mirror.externalSystem}</span>
            <span> {mirror.externalId}</span>
            <span> {mirror.syncStatus}</span>
            <span> {mirror.nextAction}</span>
            <button
              type="button"
              onClick={() => {
                fetch("/api/v1/external-pm/writeback-preview", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    mirrorId: mirror.mirrorId,
                    externalId: mirror.externalId,
                    comment: `Fulcrum preview for ${mirror.sourceTitle}`
                  })
                })
                  .then((response) => response.json())
                  .then((payload: { data?: { policyDecision?: { status?: string } } }) => {
                    setPreview(payload.data?.policyDecision?.status ?? "preview_unavailable");
                  })
                  .catch(() => setPreview("preview_unavailable"));
              }}
            >
              Preview writeback
            </button>
          </li>
        ))}
      </ul>
      {preview ? <p aria-live="polite">Writeback {preview}</p> : null}
    </section>
  );
}
