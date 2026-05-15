/**
 * Doctor check for secrets.keyring.
 *
 * Acceptance:
 *   - native available → status='pass', detail='os'
 *   - fallback only   → status='warn', detail='degraded' (per spec: never 'fail')
 *   - keyring totally broken → still status='warn' (degraded), not 'fail'
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { keyringHealthCheck } from "@platform-core/application/secrets/doctor-checks.ts";
import type { NativeKeyringAdapter } from "@platform-core/application/secrets/keyring.ts";

let stateDir: string;

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "fulcrum-cred-doctor-"));
});

afterEach(() => {
  rmSync(stateDir, { recursive: true, force: true });
});

function workingNative(): NativeKeyringAdapter {
  const m = new Map<string, string>();
  return {
    async getPassword(s, a) {
      return m.get(`${s}:${a}`) ?? null;
    },
    async setPassword(s, a, p) {
      m.set(`${s}:${a}`, p);
    },
  };
}

describe("secrets.keyring doctor check", () => {
  it("native adapter present → pass", async () => {
    const r = await keyringHealthCheck({ stateDir, native: workingNative() });
    expect(r.check).toBe("secrets.keyring");
    expect(r.status).toBe("pass");
    expect(r.detail).toContain("os");
  });

  it("no native adapter (fallback file) → warn (degraded)", async () => {
    const r = await keyringHealthCheck({ stateDir, native: null });
    expect(r.status).toBe("warn");
    expect(r.detail).toContain("degraded");
  });

  it("native adapter throws → warn (degraded), not fail", async () => {
    const broken: NativeKeyringAdapter = {
      async getPassword() {
        throw new Error("native build failed");
      },
      async setPassword() {
        throw new Error("native build failed");
      },
    };
    const r = await keyringHealthCheck({ stateDir, native: broken });
    expect(r.status).toBe("warn");
    expect(r.status).not.toBe("fail");
  });
});
