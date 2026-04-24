import { describe, expect, it } from "vitest";
import { PlaneApiAdapter, SimulatedPlaneAdapter } from "@fulcrum/plane";

describe("Plane adapter certification boundary", () => {
  it("labels simulated mode as test-only while live mode checks credentials and connectivity", async () => {
    const simulated = new SimulatedPlaneAdapter([]);
    const liveOk = new PlaneApiAdapter({
      baseUrl: "https://plane.test",
      token: "token",
      fetchImpl: async () => new Response("{}", { status: 200 })
    });
    const liveDenied = new PlaneApiAdapter({
      baseUrl: "https://plane.test",
      token: "token",
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
});
