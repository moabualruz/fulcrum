import { useEffect, useState } from "react";

interface RecoveryState {
  backups: BackupSummary[];
  restorePreview?: RestorePreview;
  exportPreview?: ExportPreview;
  rebuildPreview?: RebuildPreview;
  resetPreview?: DestructivePreview;
  uninstallPreview?: DestructivePreview;
}

interface BackupSummary {
  backupId: string;
  includedRecords?: Record<string, number>;
  integrityStatus: string;
  localRef: string;
  redactionStatus: string;
}

interface RestorePreview {
  valid: boolean;
  checkedReferences: string[];
  brokenReferences: string[];
  preservedUserWork: boolean;
  nextAction: string;
}

interface ExportPreview {
  includedEntityClasses: string[];
  recordCounts: Record<string, number>;
  provenanceCoverage: string;
  redactionStatus: string;
  requiresPolicyApproval: boolean;
  guarantees: string[];
}

interface RebuildPreview {
  steps: Array<{ name: string; status: string; rebuiltCount: number; source: string }>;
  preservedCanonicalState: boolean;
}

interface DestructivePreview {
  remove: string[];
  preserve: string[];
  purge?: string[];
  guarantees?: string[];
  policyDecision?: { status: string; action?: string };
}

const fallbackState: RecoveryState = {
  backups: [],
  resetPreview: {
    remove: ["derived caches"],
    preserve: ["backups", "artifacts", "user repositories"],
    policyDecision: { status: "approval_required" }
  },
  uninstallPreview: {
    remove: ["Fulcrum SQLite state", "derived caches"],
    preserve: ["backups", "artifacts", "user repositories"],
    policyDecision: { status: "approval_required" }
  },
  exportPreview: {
    includedEntityClasses: ["projects", "tasks", "runs"],
    recordCounts: {},
    provenanceCoverage: "none",
    redactionStatus: "not_applicable",
    requiresPolicyApproval: true,
    guarantees: ["Exports stay local and include provenance when state records are available."]
  },
  rebuildPreview: {
    preservedCanonicalState: true,
    steps: [
      { name: "projections", status: "degraded", rebuiltCount: 0, source: "unavailable" },
      { name: "memory_indexes", status: "degraded", rebuiltCount: 0, source: "unavailable" },
      { name: "code_refs", status: "degraded", rebuiltCount: 0, source: "unavailable" }
    ]
  }
};

export function RecoveryRoute() {
  const [state, setState] = useState<RecoveryState>(fallbackState);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const backupsResponse = await fetch("/api/v1/backups");
        const backups = (await backupsResponse.json()) as { data?: BackupSummary[] };
        const firstBackup = backups.data?.[0];
        const [restoreResponse, exportResponse, rebuildResponse, resetResponse, uninstallResponse] =
          await Promise.all([
            firstBackup
              ? fetch("/api/v1/restore", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    backupId: firstBackup.backupId,
                    target: "/local/fulcrum/restore-preview"
                  })
                })
              : undefined,
            fetch("/api/v1/exports/preview", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                outputRoot: "/local/fulcrum/exports",
                entityClasses: ["projects", "tasks", "runs", "artifacts", "memory", "policies"]
              })
            }),
            fetch("/api/v1/rebuild", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({})
            }),
            fetch("/api/v1/reset/preview", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ stateRoot: "/local/fulcrum" })
            }),
            fetch("/api/v1/uninstall/preview", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ stateRoot: "/local/fulcrum" })
            })
          ]);
        const restore = restoreResponse
          ? ((await restoreResponse.json()) as { data?: RestorePreview })
          : undefined;
        const exportPreview = (await exportResponse.json()) as { data?: ExportPreview };
        const rebuild = (await rebuildResponse.json()) as { data?: RebuildPreview };
        const reset = (await resetResponse.json()) as { data?: DestructivePreview };
        const uninstall = (await uninstallResponse.json()) as {
          data?: DestructivePreview;
        };
        if (active) {
          setState({
            backups: backups.data ?? [],
            restorePreview: restore?.data,
            exportPreview: exportPreview.data,
            rebuildPreview: rebuild.data,
            resetPreview: reset.data,
            uninstallPreview: uninstall.data
          });
        }
      } catch {
        if (active) {
          setState(fallbackState);
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main>
      <header>
        <h1>Recovery</h1>
        <p>Backups, exports, rebuilds, reset previews, and uninstall previews</p>
      </header>
      <section aria-label="Backup manifests">
        <h2>Backups</h2>
        <p>{state.backups.length} manifests</p>
        <p>{state.backups[0]?.integrityStatus ?? "No backup manifest selected"}</p>
      </section>
      <section aria-label="Restore validation">
        <h2>Restore Validation</h2>
        <p>{state.restorePreview?.valid ? "Valid" : "No valid restore preview"}</p>
        <dl>
          <dt>Checked</dt>
          <dd>{state.restorePreview?.checkedReferences.join(", ") ?? "none"}</dd>
          <dt>Broken</dt>
          <dd>{state.restorePreview?.brokenReferences.join(", ") ?? "none"}</dd>
          <dt>User work</dt>
          <dd>{state.restorePreview?.preservedUserWork ? "preserved" : "needs review"}</dd>
        </dl>
      </section>
      <section aria-label="Export preview">
        <h2>Export Preview</h2>
        <p>Redaction: {state.exportPreview?.redactionStatus ?? "not_applicable"}</p>
        <dl>
          <dt>Provenance</dt>
          <dd>{state.exportPreview?.provenanceCoverage ?? "none"}</dd>
          <dt>Policy</dt>
          <dd>{state.exportPreview?.requiresPolicyApproval ? "sensitive_export" : "allowed"}</dd>
          <dt>Entities</dt>
          <dd>{state.exportPreview?.includedEntityClasses.join(", ") ?? "none"}</dd>
        </dl>
      </section>
      <section aria-label="Rebuild preview">
        <h2>Rebuild Preview</h2>
        <p>
          {state.rebuildPreview?.preservedCanonicalState ? "Canonical state preserved" : "Blocked"}
        </p>
        <ul>
          {state.rebuildPreview?.steps.map((step) => (
            <li key={step.name}>
              {step.name}: {step.status} ({step.source})
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Reset preview">
        <h2>Reset Preview</h2>
        <p>Policy: {state.resetPreview?.policyDecision?.status ?? "approval_required"}</p>
        <dl>
          <dt>Remove</dt>
          <dd>{state.resetPreview?.remove.join(", ")}</dd>
          <dt>Preserve</dt>
          <dd>{state.resetPreview?.preserve.join(", ")}</dd>
        </dl>
      </section>
      <section aria-label="Uninstall preview">
        <h2>Uninstall Preview</h2>
        <p>Policy: {state.uninstallPreview?.policyDecision?.status ?? "approval_required"}</p>
        <dl>
          <dt>Remove</dt>
          <dd>{state.uninstallPreview?.remove.join(", ")}</dd>
          <dt>Preserve</dt>
          <dd>{state.uninstallPreview?.preserve.join(", ")}</dd>
        </dl>
      </section>
    </main>
  );
}
