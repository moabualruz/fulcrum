import { describe, expect, test } from "bun:test";
import { formatConnectorsList, formatConnectorRuns } from "./connectors.ts";
import type { ConnectorRunSummary } from "./connectors.ts";

type ConnectorRunFixture = ConnectorRunSummary & {
  org_id: string;
  ended_at: string | null;
};

describe("connectors CLI formatters", () => {
  test("formatConnectorsList --json", () => {
    const connectors = [
      { kind: "github", enabled: true, lastSyncAt: "2026-05-01T00:00:00Z" },
      { kind: "jira", enabled: false, lastSyncAt: null },
    ];
    const json = JSON.parse(formatConnectorsList(connectors, true));
    expect(json).toEqual(connectors);
  });

  test("formatConnectorsList text", () => {
    const connectors = [
      { kind: "github", enabled: true, lastSyncAt: "2026-05-01T00:00:00Z" },
    ];
    const text = formatConnectorsList(connectors, false);
    expect(text).toContain("github");
    expect(text).toContain("ON");
  });

  test("formatConnectorRuns --json", () => {
    const runs: ConnectorRunFixture[] = [
      { id: "r1", org_id: "o1", kind: "github", status: "succeeded", started_at: "2026-05-01", ended_at: "2026-05-01", error: null, records_synced: 5 },
    ];
    const json = JSON.parse(formatConnectorRuns(runs, true));
    expect(json.length).toBe(1);
    expect(json[0].status).toBe("succeeded");
  });

  test("formatConnectorRuns text", () => {
    const runs: ConnectorRunFixture[] = [
      { id: "r1", org_id: "o1", kind: "github", status: "failed", started_at: "2026-05-01", ended_at: "2026-05-01", error: "timeout", records_synced: 0 },
    ];
    const text = formatConnectorRuns(runs, false);
    expect(text).toContain("failed");
    expect(text).toContain("timeout");
  });
});
