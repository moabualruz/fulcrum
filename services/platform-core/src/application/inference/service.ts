/**
 * service.ts — InferenceService: backend health lifecycle and health service.
 *
 * Ownership:
 *   - `start` starts only the embedded sidecar via InferenceLifecycle.
 *   - `stop` stops only the embedded sidecar via InferenceLifecycle.
 *   - Backend health / probes are delegated to backend-probes.ts.
 *   - External backends (Ollama, LM Studio, OpenAI-compatible) are probed
 *     only; never launched.
 */
import { InferenceLifecycle } from "./lifecycle.ts";
import { probeConfiguredBackends, type BackendHealth } from "./backend-probes.ts";
import type { InferenceStatus } from "./lifecycle.ts";

export interface InferenceServiceOptions {
  lifecycle?: InferenceLifecycle;
}

/**
 * Central health-and-lifecycle service for inference backends.
 *
 * Provides unified health, probe, start, and stop across all backends.
 */
export class InferenceService {
  private readonly lifecycle: InferenceLifecycle;

  constructor(opts: InferenceServiceOptions = {}) {
    this.lifecycle = opts.lifecycle ?? new InferenceLifecycle();
  }

  /**
   * Start the embedded sidecar. External backends are NOT launched.
   */
  async start(): Promise<InferenceStatus> {
    await this.lifecycle.ensureRunning();
    return this.lifecycle.status();
  }

  /**
   * Stop the embedded sidecar. External backends are NOT affected.
   */
  async stop(): Promise<InferenceStatus> {
    await this.lifecycle.stop();
    return this.lifecycle.status();
  }

  /**
   * Get the embedded sidecar status.
   */
  async sidecarStatus(): Promise<InferenceStatus> {
    return this.lifecycle.status();
  }

  /**
   * Probe all configured/enabled backends with real embed/generate calls.
   */
  async probeBackends(): Promise<BackendHealth[]> {
    return probeConfiguredBackends();
  }

  /**
   * Get combined health: sidecar status + backend health array.
   */
  async health(): Promise<{
    sidecar: InferenceStatus;
    backends: BackendHealth[];
  }> {
    const [sidecar, backends] = await Promise.all([
      this.lifecycle.status(),
      probeConfiguredBackends(),
    ]);
    return { sidecar, backends };
  }
}
