import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import type { SubscriptionBridge, TuiSubscription } from "../subscriptions.ts";

export interface TuiInferenceStatus {
  status: "running" | "stopped" | "error" | string;
  pid?: number | null;
  message?: string | null;
}

export interface TuiInferenceModel {
  id: string;
  kind: string;
  status?: string;
  sizeBytes?: number | null;
  default?: boolean;
}

export interface InferenceDashboardScreenOptions {
  caller: {
    inference: {
      status: () => Promise<TuiInferenceStatus>;
      start: () => Promise<TuiInferenceStatus>;
      stop: () => Promise<TuiInferenceStatus>;
      models: {
        list: () => Promise<TuiInferenceModel[]>;
      };
    };
  };
  subscriptions?: SubscriptionBridge;
  viewportRows?: number;
}

export class InferenceDashboardScreen {
  private sidecar: TuiInferenceStatus | null = null;
  private models: TuiInferenceModel[] = [];
  private subscriptions: TuiSubscription[] = [];

  constructor(private readonly opts: InferenceDashboardScreenOptions) {}

  async load(): Promise<void> {
    const [sidecar, models] = await Promise.all([
      this.opts.caller.inference.status(),
      this.opts.caller.inference.models.list(),
    ]);
    this.sidecar = sidecar;
    this.models = models;
    this.subscribeOnce();
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Inference"));
    renderer.separator();
    renderer.writeln();

    renderer.writeln(`  Sidecar: ${statusBadge(this.sidecar?.status ?? "unknown")} ${this.sidecarDetail}`);
    renderer.writeln();
    renderer.writeln(c.bold("  Models"));

    if (this.visibleModels.length === 0) {
      renderer.writeln(c.dim("  No inference models configured."));
    } else {
      for (const model of this.visibleModels) {
        const defaultBadge = model.default ? " [default]" : "";
        renderer.writeln(`  ${model.id}  ${model.kind}  [${model.status ?? "unknown"}]${defaultBadge}  ${formatBytes(model.sizeBytes)}`);
      }
    }

    renderer.writeln();
    renderer.writeln(c.dim("  s start/stop sidecar  q back"));
  }

  async handleKey(key: string): Promise<boolean> {
    if (key !== "s") return false;
    if (this.sidecar?.status === "running") {
      this.sidecar = await this.opts.caller.inference.stop();
      return true;
    }

    this.sidecar = await this.opts.caller.inference.start();
    return true;
  }

  dispose(): void {
    for (const subscription of this.subscriptions) subscription.unsubscribe();
    this.subscriptions = [];
  }

  get visibleModels(): readonly TuiInferenceModel[] {
    const rows = this.opts.viewportRows ?? 20;
    return this.models.slice(0, rows);
  }

  private get sidecarDetail(): string {
    if (!this.sidecar) return "";
    if (this.sidecar.status === "running" && this.sidecar.pid) return `pid ${this.sidecar.pid}`;
    return this.sidecar.message ?? "";
  }

  private subscribeOnce(): void {
    if (!this.opts.subscriptions || this.subscriptions.length > 0) return;
    this.subscriptions.push(
      this.opts.subscriptions.subscribe<TuiInferenceStatus>("inference.onSidecarStatus", (payload) => {
        this.sidecar = payload;
      }),
    );
  }
}

function statusBadge(status: string): string {
  if (status === "running") return c.green("[running]");
  if (status === "stopped") return c.dim("[stopped]");
  if (status === "error") return c.red("[error]");
  return `[${status}]`;
}

function formatBytes(sizeBytes?: number | null): string {
  if (sizeBytes == null) return "";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  return `${Math.round(sizeBytes / 1024)} KiB`;
}
