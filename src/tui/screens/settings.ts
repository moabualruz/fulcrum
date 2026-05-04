import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";

type SettingsTab = "theme" | "secrets" | "errors" | "backup" | "telemetry" | "flags" | "data";

const TABS: SettingsTab[] = ["theme", "secrets", "errors", "backup", "telemetry", "flags", "data"];

export class SettingsTabs {
  private index = 0;

  constructor(private readonly opts: { onExit?: () => void } = {}) {}

  get current(): SettingsTab {
    return TABS[this.index]!;
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "\t") {
      this.index = (this.index + 1) % TABS.length;
      return true;
    }
    if (key === "\x1b[Z") {
      this.index = (this.index + TABS.length - 1) % TABS.length;
      return true;
    }
    if (key === "\x1b") {
      this.opts.onExit?.();
      return true;
    }
    return false;
  }
}

interface ThemeState {
  preset: string;
  accent: string;
  accentAnsi: number;
  borderAnsi: number;
}

export class ThemeSettingsScreen {
  private theme: ThemeState | null = null;

  constructor(private readonly opts: {
    caller: {
      theme: {
        get: () => Promise<ThemeState>;
        set: (input: { accent: string }) => Promise<ThemeState>;
      };
    };
    onThemeApplied?: (theme: ThemeState) => void;
  }) {}

  async load(): Promise<void> {
    this.theme = await this.opts.caller.theme.get();
  }

  render(renderer: Renderer): void {
    renderer.writeln(c.bold("Settings > Theme"));
    renderer.separator();
    const theme = this.theme;
    if (!theme) {
      renderer.writeln("  Theme not loaded");
      return;
    }
    renderer.infoRow("Preset", theme.preset);
    renderer.infoRow("Accent", `${theme.accent} (ANSI ${theme.accentAnsi})`);
    renderer.infoRow("Focused border", `ANSI ${theme.borderAnsi}`);
    renderer.writeln(c.dim("  Tab/Shift+Tab tabs  Esc back  sliders adjust ANSI approximation"));
  }

  async setAccent(accent: string): Promise<void> {
    this.theme = await this.opts.caller.theme.set({ accent });
    this.opts.onThemeApplied?.(this.theme);
  }
}

interface CredentialRow {
  id: string;
  name: string;
  maskedValue: string;
}

export class SecretsSettingsScreen {
  private rows: CredentialRow[] = [];
  private cursor = 0;
  private revealed = new Map<string, string>();

  constructor(private readonly opts: {
    caller: {
      secrets: {
        list: () => Promise<CredentialRow[]>;
        add: (input: { name: string; value: string }) => Promise<{ id: string }>;
        reveal: (input: { id: string }) => Promise<{ value: string }>;
        rotate: (input: { id: string }) => Promise<{ ok: boolean }>;
        delete: (input: { id: string }) => Promise<{ ok: boolean }>;
      };
    };
  }) {}

  async load(): Promise<void> {
    this.rows = await this.opts.caller.secrets.list();
    this.cursor = Math.min(this.cursor, Math.max(0, this.rows.length - 1));
  }

  render(renderer: Renderer): void {
    renderer.writeln(c.bold("Settings > Secrets"));
    renderer.separator();
    if (this.rows.length === 0) {
      renderer.writeln("  No credentials");
    }
    for (const [index, row] of this.rows.entries()) {
      const value = this.revealed.get(row.id) ?? row.maskedValue;
      renderer.writeln(`${index === this.cursor ? ">" : " "} ${row.name}: ${value}`);
    }
    renderer.writeln(c.dim("  A add  Enter reveal  R rotate  D delete  Esc back"));
  }

  async submitNewSecret(name: string, value: string): Promise<void> {
    await this.opts.caller.secrets.add({ name, value });
    await this.load();
  }

  expireRevealedValues(): void {
    this.revealed.clear();
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.rows.length - 1));
      return true;
    }
    if (key === "k" || key === "\x1b[A") {
      this.cursor = Math.max(0, this.cursor - 1);
      return true;
    }
    const row = this.rows[this.cursor];
    if (!row) return false;
    if (key === "\r" || key === "\n") {
      const result = await this.opts.caller.secrets.reveal({ id: row.id });
      this.revealed.set(row.id, result.value);
      return true;
    }
    if (key === "R") {
      await this.opts.caller.secrets.rotate({ id: row.id });
      return true;
    }
    if (key === "D") {
      await this.opts.caller.secrets.delete({ id: row.id });
      await this.load();
      return true;
    }
    return false;
  }
}

interface CrashRow {
  id: string;
  message: string;
  stack: string;
  at: string;
}

export class ErrorsSettingsScreen {
  private rows: CrashRow[] = [];
  private cursor = 0;
  private expanded = new Set<string>();
  private awaitingClear = false;

  constructor(private readonly opts: {
    caller: {
      errors: {
        list: () => Promise<CrashRow[]>;
        delete: (input: { id: string }) => Promise<{ ok: boolean }>;
        clear: () => Promise<{ ok: boolean }>;
      };
    };
  }) {}

  async load(): Promise<void> {
    this.rows = await this.opts.caller.errors.list();
    this.cursor = Math.min(this.cursor, Math.max(0, this.rows.length - 1));
  }

  render(renderer: Renderer): void {
    renderer.writeln(c.bold("Settings > Errors"));
    renderer.separator();
    if (this.rows.length === 0) renderer.writeln("  No crash reports");
    for (const [index, row] of this.rows.entries()) {
      renderer.writeln(`${index === this.cursor ? ">" : " "} ${row.at} ${row.message}`);
      if (this.expanded.has(row.id)) renderer.writeln(row.stack);
    }
    if (this.awaitingClear) renderer.writeln("  Clear all crash reports?");
    renderer.writeln(c.dim("  j/k scroll  Enter expand  D delete  C clear  Esc back"));
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.rows.length - 1));
      return true;
    }
    if (key === "k" || key === "\x1b[A") {
      this.cursor = Math.max(0, this.cursor - 1);
      return true;
    }
    if (key === "C") {
      this.awaitingClear = true;
      return true;
    }
    const row = this.rows[this.cursor];
    if (!row) return false;
    if (key === "\r" || key === "\n") {
      this.expanded.add(row.id);
      return true;
    }
    if (key === "D") {
      await this.opts.caller.errors.delete({ id: row.id });
      await this.load();
      return true;
    }
    return false;
  }

  async confirmClear(): Promise<void> {
    if (!this.awaitingClear) return;
    await this.opts.caller.errors.clear();
    this.awaitingClear = false;
    await this.load();
  }
}

interface BackupHistoryRow {
  id: string;
  path: string;
  bytes: number;
  at: string;
}

interface EntityCounts {
  [key: string]: number;
}

export class BackupSettingsScreen {
  private history: BackupHistoryRow[] = [];
  private bytesWritten = 0;
  private restorePath: string | null = null;
  private restoreCounts: EntityCounts | null = null;

  constructor(private readonly opts: {
    caller: {
      backup: {
        history: () => Promise<BackupHistoryRow[]>;
        create: () => AsyncIterable<{ bytesWritten: number; path?: string }>;
        preflightRestore: (input: { path: string }) => Promise<{ path: string; counts: EntityCounts }>;
        restore: (input: { path: string }) => Promise<{ ok: boolean }>;
      };
    };
  }) {}

  async load(): Promise<void> {
    this.history = await this.opts.caller.backup.history();
  }

  render(renderer: Renderer): void {
    renderer.writeln(c.bold("Settings > Backup"));
    renderer.separator();
    if (this.bytesWritten > 0) renderer.writeln(`  ${kb(this.bytesWritten)} written`);
    for (const row of this.history) renderer.writeln(`  ${row.at} ${row.path} ${kb(row.bytes)}`);
    if (this.restoreCounts) renderCounts(renderer, "Restore preflight", this.restoreCounts);
    renderer.writeln(c.dim("  B backup  R restore  Esc back"));
  }

  async handleKey(key: string): Promise<boolean> {
    if (key !== "B") return false;
    for await (const event of this.opts.caller.backup.create()) {
      this.bytesWritten = event.bytesWritten;
    }
    return true;
  }

  async submitRestorePath(path: string): Promise<void> {
    const preflight = await this.opts.caller.backup.preflightRestore({ path });
    this.restorePath = preflight.path;
    this.restoreCounts = preflight.counts;
  }

  async confirmRestore(): Promise<void> {
    if (!this.restorePath) return;
    await this.opts.caller.backup.restore({ path: this.restorePath });
  }
}

export class TelemetrySettingsScreen {
  private optIn = false;
  private eventCount = 0;
  private purgeMessage: string | null = null;

  constructor(private readonly opts: {
    caller: {
      telemetry: {
        get: () => Promise<{ optIn: boolean; eventCount: number }>;
        setOptIn: (input: { optIn: boolean }) => Promise<{ optIn: boolean }>;
        purge: () => Promise<{ before: number; after: number }>;
      };
    };
  }) {}

  async load(): Promise<void> {
    const state = await this.opts.caller.telemetry.get();
    this.optIn = state.optIn;
    this.eventCount = state.eventCount;
  }

  render(renderer: Renderer): void {
    renderer.writeln(c.bold("Settings > Telemetry"));
    renderer.separator();
    renderer.writeln(`  Opt-in: ${this.optIn ? "yes" : "no"}`);
    renderer.infoRow("Events", String(this.eventCount));
    if (this.purgeMessage) renderer.writeln(`  ${this.purgeMessage}`);
    renderer.writeln(c.dim("  Space toggle  P purge  Esc back"));
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === " ") {
      const state = await this.opts.caller.telemetry.setOptIn({ optIn: !this.optIn });
      this.optIn = state.optIn;
      return true;
    }
    if (key === "P") {
      const result = await this.opts.caller.telemetry.purge();
      this.eventCount = result.after;
      this.purgeMessage = `Purged ${result.before} -> ${result.after}`;
      return true;
    }
    return false;
  }
}

interface FeatureFlagRow {
  name: string;
  enabled: boolean;
  rolloutPercent: number;
  cohortRules: unknown;
}

export class FeatureFlagsSettingsScreen {
  private rows: FeatureFlagRow[] = [];
  private cursor = 0;

  constructor(private readonly opts: {
    caller: {
      featureFlags: {
        list: () => Promise<FeatureFlagRow[]>;
        setEnabled: (input: { flag: string; enabled: boolean }) => Promise<{ ok: boolean }>;
        setRollout: (input: { flag: string; rolloutPercent: number }) => Promise<{ ok: boolean }>;
        setCohortRules: (input: { flag: string; cohortRules: unknown }) => Promise<{ ok: boolean }>;
      };
    };
  }) {}

  async load(): Promise<void> {
    this.rows = await this.opts.caller.featureFlags.list();
    this.cursor = Math.min(this.cursor, Math.max(0, this.rows.length - 1));
  }

  render(renderer: Renderer): void {
    renderer.writeln(c.bold("Settings > Feature Flags"));
    renderer.separator();
    for (const [index, row] of this.rows.entries()) {
      const enabled = row.enabled ? "[ON ]" : "[OFF]";
      renderer.writeln(`${index === this.cursor ? ">" : " "} ${enabled} ${row.name} ${row.rolloutPercent}% ${JSON.stringify(row.cohortRules)}`);
    }
    renderer.writeln(c.dim("  Space toggle  E rollout  Enter cohorts  Esc back"));
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.rows.length - 1));
      return true;
    }
    if (key === "k" || key === "\x1b[A") {
      this.cursor = Math.max(0, this.cursor - 1);
      return true;
    }
    const row = this.rows[this.cursor];
    if (!row || key !== " ") return false;
    await this.opts.caller.featureFlags.setEnabled({ flag: row.name, enabled: !row.enabled });
    await this.load();
    return true;
  }

  async submitRolloutPercent(rolloutPercent: number): Promise<void> {
    const row = this.rows[this.cursor];
    if (!row) return;
    await this.opts.caller.featureFlags.setRollout({ flag: row.name, rolloutPercent });
    await this.load();
  }

  async submitCohortRules(json: string): Promise<void> {
    const row = this.rows[this.cursor];
    if (!row) return;
    await this.opts.caller.featureFlags.setCohortRules({ flag: row.name, cohortRules: JSON.parse(json) });
    await this.load();
  }
}

export class DataSettingsScreen {
  private exportBytes = 0;
  private importPath: string | null = null;
  private importCounts: EntityCounts | null = null;
  private imported: number | null = null;

  constructor(private readonly opts: {
    caller: {
      data: {
        export: (input: { path: string }) => AsyncIterable<{ bytesWritten: number }>;
        preflightImport: (input: { path: string }) => Promise<{ path: string; counts: EntityCounts }>;
        import: (input: { path: string }) => Promise<{ imported: number }>;
      };
    };
  }) {}

  render(renderer: Renderer): void {
    renderer.writeln(c.bold("Settings > Data"));
    renderer.separator();
    if (this.exportBytes > 0) renderer.writeln(`  ${kb(this.exportBytes)} exported`);
    if (this.importCounts) renderCounts(renderer, "Import preflight", this.importCounts);
    if (this.imported !== null) renderer.writeln(`  Imported ${this.imported} entities`);
    renderer.writeln(c.dim("  E export  I import  Esc back"));
  }

  async submitExportPath(path: string): Promise<void> {
    for await (const event of this.opts.caller.data.export({ path })) {
      this.exportBytes = event.bytesWritten;
    }
  }

  async submitImportPath(path: string): Promise<void> {
    const preflight = await this.opts.caller.data.preflightImport({ path });
    this.importPath = preflight.path;
    this.importCounts = preflight.counts;
  }

  async confirmImport(): Promise<void> {
    if (!this.importPath) return;
    const result = await this.opts.caller.data.import({ path: this.importPath });
    this.imported = result.imported;
  }
}

function kb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

function renderCounts(renderer: Renderer, title: string, counts: EntityCounts): void {
  renderer.writeln(`  ${title}`);
  for (const [key, value] of Object.entries(counts)) {
    renderer.writeln(`  ${key}: ${value}`);
  }
}
