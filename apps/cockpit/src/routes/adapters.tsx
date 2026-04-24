import { useEffect, useState } from "react";

interface AdapterEntry {
  metadata: {
    adapterId: string;
    category: string;
    name: string;
    enabled: boolean;
    credentialStatus: string;
    privacyNotes: string;
  };
  health: {
    state: string;
    cause?: string;
    nextAction?: string;
    affectedWorkflows: string[];
  };
  capabilities: {
    supported: string[];
    unavailable: string[];
    localFallback: string[];
    policyGated: string[];
  };
}

interface McpToolEntry {
  name: string;
  aliases: string[];
  permission: "read" | "write" | "policy_gated";
  description: string;
  visibleInCockpit: boolean;
}

interface AdapterCertification {
  adapterId: string;
  testMode: string;
  status: string;
  offlineBehavior: string;
  disablementBehavior: string;
  importExportStrategy: string;
  rebuildStrategy: string;
  healthEvidence: string[];
}

const fallbackAdapters: AdapterEntry[] = [
  {
    metadata: {
      adapterId: "adapter_memory_markdown",
      category: "memory",
      name: "Markdown memory",
      enabled: true,
      credentialStatus: "not_required",
      privacyNotes: "Local markdown memory remains available."
    },
    health: {
      state: "managed",
      affectedWorkflows: ["memory", "context"],
      nextAction: "No action needed."
    },
    capabilities: {
      supported: ["import", "search", "export"],
      unavailable: [],
      localFallback: [],
      policyGated: []
    }
  }
];

export function AdaptersRoute() {
  const [adapters, setAdapters] = useState<AdapterEntry[]>(fallbackAdapters);
  const [certifications, setCertifications] = useState<Record<string, AdapterCertification>>({});
  const [mcpTools, setMcpTools] = useState<McpToolEntry[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "degraded">("loading");

  async function loadAdapters(shouldApply = () => true) {
    try {
      const response = await fetch("/api/v1/adapters");
      const payload = (await response.json()) as { data?: AdapterEntry[] };
      if (shouldApply() && payload.data) {
        setAdapters(payload.data);
        setStatus("ready");
      }
    } catch {
      if (shouldApply()) {
        setAdapters(fallbackAdapters);
        setStatus("degraded");
      }
    }
  }

  async function loadCertifications(shouldApply = () => true) {
    try {
      const response = await fetch("/api/v1/adapters/certification");
      const payload = (await response.json()) as { data?: AdapterCertification[] };
      if (shouldApply() && payload.data) {
        setCertifications(
          Object.fromEntries(
            payload.data.map((certification) => [certification.adapterId, certification])
          )
        );
      }
    } catch {
      if (shouldApply()) {
        setCertifications({});
      }
    }
  }

  useEffect(() => {
    let active = true;
    void loadAdapters(() => active);
    void fetch("/api/v1/mcp/tools")
      .then((response) => response.json() as Promise<{ data?: McpToolEntry[] }>)
      .then((payload) => {
        if (active && payload.data) setMcpTools(payload.data);
      })
      .catch(() => {
        if (active) setMcpTools([]);
      });
    void loadCertifications(() => active);
    return () => {
      active = false;
    };
  }, []);

  async function setAdapterEnabled(adapter: AdapterEntry, enabled: boolean) {
    const action = enabled ? "enable" : "disable";
    const response = await fetch(`/api/v1/adapters/${adapter.metadata.adapterId}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "Operator changed adapter setting in cockpit" })
    });
    if (response.ok) {
      await Promise.all([loadAdapters(), loadCertifications()]);
    }
  }

  return (
    <main>
      <header>
        <h1>Adapters</h1>
        <p>{status === "degraded" ? "Adapter API degraded" : "Optional capability status"}</p>
      </header>
      <section aria-label="Adapter settings">
        <h2>Settings</h2>
        <ul>
          {adapters.map((adapter) => (
            <li key={adapter.metadata.adapterId}>
              <article>
                <h3>{adapter.metadata.name}</h3>
                {(() => {
                  const certification = certifications[adapter.metadata.adapterId];
                  return certification ? (
                    <p>
                      Certification: {certification.status} ({certification.testMode})
                    </p>
                  ) : null;
                })()}
                <dl>
                  <dt>Category</dt>
                  <dd>{adapter.metadata.category}</dd>
                  <dt>Status</dt>
                  <dd>{adapter.metadata.enabled ? "enabled" : "disabled"}</dd>
                  <dt>Health</dt>
                  <dd>{adapter.health.state}</dd>
                  <dt>Credential status</dt>
                  <dd>{adapter.metadata.credentialStatus}</dd>
                  <dt>Privacy</dt>
                  <dd>{adapter.metadata.privacyNotes}</dd>
                  <dt>Affected workflows</dt>
                  <dd>{adapter.health.affectedWorkflows.join(", ")}</dd>
                  <dt>Local fallback</dt>
                  <dd>{adapter.capabilities.localFallback.join(", ") || "none"}</dd>
                  <dt>Policy gates</dt>
                  <dd>{adapter.capabilities.policyGated.join(", ") || "none"}</dd>
                  {(() => {
                    const certification = certifications[adapter.metadata.adapterId];
                    return certification ? (
                      <>
                        <dt>Offline behavior</dt>
                        <dd>{certification.offlineBehavior}</dd>
                        <dt>Import/export</dt>
                        <dd>{certification.importExportStrategy}</dd>
                      </>
                    ) : null;
                  })()}
                </dl>
                <p>{adapter.health.cause ?? adapter.health.nextAction}</p>
                <button
                  type="button"
                  onClick={() => void setAdapterEnabled(adapter, !adapter.metadata.enabled)}
                >
                  {adapter.metadata.enabled ? "Disable" : "Enable"}
                </button>
              </article>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="MCP tool visibility and permissions">
        <h2>MCP</h2>
        <table>
          <thead>
            <tr>
              <th>Tool</th>
              <th>Permission</th>
              <th>Aliases</th>
            </tr>
          </thead>
          <tbody>
            {mcpTools.map((tool) => (
              <tr key={tool.name}>
                <td>{tool.name}</td>
                <td>{tool.permission}</td>
                <td>{tool.aliases.join(", ") || "none"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
