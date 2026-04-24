import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applySetup, buildSetupDoctorReport } from "@fulcrum/core";
import { migrate, openDatabase } from "@fulcrum/db";
import type { SetupState } from "@fulcrum/shared";

describe("setup and doctor flow", () => {
  it("initializes local directories, delegates SQLite setup, and reports doctor state", async () => {
    const root = await mkdir(path.join(os.tmpdir(), `fulcrum-us1-${Date.now()}`), {
      recursive: true
    });
    let savedState: SetupState | undefined;
    let initializedDbPath: string | undefined;

    const state = await applySetup(
      {
        setupRepository: {
          save: (setupState) => {
            savedState = setupState;
            return setupState;
          },
          getLatest: () => savedState
        },
        initializeDatabase: async (dbPath) => {
          initializedDbPath = dbPath;
          const db = openDatabase(dbPath);
          migrate(db, path.join(process.cwd(), "packages/db/migrations"));
          db.close();
        }
      },
      root
    );

    expect(state.status).toBe("applied");
    expect(savedState?.setupId).toBe(state.setupId);
    expect(initializedDbPath).toBe(path.join(root, "fulcrum.sqlite"));
    expect(buildSetupDoctorReport({ setupState: state, noNetwork: true }).blockingCount).toBe(0);
  });
});
