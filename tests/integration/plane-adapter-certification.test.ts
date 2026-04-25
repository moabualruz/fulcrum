import { describe, expect, it } from "vitest";
import { PlaneApiAdapter } from "@fulcrum/plane";
import { SimulatedPlaneAdapter } from "../../packages/plane/src/simulated-adapter.js";

describe("Plane adapter certification boundary", () => {
  it("labels simulated mode as test-only while live mode checks credentials and connectivity", async () => {
    const simulated = new SimulatedPlaneAdapter([]);
    const liveOk = new PlaneApiAdapter({
      baseUrl: "https://plane.test",
      workspaceSlug: "team",
      projectId: "proj-id",
      apiKey: "token",
      fetchImpl: async () => new Response("{}", { status: 200 })
    });
    const liveDenied = new PlaneApiAdapter({
      baseUrl: "https://plane.test",
      workspaceSlug: "team",
      projectId: "proj-id",
      apiKey: "token",
      fetchImpl: async () => new Response("denied", { status: 401 })
    });

    const simulatedHealth = await simulated.healthCheck();
    const liveOkHealth = await liveOk.healthCheck();
    const liveDeniedHealth = await liveDenied.healthCheck();

    expect(simulated.metadata.name).toContain("Simulated");
    expect(simulatedHealth.cause).toContain("Simulated Plane adapter");
    expect(liveOkHealth).toMatchObject({
      state: "detected",
      privacyStatus: "operator_configured"
    });
    expect(liveDeniedHealth).toMatchObject({
      state: "degraded",
      nextAction: "Check Plane base URL, token, and workspace permissions."
    });
  });

  it("imports and writes back through Plane work-item API endpoints", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const adapter = new PlaneApiAdapter({
      baseUrl: "https://api.plane.so",
      workspaceSlug: "my-team",
      projectId: "project-uuid",
      apiKey: "plane-key",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init });
        if (init?.method === "PATCH") return new Response("{}", { status: 200 });
        if (init?.method === "POST") return new Response("{}", { status: 201 });
        return Response.json({
          results: [
            {
              id: "work-item-uuid",
              name: "Implement API",
              description_stripped: "Use Plane docs",
              state_detail: { name: "In Progress" },
              updated_at: "2026-01-01T00:00:00Z"
            }
          ]
        });
      }
    });

    const items = await adapter.importWorkItems();
    await adapter.writeback(
      { externalId: "work-item-uuid", comment: "Ready <review>", status: "state-uuid" },
      "policy-1"
    );

    expect(items[0]).toMatchObject({
      externalId: "work-item-uuid",
      title: "Implement API",
      body: "Use Plane docs",
      status: "In Progress"
    });
    expect(calls.map((call) => call.url)).toEqual([
      "https://api.plane.so/api/v1/workspaces/my-team/projects/project-uuid/work-items/",
      "https://api.plane.so/api/v1/workspaces/my-team/projects/project-uuid/work-items/work-item-uuid/",
      "https://api.plane.so/api/v1/workspaces/my-team/projects/project-uuid/work-items/work-item-uuid/comments/"
    ]);
    expect(calls[0]?.init?.headers).toMatchObject({ "X-API-Key": "plane-key" });
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ state: "state-uuid" });
    expect(JSON.parse(String(calls[2]?.init?.body))).toMatchObject({
      comment_html: "<p>Ready &lt;review&gt;</p>",
      external_source: "fulcrum",
      external_id: "policy-1"
    });
  });

  it("rejects unknown Plane adapter operations instead of falling back to import", async () => {
    const live = new PlaneApiAdapter({
      baseUrl: "https://plane.test",
      workspaceSlug: "team",
      projectId: "proj-id",
      apiKey: "token",
      fetchImpl: async () => {
        throw new Error("unexpected network call");
      }
    });
    const simulated = new SimulatedPlaneAdapter([]);

    await expect(live.preview("typo", {})).rejects.toThrow("Unsupported Plane operation");
    await expect(live.execute("typo", {})).rejects.toThrow("Unsupported Plane operation");
    await expect(simulated.preview("typo", {})).rejects.toThrow("Unsupported Plane operation");
    await expect(simulated.execute("typo", {})).rejects.toThrow("Unsupported Plane operation");
  });
});
