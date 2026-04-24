import type { Hono } from "hono";
import type { PolicyEnforcementService } from "@fulcrum/core";
import { PolicyCheckRequestSchema } from "@fulcrum/shared";

export function registerPolicyRoutes(app: Hono, policy: PolicyEnforcementService): void {
  app.get("/api/v1/queues/policy", (c) => {
    return c.json({ schemaVersion: "1.0", status: "ok", data: policy.listPending() });
  });

  app.post("/api/v1/policy/check", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = PolicyCheckRequestSchema.safeParse({
      ...body,
      requester: body.requester ?? "operator",
      preview: body.preview ?? true,
      localOnly: body.localOnly ?? false
    });
    if (!parsed.success) {
      return c.json(
        {
          schemaVersion: "1.0",
          status: "error",
          error: {
            code: "INVALID_POLICY_REQUEST",
            message: parsed.error.message,
            actionable: true,
            redactionStatus: "not_applicable"
          }
        },
        400
      );
    }
    const result = policy.check(parsed.data);
    const status = result.decision.status === "approval_required" ? 202 : 200;
    return c.json({ schemaVersion: "1.0", status: "ok", data: result.decision }, status);
  });

  app.post("/api/v1/policy/:decisionId/approve", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { approvedBy?: string };
    try {
      const decision = policy.approve(c.req.param("decisionId"), body.approvedBy ?? "operator");
      return c.json({ schemaVersion: "1.0", status: "ok", data: decision });
    } catch (error) {
      return c.json(
        {
          schemaVersion: "1.0",
          status: "error",
          error: {
            code: "POLICY_APPROVAL_FAILED",
            message: error instanceof Error ? error.message : String(error),
            actionable: true,
            redactionStatus: "not_applicable"
          }
        },
        404
      );
    }
  });
}
