/**
 * Unit tests for web.tauri_build doctor check (P16 Issue #22).
 */

import { describe, expect, test } from "bun:test";
import {
  runWebDoctorChecks,
  buildDefaultWebDoctorConfig,
  type WebDoctorConfig,
} from "../../src/doctor/checks/web.ts";

describe("web.tauri_build check", () => {
  test("skips when desktop-app feature is OFF", async () => {
    const cfg: WebDoctorConfig = {
      ...buildDefaultWebDoctorConfig(),
      desktopAppEnabled: false,
    };
    const result = await runWebDoctorChecks(cfg);
    const check = result.checks.find((c) => c.name === "tauri_build");
    expect(check).toBeDefined();
    expect(check!.status).toBe("skip");
    expect(check!.message).toContain("desktop-app");
  });

  test("passes when flag ON and binary present", async () => {
    const cfg: WebDoctorConfig = {
      ...buildDefaultWebDoctorConfig(),
      desktopAppEnabled: true,
      checkTauriBinary: async () => ({ present: true, path: "/app/src-tauri/target/release/fulcrum" }),
    };
    const result = await runWebDoctorChecks(cfg);
    const check = result.checks.find((c) => c.name === "tauri_build");
    expect(check!.status).toBe("pass");
    expect(check!.message).toContain("fulcrum");
  });

  test("fails when flag ON but binary absent", async () => {
    const cfg: WebDoctorConfig = {
      ...buildDefaultWebDoctorConfig(),
      desktopAppEnabled: true,
      checkTauriBinary: async () => ({ present: false, path: null }),
    };
    const result = await runWebDoctorChecks(cfg);
    const check = result.checks.find((c) => c.name === "tauri_build");
    expect(check!.status).toBe("fail");
    expect(check!.recovery).toContain("tauri build");
  });

  test("fails when check throws", async () => {
    const cfg: WebDoctorConfig = {
      ...buildDefaultWebDoctorConfig(),
      desktopAppEnabled: true,
      checkTauriBinary: async () => { throw new Error("Rust toolchain not installed"); },
    };
    const result = await runWebDoctorChecks(cfg);
    const check = result.checks.find((c) => c.name === "tauri_build");
    expect(check!.status).toBe("fail");
    expect(check!.message).toContain("Rust toolchain not installed");
  });

  test("summary counts match checks", async () => {
    const cfg: WebDoctorConfig = {
      ...buildDefaultWebDoctorConfig(),
      desktopAppEnabled: false,
    };
    const result = await runWebDoctorChecks(cfg);
    const total = result.summary.pass + result.summary.warn + result.summary.fail + result.summary.skip;
    expect(total).toBe(result.checks.length);
  });
});
