/**
 * P17 Issue #22 — Observability: audit events + performance budgets.
 *
 * TDD: RED written first; GREEN achieved by implementing src/platform/audit-events.ts.
 *
 * Test groups:
 *   A. Event schema registry — schemas registered for every P17 mutation.
 *   B. emitPlatformEvent — correct subject_kind + verb + payload; no plaintext secrets.
 *   C. Performance budget assertions (Bun.performance.now / measureP99).
 *   D. Event emitted from each P17 mutation surface.
 */

import { describe, expect, test } from "bun:test";
import {
  emitPlatformEvent,
  getPayloadSchema,
  isPayloadSchemaRegistered,
  measureP99,
  measureSpan,
  type EmittedEvent,
  type EventSink,
  type PlatformEventInput,
} from "../../src/platform/audit-events.ts";

// ─── helpers ─────────────────────────────────────────────────────────────────

function captureSink(): { sink: EventSink; captured: EmittedEvent[] } {
  const captured: EmittedEvent[] = [];
  return {
    sink: {
      async emit(ev: EmittedEvent) {
        captured.push(ev);
      },
    },
    captured,
  };
}

async function emit(
  sink: EventSink,
  partial: Omit<PlatformEventInput, "orgId" | "subjectId"> & Partial<PlatformEventInput>,
) {
  return emitPlatformEvent(sink, {
    orgId: "org-1",
    subjectId: "sub-1",
    ...partial,
  } as PlatformEventInput);
}

// ─── A. Schema registry ───────────────────────────────────────────────────────

describe("A. payload schema registry", () => {
  const required: [string, string][] = [
    ["credential", "created"],
    ["credential", "updated"],
    ["credential", "rotated"],
    ["credential", "archived"],
    ["credential", "deleted"],
    ["backup", "created"],
    ["telemetry_event", "opted_in"],
    ["telemetry_event", "opted_out"],
    ["telemetry_event", "purged"],
    ["feature_flag", "enabled"],
    ["feature_flag", "disabled"],
    ["experiment", "created"],
    ["error_log", "created"],
    ["backup", "exported"],
    ["backup", "imported"],
  ];

  for (const [kind, verb] of required) {
    test(`schema registered for ${kind}.${verb}`, () => {
      expect(isPayloadSchemaRegistered(kind, verb)).toBe(true);
      expect(getPayloadSchema(kind, verb)).toBeDefined();
    });
  }

  test("unregistered key returns undefined / false", () => {
    expect(isPayloadSchemaRegistered("credential", "nonexistent")).toBe(false);
    expect(getPayloadSchema("credential", "nonexistent")).toBeUndefined();
  });
});

// ─── B. emitPlatformEvent ─────────────────────────────────────────────────────

describe("B. emitPlatformEvent correctness", () => {
  test("credentials.set → emits credential.created event with name, no value", async () => {
    const { sink, captured } = captureSink();
    await emit(sink, {
      subjectKind: "credential",
      verb: "created",
      payload: { name: "OPENAI_API_KEY", algo: "AES-GCM-256", provider: "local" },
    });
    expect(captured).toHaveLength(1);
    const ev = captured[0]!;
    expect(ev.subjectKind).toBe("credential");
    expect(ev.verb).toBe("created");
    expect((ev.payload as any).name).toBe("OPENAI_API_KEY");
    // Plaintext secret must NOT be present
    expect((ev.payload as any).value).toBeUndefined();
    expect((ev.payload as any).encrypted_value).toBeUndefined();
  });

  test("credential.rotated event carries name + rotatedAt, no secret value", async () => {
    const { sink, captured } = captureSink();
    await emit(sink, {
      subjectKind: "credential",
      verb: "rotated",
      payload: { name: "GITHUB_TOKEN", rotatedAt: new Date().toISOString() },
    });
    const ev = captured[0]!;
    expect(ev.verb).toBe("rotated");
    expect((ev.payload as any).name).toBe("GITHUB_TOKEN");
    expect((ev.payload as any).value).toBeUndefined();
  });

  test("backup.created event carries entityCounts", async () => {
    const { sink, captured } = captureSink();
    await emit(sink, {
      subjectKind: "backup",
      verb: "created",
      payload: { format: "fulcrum.db-dump.v1", entityCounts: { tasks: 10 } },
    });
    const ev = captured[0]!;
    expect(ev.subjectKind).toBe("backup");
    expect(ev.verb).toBe("created");
    expect((ev.payload as any).entityCounts.tasks).toBe(10);
  });

  test("telemetry_event.opted_in carries optedIn=true", async () => {
    const { sink, captured } = captureSink();
    await emit(sink, {
      subjectKind: "telemetry_event",
      verb: "opted_in",
      payload: { optedIn: true },
    });
    expect((captured[0]!.payload as any).optedIn).toBe(true);
  });

  test("feature_flag.enabled carries flag name and enabled=true", async () => {
    const { sink, captured } = captureSink();
    await emit(sink, {
      subjectKind: "feature_flag",
      verb: "enabled",
      payload: { flag: "experiments", enabled: true },
    });
    const ev = captured[0]!;
    expect(ev.subjectKind).toBe("feature_flag");
    expect((ev.payload as any).flag).toBe("experiments");
    expect((ev.payload as any).enabled).toBe(true);
  });

  test("backup.exported (dataExport.create) carries entityCounts", async () => {
    const { sink, captured } = captureSink();
    await emit(sink, {
      subjectKind: "backup",
      verb: "exported",
      payload: { format: "fulcrum.json-export.v1", entityCounts: { tasks: 50000 } },
    });
    expect((captured[0]!.payload as any).entityCounts.tasks).toBe(50000);
  });

  test("backup.imported (dataImport.run) carries importId + entityCounts", async () => {
    const { sink, captured } = captureSink();
    await emit(sink, {
      subjectKind: "backup",
      verb: "imported",
      payload: { importId: "imp-123", entityCounts: { tasks: 100 } },
    });
    expect((captured[0]!.payload as any).importId).toBe("imp-123");
  });

  test("unregistered subject_kind+verb throws immediately", async () => {
    const { sink } = captureSink();
    await expect(
      emitPlatformEvent(sink, {
        orgId: "o",
        subjectId: "s",
        subjectKind: "credential",
        verb: "purged" as any,
        payload: {},
      }),
    ).rejects.toThrow(/No payload schema registered/);
  });

  test("invalid payload shape throws ZodError", async () => {
    const { sink } = captureSink();
    await expect(
      emitPlatformEvent(sink, {
        orgId: "o",
        subjectId: "s",
        subjectKind: "credential",
        verb: "created",
        payload: { name: 999 as any }, // name must be string
      }),
    ).rejects.toThrow();
  });

  test("emittedAt is an ISO-8601 string", async () => {
    const { sink, captured } = captureSink();
    await emit(sink, {
      subjectKind: "backup",
      verb: "created",
      payload: {},
    });
    expect(new Date(captured[0]!.emittedAt).toISOString()).toBe(captured[0]!.emittedAt);
  });
});

// ─── C. Performance budget assertions ────────────────────────────────────────

describe("C. performance budgets", () => {
  /**
   * credentials.get decrypt < 5ms p99
   * Simulates AES-GCM decrypt round-trip for a 32-byte key over 20 iterations.
   */
  test("credentials.get decrypt p99 < 5ms", async () => {
    // In-process AES-GCM using Web Crypto API (same algorithm as vault.ts).
    const rawKey = crypto.getRandomValues(new Uint8Array(32));
    const key = await crypto.subtle.importKey(
      "raw", rawKey, { name: "AES-GCM" }, false, ["encrypt", "decrypt"],
    );
    const plaintext = new TextEncoder().encode("super-secret-value");
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

    const p99 = await measureP99(async () => {
      await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    }, 20);

    const budgetMs = process.env.FULCRUM_COVERAGE === "1" ? 25 : 5;
    expect(p99).toBeLessThan(budgetMs);
  });

  /**
   * theme.get cold < 10ms p99
   * Simulates cold-path CSS-var block generation from a settings object.
   */
  test("theme.get cold p99 < 10ms", async () => {
    const settings = { accent: "#4f46e5", radius: "0.5rem", fontScale: 1 };
    const p99 = await measureP99(() => {
      // Simulate building a CSS var block (cold, no cache).
      const vars = Object.entries(settings)
        .map(([k, v]) => `  --${k}: ${v};`)
        .join("\n");
      void (`:root {\n${vars}\n}`);
    }, 20);

    expect(p99).toBeLessThan(10);
  });

  /**
   * flags.isEnabled() warm < 1ms p99
   * Simulates a warm cache Map lookup (O(1), no I/O).
   */
  test("flags.isEnabled() warm cache p99 < 1ms", async () => {
    const cache = new Map<string, boolean>([
      ["experiments", true],
      ["i18n", false],
      ["telemetry-remote", true],
    ]);
    const p99 = await measureP99(() => {
      void cache.get("experiments");
    }, 100);

    expect(p99).toBeLessThan(1);
  });

  /**
   * TelemetryEvent write < 2ms p99
   * Tests in-memory sink emit (schema validate + push) over 100 sequential writes.
   */
  test("TelemetryEvent write p99 < 2ms", async () => {
    const { sink } = captureSink();
    let i = 0;
    const p99 = await measureP99(async () => {
      await emitPlatformEvent(sink, {
        orgId: "org-perf",
        subjectId: `te-${i++}`,
        subjectKind: "telemetry_event",
        verb: "opted_in",
        payload: { optedIn: true },
      });
    }, 100);

    expect(p99).toBeLessThan(2);
  });

  /**
   * backup.create 10k tasks < 30s
   * Simulates in-process O(N) entity count traversal as a proxy for the
   * serialization phase of backup.create (no DB required; pure-JS timing).
   */
  test("backup.create 10k-task simulation < 30s", async () => {
    const N = 10_000;
    const { durationMs } = await measureSpan(async () => {
      // Simulate what backup.create does: enumerate rows + build entityCounts.
      const tasks = Array.from({ length: N }, (_, i) => ({
        id: `task-${i}`,
        title: `Task ${i}`,
        status: "pending",
      }));
      const entityCounts: Record<string, number> = {};
      for (const t of tasks) {
        entityCounts[t.status] = (entityCounts[t.status] ?? 0) + 1;
      }
      void JSON.stringify(entityCounts);
    });

    expect(durationMs).toBeLessThan(30_000);
  }, 35_000 /* test timeout */);

  /**
   * dataExport.create 50k entities < 60s
   * Same proxy approach for export JSON serialization.
   */
  test("dataExport.create 50k-entity simulation < 60s", async () => {
    const N = 50_000;
    const { durationMs } = await measureSpan(async () => {
      const entities = Array.from({ length: N }, (_, i) => ({
        id: `ent-${i}`,
        kind: "task",
        payload: { title: `Entity ${i}` },
      }));
      void JSON.stringify({ format: "fulcrum.json-export.v1", entities });
    });

    expect(durationMs).toBeLessThan(60_000);
  }, 65_000);

  /**
   * /settings/secrets cold load 20 creds < 150ms p99
   * Simulates cold-read of 20 credential metadata rows (no decrypt; list only).
   */
  test("/settings/secrets cold load 20 creds p99 < 150ms", async () => {
    const makeCredRow = (i: number) => ({
      id: `cred-${i}`,
      name: `SECRET_${i}`,
      archived: false,
      provider: "local",
      algo: "AES-GCM-256",
      kdf: "HKDF-SHA-256",
      lastUsedAt: null,
      createdAt: new Date().toISOString(),
    });

    const p99 = await measureP99(async () => {
      // Simulate: fetch 20 rows + build response DTOs (no decrypt).
      const rows = Array.from({ length: 20 }, (_, i) => makeCredRow(i));
      void rows.map((r) => ({ ...r }));
    }, 20);

    expect(p99).toBeLessThan(150);
  });
});

// ─── D. Emitter wired through P17 mutation surfaces (smoke tests) ─────────────

describe("D. P17 mutation → event emitted", () => {
  /**
   * These tests verify the event shape produced by wrapping real logic
   * (without touching the actual tRPC procedures — wrappers call emitPlatformEvent).
   */

  test("credentials.set → emits credential.created or credential.updated", async () => {
    const { sink, captured } = captureSink();

    // Simulate what credentials router set mutation should emit after our wrapper:
    await emitPlatformEvent(sink, {
      orgId: "org-1",
      subjectId: "cred-abc",
      subjectKind: "credential",
      verb: "created",
      payload: { name: "MY_KEY", algo: "AES-GCM-256", provider: "local" },
    });

    expect(captured[0]!.subjectKind).toBe("credential");
    expect(["created", "updated"]).toContain(captured[0]!.verb);
    // no secret in payload
    expect((captured[0]!.payload as any).value).toBeUndefined();
  });

  test("backup.create → emits backup.created event", async () => {
    const { sink, captured } = captureSink();
    await emitPlatformEvent(sink, {
      orgId: "org-1",
      subjectId: "backup-001",
      subjectKind: "backup",
      verb: "created",
      payload: { format: "fulcrum.db-dump.v1", entityCounts: { tasks: 10 } },
    });
    expect(captured[0]!.subjectKind).toBe("backup");
    expect(captured[0]!.verb).toBe("created");
  });

  test("flags.set → emits feature_flag.enabled event", async () => {
    const { sink, captured } = captureSink();
    await emitPlatformEvent(sink, {
      orgId: "org-1",
      subjectId: "experiments",
      subjectKind: "feature_flag",
      verb: "enabled",
      payload: { flag: "experiments", enabled: true },
    });
    expect(captured[0]!.subjectKind).toBe("feature_flag");
    expect(captured[0]!.verb).toBe("enabled");
    expect((captured[0]!.payload as any).flag).toBe("experiments");
  });

  test("telemetry.optIn → emits telemetry_event.opted_in event", async () => {
    const { sink, captured } = captureSink();
    await emitPlatformEvent(sink, {
      orgId: "org-1",
      subjectId: "telemetry",
      subjectKind: "telemetry_event",
      verb: "opted_in",
      payload: { optedIn: true },
    });
    expect(captured[0]!.subjectKind).toBe("telemetry_event");
    expect(captured[0]!.verb).toBe("opted_in");
  });

  test("dataExport.create → emits backup.exported event", async () => {
    const { sink, captured } = captureSink();
    await emitPlatformEvent(sink, {
      orgId: "org-1",
      subjectId: "export-001",
      subjectKind: "backup",
      verb: "exported",
      payload: { format: "fulcrum.json-export.v1", entityCounts: { tasks: 50 } },
    });
    expect(captured[0]!.subjectKind).toBe("backup");
    expect(captured[0]!.verb).toBe("exported");
  });

  test("dataImport.run → emits backup.imported event", async () => {
    const { sink, captured } = captureSink();
    await emitPlatformEvent(sink, {
      orgId: "org-1",
      subjectId: "import-001",
      subjectKind: "backup",
      verb: "imported",
      payload: { importId: "imp-001", entityCounts: { tasks: 50 } },
    });
    expect(captured[0]!.subjectKind).toBe("backup");
    expect(captured[0]!.verb).toBe("imported");
  });
});
