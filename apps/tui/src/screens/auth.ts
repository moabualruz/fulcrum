/**
 * TUI Auth screen — Settings → Auth
 *
 * Renders:
 *   - Current user email, org name, role
 *   - Passkey enrollment status (stub: N passkeys enrolled)
 *   - "Enroll passkey" action hint
 *   - Active auth providers list when saas-auth flag ON
 *
 * Keybindings:
 *   - q  → exit screen
 *
 * Design: headless-testable. Receives pre-resolved data via AuthScreenProps.
 * In production, TuiApp resolves data via in-process tRPC caller before
 * mounting this screen.
 */

import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthInfo {
  userId: string;
  orgId: string;
  email: string | null;
  role: string | null;
  passkeyCount?: number;
  orgName?: string;
  saasAuthEnabled?: boolean;
  authProviders?: string[];
  sessions?: Array<{
    id: string;
    deviceType: string;
    browser: string;
    ipAddress: string | null;
    lastActiveAt: string;
    isCurrent: boolean;
  }>;
}

export interface AuthScreenOptions {
  onExit?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// AuthScreen
// ─────────────────────────────────────────────────────────────────────────────

export class AuthScreen {
  constructor(
    private readonly renderer: Renderer,
    private readonly info: AuthInfo,
    private readonly opts: AuthScreenOptions = {},
  ) {}

  /** Render the auth screen to the output. */
  render(): void {
    const r = this.renderer;
    const info = this.info;

    r.writeln();
    r.writeln(c.bold("  Settings › Auth"));
    r.separator();
    r.writeln();

    r.infoRow("User Email", info.email ?? "(not set)");
    r.infoRow("User ID", info.userId);
    r.infoRow("Org", info.orgName ?? info.orgId);
    r.infoRow("Role", info.role ?? "(unknown)");
    r.writeln();

    const passkeyCount = info.passkeyCount ?? 0;
    const passkeyStr = passkeyCount === 1
      ? "1 passkey enrolled"
      : `${passkeyCount} passkeys enrolled`;
    r.infoRow("Passkeys", c.green(passkeyStr));
    r.writeln();

    r.writeln(c.dim("  Press [e] to enroll a new passkey (opens browser)"));
    r.writeln();

    if (info.saasAuthEnabled && info.authProviders && info.authProviders.length > 0) {
      r.writeln(c.bold("  Active Auth Providers"));
      r.separator("·");
      for (const provider of info.authProviders) {
        r.writeln(`    • ${provider}`);
      }
      r.writeln();
    }

    if (info.sessions && info.sessions.length > 0) {
      r.writeln(c.bold("  Login Sessions"));
      r.separator("·");
      for (const session of info.sessions) {
        const marker = session.isCurrent ? " current" : "";
        r.writeln(`    ${session.deviceType} ${session.browser}${marker}  ${session.ipAddress ?? "private"}  ${session.lastActiveAt}`);
      }
      r.writeln(c.dim("  Use CLI: fulcrum auth revoke-session <id> or revoke-other-sessions"));
      r.writeln();
    }

    r.writeln(c.dim("  Press [q] to go back"));
  }

  /** Handle a keypress event. Returns true if the key was consumed. */
  handleKey(key: string): boolean {
    if (key === "q" || key === "\x1b") {
      this.opts.onExit?.();
      return true;
    }
    if (key === "e") {
      // enroll passkey — stub: emit hint (real passkey URL from slice 13)
      this.renderer.writeln(c.cyan("  Opening browser for passkey enrollment..."));
      return true;
    }
    return false;
  }
}
