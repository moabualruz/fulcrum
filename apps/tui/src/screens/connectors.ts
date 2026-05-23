import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";

export interface TuiConnector {
  kind: string;
  enabled: boolean;
  lastSyncAt?: string | null;
  status?: string | null;
  error?: string | null;
}

export interface ConnectorListResult {
  items: TuiConnector[];
  total: number;
}

export interface ConnectorsScreenOptions {
  caller: {
    connectors: {
      list: () => Promise<TuiConnector[]>;
      sync?: (input: { kind: string }) => Promise<Partial<TuiConnector> & { kind: string }>;
      toggle?: (input: { kind: string; enabled: boolean }) => Promise<Partial<TuiConnector> & { kind: string }>;
    };
  };
  onOpenConnector?: (kind: string) => void;
}

export class ConnectorsScreen {
  private connectors: TuiConnector[] = [];
  private cursor = 0;

  constructor(private readonly opts: ConnectorsScreenOptions) {}

  async load(): Promise<void> {
    this.connectors = await this.opts.caller.connectors.list();
    this.cursor = Math.min(this.cursor, Math.max(0, this.connectors.length - 1));
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Connectors"));
    renderer.separator();
    renderer.writeln();

    if (this.connectors.length === 0) {
      renderer.writeln(c.dim("  No connectors configured."));
    } else {
      for (let index = 0; index < this.connectors.length; index++) {
        const connector = this.connectors[index]!;
        const prefix = index === this.cursor ? c.bold("> ") : "  ";
        const enabled = connector.enabled ? "ON" : "OFF";
        const status = connector.status ?? "idle";
        const error = connector.error ? `  ${connector.error}` : "";
        renderer.writeln(`${prefix}${connector.kind}  ${enabled}  last-sync: ${connector.lastSyncAt ?? "never"}  status: ${status}${error}`);
      }
    }

    renderer.writeln();
    renderer.writeln(c.dim("  j/k navigate  Enter config  s sync  Space toggle  q back"));
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.connectors.length - 1));
      return true;
    }

    if (key === "k" || key === "\x1b[A") {
      this.cursor = Math.max(this.cursor - 1, 0);
      return true;
    }

    if (key === "\r" || key === "\n") {
      const connector = this.connectors[this.cursor];
      if (!connector) return false;
      this.opts.onOpenConnector?.(connector.kind);
      return true;
    }

    if (key === "s") {
      await this.syncCurrent();
      return true;
    }

    if (key === " ") {
      await this.toggleCurrent();
      return true;
    }

    return false;
  }

  private async syncCurrent(): Promise<void> {
    const connector = this.connectors[this.cursor];
    if (!connector || !this.opts.caller.connectors.sync) return;
    const updated = await this.opts.caller.connectors.sync({ kind: connector.kind });
    this.mergeConnector(updated);
  }

  private async toggleCurrent(): Promise<void> {
    const connector = this.connectors[this.cursor];
    if (!connector || !this.opts.caller.connectors.toggle) return;
    const updated = await this.opts.caller.connectors.toggle({ kind: connector.kind, enabled: !connector.enabled });
    this.mergeConnector(updated);
  }

  private mergeConnector(updated: Partial<TuiConnector> & { kind: string }): void {
    this.connectors = this.connectors.map((connector) => (
      connector.kind === updated.kind ? { ...connector, ...updated } : connector
    ));
  }
}

export function renderConnectorList(renderer: Renderer, result: ConnectorListResult): void {
  renderer.writeln(`Connectors (${result.total})`);
  for (const connector of result.items) {
    renderer.writeln(`${connector.kind}  ${connector.enabled ? "ON" : "OFF"}  last-sync: ${connector.lastSyncAt ?? "never"}`);
  }
}
