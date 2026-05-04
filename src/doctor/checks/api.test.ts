import { describe, expect, test } from "bun:test";
import {
  runApiDoctorChecks,
  buildDefaultApiDoctorConfig,
  type ApiDoctorConfig,
  type DoctorApiCheck,
  type DoctorApiCheckEntry,
} from "./api.ts";

function findCheck(result: DoctorApiCheck, name: string): DoctorApiCheckEntry {
  const c = result.checks.find((c) => c.name === name || c.name.startsWith(name + ":"));
  if (!c) throw new Error(`check '${name}' not found in ${result.checks.map((c) => c.name).join(", ")}`);
  return c;
}

function findChecks(result: DoctorApiCheck, prefix: string): DoctorApiCheckEntry[] {
  return result.checks.filter((c) => c.name === prefix || c.name.startsWith(prefix + ":"));
}

// ---------------------------------------------------------------------------
// 1. trpc-router check
// ---------------------------------------------------------------------------

describe("trpc-router check", () => {
  test("passes on healthy in-process (<100ms)", async () => {
    const cfg: ApiDoctorConfig = {
      ...buildDefaultApiDoctorConfig(),
      checkTrpcRouter: async () => ({ ok: true, durationMs: 42 }),
    };
    const result = await runApiDoctorChecks(cfg);
    const c = findCheck(result, "trpc-router");
    expect(c.status).toBe("pass");
    expect(c.message).toContain("42ms");
  });

  test("warns when response >100ms", async () => {
    const cfg: ApiDoctorConfig = {
      ...buildDefaultApiDoctorConfig(),
      checkTrpcRouter: async () => ({ ok: true, durationMs: 150 }),
    };
    const result = await runApiDoctorChecks(cfg);
    expect(findCheck(result, "trpc-router").status).toBe("warn");
  });

  test("fails when appRouter import throws", async () => {
    const cfg: ApiDoctorConfig = {
      ...buildDefaultApiDoctorConfig(),
      checkTrpcRouter: async () => { throw new Error("Cannot resolve module"); },
    };
    const result = await runApiDoctorChecks(cfg);
    const c = findCheck(result, "trpc-router");
    expect(c.status).toBe("fail");
    expect(c.message).toContain("Cannot resolve module");
  });

  test("fails when no checkTrpcRouter provided", async () => {
    const result = await runApiDoctorChecks(buildDefaultApiDoctorConfig());
    expect(findCheck(result, "trpc-router").status).toBe("fail");
  });
});

// ---------------------------------------------------------------------------
// 2. zod-schemas check
// ---------------------------------------------------------------------------

describe("zod-schemas check", () => {
  test("passes when schemas compile", async () => {
    const cfg: ApiDoctorConfig = {
      ...buildDefaultApiDoctorConfig(),
      checkZodSchemas: async () => ({ ok: true }),
    };
    const result = await runApiDoctorChecks(cfg);
    expect(findCheck(result, "zod-schemas").status).toBe("pass");
  });

  test("fails when schemas don't compile", async () => {
    const cfg: ApiDoctorConfig = {
      ...buildDefaultApiDoctorConfig(),
      checkZodSchemas: async () => ({ ok: false, error: "ZodError: invalid_type" }),
    };
    const result = await runApiDoctorChecks(cfg);
    const c = findCheck(result, "zod-schemas");
    expect(c.status).toBe("fail");
    expect(c.message).toContain("ZodError");
  });
});

// ---------------------------------------------------------------------------
// 3. rest-surface check (public-api ON/OFF guard)
// ---------------------------------------------------------------------------

describe("rest-surface check", () => {
  test("skips when public-api OFF", async () => {
    const cfg: ApiDoctorConfig = {
      ...buildDefaultApiDoctorConfig(),
      publicApiEnabled: false,
    };
    const result = await runApiDoctorChecks(cfg);
    expect(findCheck(result, "rest-surface").status).toBe("skip");
  });

  test("passes when public-api ON and returns 200", async () => {
    const cfg: ApiDoctorConfig = {
      ...buildDefaultApiDoctorConfig(),
      publicApiEnabled: true,
      checkRestSurface: async () => ({ ok: true, status: 200 }),
    };
    const result = await runApiDoctorChecks(cfg);
    expect(findCheck(result, "rest-surface").status).toBe("pass");
  });

  test("fails when public-api ON but surface unreachable", async () => {
    const cfg: ApiDoctorConfig = {
      ...buildDefaultApiDoctorConfig(),
      publicApiEnabled: true,
      checkRestSurface: async () => ({ ok: false, status: 500, error: "Internal Server Error" }),
    };
    const result = await runApiDoctorChecks(cfg);
    expect(findCheck(result, "rest-surface").status).toBe("fail");
  });
});

// ---------------------------------------------------------------------------
// 4. webhook-dispatcher check (outbound-webhooks ON/OFF guard)
// ---------------------------------------------------------------------------

describe("webhook-dispatcher check", () => {
  test("skips when outbound-webhooks OFF", async () => {
    const cfg: ApiDoctorConfig = {
      ...buildDefaultApiDoctorConfig(),
      outboundWebhooksEnabled: false,
    };
    const result = await runApiDoctorChecks(cfg);
    expect(findCheck(result, "webhook-dispatcher").status).toBe("skip");
  });

  test("passes when outbound-webhooks ON and job registered", async () => {
    const cfg: ApiDoctorConfig = {
      ...buildDefaultApiDoctorConfig(),
      outboundWebhooksEnabled: true,
      checkWebhookDispatcher: async () => ({ ok: true }),
    };
    const result = await runApiDoctorChecks(cfg);
    expect(findCheck(result, "webhook-dispatcher").status).toBe("pass");
  });
});

// ---------------------------------------------------------------------------
// 5. pending-delivery-backlog check
// ---------------------------------------------------------------------------

describe("pending-delivery-backlog check", () => {
  test("101 retrying deliveries → warn", async () => {
    const cfg: ApiDoctorConfig = {
      ...buildDefaultApiDoctorConfig(),
      outboundWebhooksEnabled: true,
      getPendingDeliveryCount: async () => 101,
    };
    const result = await runApiDoctorChecks(cfg);
    const c = findCheck(result, "pending-delivery-backlog");
    expect(c.status).toBe("warn");
    expect(c.message).toContain("101");
  });

  test("1001 retrying deliveries → fail", async () => {
    const cfg: ApiDoctorConfig = {
      ...buildDefaultApiDoctorConfig(),
      outboundWebhooksEnabled: true,
      getPendingDeliveryCount: async () => 1001,
    };
    const result = await runApiDoctorChecks(cfg);
    const c = findCheck(result, "pending-delivery-backlog");
    expect(c.status).toBe("fail");
    expect(c.message).toContain("1001");
  });

  test("50 deliveries → pass", async () => {
    const cfg: ApiDoctorConfig = {
      ...buildDefaultApiDoctorConfig(),
      outboundWebhooksEnabled: true,
      getPendingDeliveryCount: async () => 50,
    };
    const result = await runApiDoctorChecks(cfg);
    expect(findCheck(result, "pending-delivery-backlog").status).toBe("pass");
  });

  test("skips when outbound-webhooks OFF", async () => {
    const cfg: ApiDoctorConfig = {
      ...buildDefaultApiDoctorConfig(),
      outboundWebhooksEnabled: false,
    };
    const result = await runApiDoctorChecks(cfg);
    expect(findCheck(result, "pending-delivery-backlog").status).toBe("skip");
  });
});

// ---------------------------------------------------------------------------
// 6. connector-reachability check
// ---------------------------------------------------------------------------

describe("connector-reachability check", () => {
  test("mock connector host down → fail", async () => {
    const cfg: ApiDoctorConfig = {
      ...buildDefaultApiDoctorConfig(),
      connectors: [{ id: "jira", healthUrl: "https://jira.example.com/health" }],
      checkConnectorReachability: async () => false,
    };
    const result = await runApiDoctorChecks(cfg);
    const c = findCheck(result, "connector-reachability");
    expect(c.status).toBe("fail");
    expect(c.name).toBe("connector-reachability:jira");
  });

  test("mock connector host up → pass", async () => {
    const cfg: ApiDoctorConfig = {
      ...buildDefaultApiDoctorConfig(),
      connectors: [{ id: "jira", healthUrl: "https://jira.example.com/health" }],
      checkConnectorReachability: async () => true,
    };
    const result = await runApiDoctorChecks(cfg);
    const c = findCheck(result, "connector-reachability");
    expect(c.status).toBe("pass");
  });

  test("skip when no connectors configured", async () => {
    const result = await runApiDoctorChecks(buildDefaultApiDoctorConfig());
    expect(findCheck(result, "connector-reachability").status).toBe("skip");
  });
});

// ---------------------------------------------------------------------------
// 7. connector-run-health check
// ---------------------------------------------------------------------------

describe("connector-run-health check", () => {
  test("last run error → fail", async () => {
    const cfg: ApiDoctorConfig = {
      ...buildDefaultApiDoctorConfig(),
      connectors: [{
        id: "github",
        healthUrl: "https://api.github.com",
        lastRunStatus: "error",
        lastSyncAt: new Date(),
      }],
      checkConnectorReachability: async () => true,
    };
    const result = await runApiDoctorChecks(cfg);
    const checks = findChecks(result, "connector-run-health");
    expect(checks[0]!.status).toBe("fail");
  });

  test("last_sync_at >24h ago → warn", async () => {
    const cfg: ApiDoctorConfig = {
      ...buildDefaultApiDoctorConfig(),
      connectors: [{
        id: "github",
        healthUrl: "https://api.github.com",
        lastRunStatus: "ok",
        lastSyncAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      }],
      checkConnectorReachability: async () => true,
    };
    const result = await runApiDoctorChecks(cfg);
    const checks = findChecks(result, "connector-run-health");
    expect(checks[0]!.status).toBe("warn");
  });

  test("healthy recent sync → pass", async () => {
    const cfg: ApiDoctorConfig = {
      ...buildDefaultApiDoctorConfig(),
      connectors: [{
        id: "github",
        healthUrl: "https://api.github.com",
        lastRunStatus: "ok",
        lastSyncAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
      }],
      checkConnectorReachability: async () => true,
    };
    const result = await runApiDoctorChecks(cfg);
    const checks = findChecks(result, "connector-run-health");
    expect(checks[0]!.status).toBe("pass");
  });

  test("skip when no connectors", async () => {
    const result = await runApiDoctorChecks(buildDefaultApiDoctorConfig());
    expect(findCheck(result, "connector-run-health").status).toBe("skip");
  });
});

// ---------------------------------------------------------------------------
// Integration: summary counts + all 7 check names present
// ---------------------------------------------------------------------------

describe("runApiDoctorChecks integration", () => {
  test("returns all 7 logical check groups", async () => {
    const result = await runApiDoctorChecks(buildDefaultApiDoctorConfig());
    expect(result.subsystem).toBe("api");
    const names = new Set(result.checks.map((c) => c.name.split(":")[0]));
    expect(names.has("trpc-router")).toBe(true);
    expect(names.has("zod-schemas")).toBe(true);
    expect(names.has("rest-surface")).toBe(true);
    expect(names.has("webhook-dispatcher")).toBe(true);
    expect(names.has("pending-delivery-backlog")).toBe(true);
    expect(names.has("connector-reachability")).toBe(true);
    expect(names.has("connector-run-health")).toBe(true);
  });

  test("summary counts match check statuses", async () => {
    const cfg: ApiDoctorConfig = {
      ...buildDefaultApiDoctorConfig(),
      publicApiEnabled: false,
      outboundWebhooksEnabled: false,
      checkTrpcRouter: async () => ({ ok: true, durationMs: 10 }),
      checkZodSchemas: async () => ({ ok: true }),
    };
    const result = await runApiDoctorChecks(cfg);
    const manual = { pass: 0, warn: 0, fail: 0, skip: 0 };
    for (const c of result.checks) manual[c.status]++;
    expect(result.summary).toEqual(manual);
  });

  test("DoctorApiCheck shape is JSON-serializable", async () => {
    const result = await runApiDoctorChecks(buildDefaultApiDoctorConfig());
    const json = JSON.parse(JSON.stringify(result));
    expect(json.subsystem).toBe("api");
    expect(Array.isArray(json.checks)).toBe(true);
    expect(typeof json.summary.pass).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// CLI integration: --subsystem api --json
// ---------------------------------------------------------------------------

describe("fulcrum doctor --subsystem api --json", () => {
  test("returns DoctorApiCheck shape via CLI", async () => {
    const proc = Bun.spawn(["bun", "src/index.ts", "doctor", "--subsystem", "api", "--json"], {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env },
    });
    const out = await new Response(proc.stdout).text();
    const code = await proc.exited;
    const parsed = JSON.parse(out);
    expect(parsed.subsystem).toBe("api");
    expect(Array.isArray(parsed.checks)).toBe(true);
    expect(typeof parsed.summary).toBe("object");
    // Non-zero exit when any check fails (trpc-router/zod-schemas will fail
    // because the modules aren't implemented yet)
    expect(code).not.toBe(0);
  });

  test("non-json output includes check statuses", async () => {
    const proc = Bun.spawn(["bun", "src/index.ts", "doctor", "--subsystem", "api"], {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env },
    });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    expect(out).toContain("trpc-router");
    expect(out).toContain("api subsystem");
  });
});
