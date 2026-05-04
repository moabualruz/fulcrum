import { describe, expect, it } from "bun:test";

import {
  ConnectorRegistry,
  FeatureDisabledError,
  type ConnectorAdapter,
  type ConnectorKind,
  type HealthStatus,
  type SyncItem,
  type SyncResult,
} from "../../src/connectors/index.ts";

function adapter(kind: ConnectorKind, events: string[] = []): ConnectorAdapter {
  return {
    kind,
    async connect() {
      events.push(`connect:${kind}`);
    },
    async disconnect() {
      events.push(`disconnect:${kind}`);
    },
    async pull(): Promise<SyncResult> {
      events.push(`pull:${kind}`);
      return { pulled: 1, pushed: 0, skipped: 0, errors: [] };
    },
    async push(items: SyncItem[]): Promise<SyncResult> {
      events.push(`push:${kind}:${items.length}`);
      return { pulled: 0, pushed: items.length, skipped: 0, errors: [] };
    },
    async healthCheck(): Promise<HealthStatus> {
      events.push(`health:${kind}`);
      return { ok: true };
    },
  };
}

describe("ConnectorRegistry", () => {
  it("registers, looks up, and lists connectors by kind", () => {
    const registry = new ConnectorRegistry();
    const linear = adapter("linear");
    const jira = adapter("jira");

    registry.register(linear);
    registry.register(jira);

    expect(registry.lookup("linear")).toBe(linear);
    expect(registry.lookup("jira")).toBe(jira);
    expect(registry.lookup("github-issues")).toBeNull();
    expect(registry.list().map((entry) => entry.kind)).toEqual(["jira", "linear"]);
  });

  it("rejects duplicate connector registrations", () => {
    const registry = new ConnectorRegistry();

    registry.register(adapter("linear"));

    expect(() => registry.register(adapter("linear"))).toThrow("connector already registered: linear");
  });

  it("runs connect, sync, health, and disconnect lifecycle hooks", async () => {
    const events: string[] = [];
    const registry = new ConnectorRegistry();
    registry.register(adapter("linear", events));

    await registry.connect("linear");
    const pullResult = await registry.pull("linear");
    const pushResult = await registry.push("linear", [{ externalId: "lin-1", data: { title: "Task" } }]);
    const health = await registry.healthCheck("linear");
    await registry.disconnect("linear");

    expect(pullResult).toEqual({ pulled: 1, pushed: 0, skipped: 0, errors: [] });
    expect(pushResult).toEqual({ pulled: 0, pushed: 1, skipped: 0, errors: [] });
    expect(health).toEqual({ ok: true });
    expect(events).toEqual([
      "connect:linear",
      "pull:linear",
      "push:linear:1",
      "health:linear",
      "disconnect:linear",
    ]);
  });

  it("tears down connected connectors in reverse registration order", async () => {
    const events: string[] = [];
    const registry = new ConnectorRegistry();
    registry.register(adapter("linear", events));
    registry.register(adapter("jira", events));

    await registry.connectAll();
    await registry.disconnectAll();

    expect(events).toEqual([
      "connect:linear",
      "connect:jira",
      "disconnect:jira",
      "disconnect:linear",
    ]);
  });

  it("throws FeatureDisabledError when connector flag is off", async () => {
    const registry = new ConnectorRegistry({
      isFeatureEnabled: async (kind) => kind !== "jira",
    });
    registry.register(adapter("jira"));

    await expect(registry.enable("jira", { orgId: "org-1" })).rejects.toBeInstanceOf(FeatureDisabledError);
    await expect(registry.enable("jira", { orgId: "org-1" })).rejects.toMatchObject({
      flag: "connector-jira",
      kind: "jira",
    });
  });

  it("throws FeatureDisabledError for Confluence and Notion flags when off", async () => {
    const registry = new ConnectorRegistry({
      isFeatureEnabled: async () => false,
    });
    registry.register(adapter("confluence"));
    registry.register(adapter("notion"));

    await expect(registry.enable("confluence", { orgId: "org-1" })).rejects.toMatchObject({
      flag: "connector-confluence",
      kind: "confluence",
    });
    await expect(registry.enable("notion", { orgId: "org-1" })).rejects.toMatchObject({
      flag: "connector-notion",
      kind: "notion",
    });
  });

  it("throws FeatureDisabledError for GitLab and Bitbucket flags when off", async () => {
    const registry = new ConnectorRegistry({
      isFeatureEnabled: async () => false,
    });
    registry.register(adapter("gitlab"));
    registry.register(adapter("bitbucket"));

    await expect(registry.enable("gitlab", { orgId: "org-1" })).rejects.toMatchObject({
      flag: "connector-gitlab",
      kind: "gitlab",
    });
    await expect(registry.enable("bitbucket", { orgId: "org-1" })).rejects.toMatchObject({
      flag: "connector-bitbucket",
      kind: "bitbucket",
    });
  });

  it("enables connector when connector flag is on", async () => {
    const registry = new ConnectorRegistry({
      isFeatureEnabled: async () => true,
    });
    registry.register(adapter("linear"));

    const state = await registry.enable("linear", { orgId: "org-1", name: "Linear" });

    expect(state).toEqual({
      orgId: "org-1",
      kind: "linear",
      name: "Linear",
      enabled: true,
    });
  });
});
