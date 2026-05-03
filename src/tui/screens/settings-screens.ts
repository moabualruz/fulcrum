/**
 * TUI settings screen presenters — pure functions producing text output.
 * No terminal I/O; consumed by OpenTUI component tree and tests.
 */

import type { ConnectorRunRow, CredentialRow } from "../../product-kernel/store/settings-connectors-credentials.ts";

// --- Connectors Screen ---

export interface ConnectorCard {
  kind: string;
  enabled: boolean;
  runs: ConnectorRunRow[];
}

export function renderConnectorsScreen(connectors: ConnectorCard[]): string {
  const lines: string[] = ["═══ Integrations / Connectors ═══", ""];

  for (const c of connectors) {
    const lastRun = c.runs[0];
    const syncAt = lastRun ? lastRun.started_at : "never";
    const syncStatus = lastRun ? lastRun.status : "—";
    const syncedCount = lastRun ? String(lastRun.records_synced) : "0";

    lines.push(`  ${c.kind}  ${c.enabled ? "ON" : "OFF"}  last-sync: ${syncAt}  status: ${syncStatus}  records: ${syncedCount}`);
  }

  lines.push("");
  lines.push("─── Run Log ───");
  for (const c of connectors) {
    for (const run of c.runs.slice(0, 10)) {
      lines.push(`  ${run.kind}  ${run.status}  ${run.started_at}  ${run.records_synced} records  ${run.error ?? ""}`);
    }
  }

  lines.push("");
  lines.push("[s] Sync  [Enter] Config  [q] Back");
  return lines.join("\n");
}

// --- Theme Screen ---

export interface ThemePreset {
  name: string;
  colors: {
    primary: string;
    bg: string;
    surface: string;
    muted: string;
    success: string;
    destructive: string;
  };
}

export const THEME_PRESETS: ThemePreset[] = [
  { name: "dark", colors: { primary: "#60a5fa", bg: "#0f172a", surface: "#1e293b", muted: "#64748b", success: "#22c55e", destructive: "#ef4444" } },
  { name: "light", colors: { primary: "#2563eb", bg: "#ffffff", surface: "#f1f5f9", muted: "#94a3b8", success: "#16a34a", destructive: "#dc2626" } },
  { name: "monokai", colors: { primary: "#f92672", bg: "#272822", surface: "#3e3d32", muted: "#75715e", success: "#a6e22e", destructive: "#f92672" } },
  { name: "solarized-dark", colors: { primary: "#268bd2", bg: "#002b36", surface: "#073642", muted: "#586e75", success: "#859900", destructive: "#dc322f" } },
  { name: "dracula", colors: { primary: "#bd93f9", bg: "#282a36", surface: "#44475a", muted: "#6272a4", success: "#50fa7b", destructive: "#ff5555" } },
];

export function cycleThemePreset(current: number): number {
  return (current + 1) % THEME_PRESETS.length;
}

export function renderThemeScreen(presetIndex: number): string {
  const preset = THEME_PRESETS[presetIndex]!;
  const lines: string[] = [
    "═══ Theme ═══",
    "",
    `  Active: ${preset.name}`,
    "",
    "─── Preview ───",
    `  primary:     ${preset.colors.primary}`,
    `  bg:          ${preset.colors.bg}`,
    `  surface:     ${preset.colors.surface}`,
    `  muted:       ${preset.colors.muted}`,
    `  success:     ${preset.colors.success}`,
    `  destructive: ${preset.colors.destructive}`,
    "",
    "[n] Next preset  [q] Back",
  ];
  return lines.join("\n");
}

// --- Secrets Screen ---

export function maskCredentialValue(_value: string): string {
  return "****";
}

export function renderSecretsScreen(credentials: CredentialRow[]): string {
  const lines: string[] = ["═══ Secrets ═══", ""];

  if (credentials.length === 0) {
    lines.push("  No secrets configured.");
  } else {
    for (const c of credentials) {
      lines.push(`  ${c.key}  ${maskCredentialValue(c.encrypted_value)}`);
    }
  }

  lines.push("");
  lines.push("[a] Add  [d] Delete  [q] Back");
  return lines.join("\n");
}

// --- Backups Screen ---

export interface BackupsState {
  lastBackupPath: string | null;
}

export function renderBackupsScreen(state: BackupsState): string {
  const lines: string[] = ["═══ Backups ═══", ""];

  if (state.lastBackupPath) {
    lines.push(`  Last backup: ${state.lastBackupPath}`);
  } else {
    lines.push("  No backups yet.");
  }

  lines.push("");
  lines.push("[b] Backup  [r] Restore  [q] Back");
  lines.push("");
  lines.push("Restore prompts: Confirm overwrite? [y/N]");
  return lines.join("\n");
}

// --- Doctor Screen ---

export interface DoctorCheckResult {
  subsystem: string;
  status: "pass" | "warn" | "fail";
  message: string;
  recoveryGuide?: string;
}

const STATUS_ICONS: Record<string, string> = {
  pass: "✓",
  warn: "⚠",
  fail: "✗",
};

export function renderDoctorScreen(checks: DoctorCheckResult[]): string {
  const lines: string[] = ["═══ Doctor ═══", ""];

  const hasRecovery = checks.some((c) => (c.status === "warn" || c.status === "fail") && c.recoveryGuide);

  for (const c of checks) {
    const icon = STATUS_ICONS[c.status];
    lines.push(`  ${icon} ${c.subsystem}: ${c.message}`);
  }

  const passCount = checks.filter((c) => c.status === "pass").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const failCount = checks.filter((c) => c.status === "fail").length;

  lines.push("");
  lines.push(`Pass: ${passCount}  Warn: ${warnCount}  Fail: ${failCount}`);

  if (hasRecovery) {
    lines.push("");
    lines.push("[Enter] Recovery guide  [q] Back");
  } else {
    lines.push("");
    lines.push("[q] Back");
  }

  return lines.join("\n");
}
