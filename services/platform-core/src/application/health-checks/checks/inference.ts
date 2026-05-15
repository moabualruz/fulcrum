/**
 * Doctor check module for inference subsystem.
 *
 * Two checks:
 *   1. inference-sidecar — is the embedded sidecar reachable?
 *   2. inference-backends — what states are backends reporting?
 *
 * Follows same pattern as routing.ts doctor checks.
 */

import { InferenceService } from "../../inference/service.ts";
import type { DoctorCheckDef } from "../types.ts";

// ---------------------------------------------------------------------------
// Check runners
// ---------------------------------------------------------------------------

async function checkSidecar(): Promise<{
  status: "ok" | "warn" | "fail";
  message: string;
  recovery?: string;
}> {
  try {
    const svc = new InferenceService();
    const status = await svc.sidecarStatus();
    if (status.status === "ok") {
      return {
        status: "ok",
        message: `inference-sidecar: running pid=${status.pid} socket=${status.socketPath}`,
      };
    }
    return {
      status: "warn",
      message: `inference-sidecar: ${status.status} socket=${status.socketPath}`,
      recovery: "Run `fulcrum inference start` to start the sidecar.",
    };
  } catch (err) {
    return {
      status: "fail",
      message: `inference-sidecar: error — ${(err as Error).message}`,
      recovery: "Run `fulcrum doctor --subsystem inference` for details.",
    };
  }
}

async function checkBackends(): Promise<{
  status: "ok" | "warn" | "fail";
  message: string;
  recovery?: string;
}> {
  try {
    const svc = new InferenceService();
    const backends = await svc.probeBackends();
    const counts = { running: 0, stopped: 0, degraded: 0, unavailable: 0, unconfigured: 0 };
    for (const b of backends) {
      counts[b.status]++;
    }
    const parts: string[] = [];
    for (const [status, count] of Object.entries(counts)) {
      if (count > 0) parts.push(`${status}=${count}`);
    }

    if (counts.unavailable > 0 || counts.degraded > 0) {
      return {
        status: "warn",
        message: `inference-backends: ${parts.join(" ")}`,
        recovery: "Check configured backends are running and accessible.",
      };
    }

    return {
      status: "ok",
      message: `inference-backends: ${parts.join(" ")}`,
    };
  } catch (err) {
    return {
      status: "fail",
      message: `inference-backends: error — ${(err as Error).message}`,
      recovery: "Run `fulcrum inference status --json` for backend details.",
    };
  }
}

// ---------------------------------------------------------------------------
// Module entry — auto-discovered by src/doctor/index.ts
// ---------------------------------------------------------------------------

export const checks: DoctorCheckDef[] = [
  {
    name: "inference-sidecar",
    subsystem: "inference",
    run: checkSidecar,
  },
  {
    name: "inference-backends",
    subsystem: "inference",
    run: checkBackends,
  },
];
