import { describe, expect, test } from "bun:test";

import { auditEventInputSchema, createAuditEventEnvelope } from "./events.ts";

describe("Phase 09.6 audit event foundation", () => {
  test.each([
    "project.created",
    "repo.linked",
    "work.created",
    "run.started",
    "artifact.created",
    "memory.candidate.created",
  ])("normalizes %s with actor, target, causation, and correlation", (verb) => {
    const envelope = createAuditEventEnvelope({
      actor: { kind: "user", id: "user-1" },
      verb,
      source: { kind: "project", id: "project-1" },
      target: { kind: "work_item", id: "task-1" },
      causationId: "cause-1",
      before: { status: "todo" },
      after: { status: "doing" },
    });

    expect(envelope.verb).toBe(verb);
    expect(envelope.actor.id).toBe("user-1");
    expect(envelope.causationId).toBe("cause-1");
    expect(envelope.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(envelope.after).toEqual({ status: "doing" });
  });

  test("rejects audit events without source and target refs", () => {
    expect(() => auditEventInputSchema.parse({
      actor: { kind: "user", id: "user-1" },
      verb: "project.created",
      causationId: "cause-1",
    })).toThrow();
  });
});
