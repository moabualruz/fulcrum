/**
 * WorkflowService unit tests — Phase 05 Plan 04.
 *
 * Uses a mock EntityManager; no real DB required.
 */

import { describe, it, expect, vi, beforeEach } from "bun:test";
import { WorkflowService } from "./WorkflowService.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

type ProjectOverrides = {
  workflowConfig?: Record<string, unknown> | null;
  methodology?: string;
  enabledTaskTypes?: string[] | null;
  [key: string]: unknown;
};

function makeProject(overrides: ProjectOverrides = {}) {
  return {
    id: "proj-1",
    org: { id: "org-1" },
    workflowConfig: null as Record<string, unknown> | null,
    methodology: "kanban" as const,
    enabledTaskTypes: ["epic", "task", "subtask", "bug"] as string[] | null,
    ...overrides,
  };
}

function makeMockEm(project: ReturnType<typeof makeProject> | null = makeProject()) {
  return {
    findOne: vi.fn().mockResolvedValue(project),
    flush: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// ── WorkflowService ───────────────────────────────────────────────────────────

describe("WorkflowService", () => {
  describe("getDefaultWorkflow", () => {
    it("scrum returns 6-status flow with Todo and InReview", () => {
      const svc = new WorkflowService(makeMockEm());
      const graph = svc.getDefaultWorkflow("scrum");
      expect(graph["Backlog"]).toContain("Todo");
      expect(graph["Todo"]).toContain("InProgress");
      expect(graph["InProgress"]).toContain("InReview");
      expect(graph["InReview"]).toContain("Done");
    });

    it("kanban omits Todo and goes Backlog→InProgress directly", () => {
      const svc = new WorkflowService(makeMockEm());
      const graph = svc.getDefaultWorkflow("kanban");
      expect(graph["Backlog"]).toContain("InProgress");
      expect(graph["Backlog"]).not.toContain("Todo");
    });

    it("none returns empty graph", () => {
      const svc = new WorkflowService(makeMockEm());
      const graph = svc.getDefaultWorkflow("none");
      expect(Object.keys(graph)).toHaveLength(0);
    });
  });

  describe("validateTransition", () => {
    it("allows configured transition", async () => {
      const em = makeMockEm(makeProject({
        workflowConfig: { transitions: { Backlog: ["InProgress"] } },
      }));
      const svc = new WorkflowService(em);
      const result = await svc.validateTransition("org-1", "proj-1", "Backlog", "InProgress");
      expect(result.allowed).toBe(true);
    });

    it("rejects unconfigured transition", async () => {
      const em = makeMockEm(makeProject({
        workflowConfig: { transitions: { Backlog: ["InProgress"] } },
      }));
      const svc = new WorkflowService(em);
      const result = await svc.validateTransition("org-1", "proj-1", "Done", "Backlog");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it("allows any transition when no workflow config (permissive default)", async () => {
      const em = makeMockEm(makeProject({ workflowConfig: null }));
      const svc = new WorkflowService(em);
      const result = await svc.validateTransition("org-1", "proj-1", "Done", "Backlog");
      expect(result.allowed).toBe(true);
    });

    it("throws NOT_FOUND when project does not exist", async () => {
      const em = makeMockEm(null);
      const svc = new WorkflowService(em);
      await expect(svc.validateTransition("org-1", "proj-1", "Backlog", "Done")).rejects.toThrow();
    });
  });

  describe("getMethodology / updateMethodology", () => {
    it("getMethodology returns project methodology", async () => {
      const em = makeMockEm(makeProject({ methodology: "scrum" }));
      const svc = new WorkflowService(em);
      const m = await svc.getMethodology("org-1", "proj-1");
      expect(m).toBe("scrum");
    });

    it("updateMethodology persists new methodology", async () => {
      const project = makeProject({ methodology: "kanban" });
      const em = makeMockEm(project);
      const svc = new WorkflowService(em);
      await svc.updateMethodology("org-1", "proj-1", "scrum", false);
      expect(project.methodology).toBe("scrum");
      expect(em.flush).toHaveBeenCalled();
    });

    it("updateMethodology resets workflow_config when resetWorkflow=true", async () => {
      const project = makeProject({ methodology: "kanban", workflowConfig: { transitions: { X: ["Y"] } } });
      const em = makeMockEm(project);
      const svc = new WorkflowService(em);
      await svc.updateMethodology("org-1", "proj-1", "scrum", true);
      const transitions = project.workflowConfig?.['transitions'] as Record<string, string[]> | undefined;
      expect(transitions).toBeDefined();
      // Should be the scrum defaults, not the old kanban config
      expect(transitions!["Backlog"]).toContain("Todo");
    });
  });

  describe("getEnabledTaskTypes / updateEnabledTaskTypes", () => {
    it("returns default types when not set", async () => {
      const em = makeMockEm(makeProject({ enabledTaskTypes: null }));
      const svc = new WorkflowService(em);
      const types = await svc.getEnabledTaskTypes("org-1", "proj-1");
      expect(types).toEqual(["epic", "task", "subtask", "bug"]);
    });

    it("rejects invalid task types", async () => {
      const em = makeMockEm(makeProject());
      const svc = new WorkflowService(em);
      await expect(svc.updateEnabledTaskTypes("org-1", "proj-1", ["epic", "invalid_type"])).rejects.toThrow();
    });
  });
});
