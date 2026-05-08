/**
 * AutomationService tests — Phase 05 Plan 06
 *
 * TDD RED phase: tests written before implementation.
 */

import { describe, it, expect, beforeEach, vi } from "bun:test";

// Minimal mock for EntityManager
function makeEm(
  automations: object[] = [],
  options: { projectAncestry?: Array<{ id: string; path: string; depth: number }> } = {},
): Record<string, ReturnType<typeof vi.fn>> {
  return {
    find: vi.fn().mockResolvedValue(automations),
    findOne: vi.fn().mockResolvedValue(null),
    create: vi.fn((_, data) => ({ ...data, id: "auto-1", executionCount: 0 })),
    persist: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn(),
    getReference: vi.fn((_, id) => ({ id })),
    getConnection: vi.fn(() => ({
      execute: vi.fn((sql: string) => {
        if (sql.includes("FROM projects")) return Promise.resolve(options.projectAncestry ?? []);
        return Promise.resolve([]);
      }),
    })),
  };
}

// We need to import after defining mocks
import { AutomationService } from "./AutomationService.ts";
import type { EventBus } from "../subscriptions/event-bus.ts";

function makeEventBus(): EventBus {
  return {
    subscribe: vi.fn().mockReturnValue(() => {}),
    publish: vi.fn(),
    listenerCount: vi.fn().mockReturnValue(0),
    removeAllListeners: vi.fn(),
  } as unknown as EventBus;
}

describe("AutomationService", () => {
  describe("evaluate", () => {
    it("executes action when trigger_type matches event verb", async () => {
      const automation = {
        id: "auto-1",
        projectId: "proj-1",
        triggerType: "task.status_changed",
        condition: null,
        actionType: "set_status",
        actionConfig: { status: "done" },
        enabled: true,
        executionCount: 0,
        org: { id: "org-1" },
      };
      const em = makeEm([automation]) as ReturnType<typeof makeEm>;
      const eventBus = makeEventBus();
      const service = new AutomationService(em as never, eventBus);

      const event = {
        verb: "task.status_changed",
        taskId: "task-1",
        orgId: "org-1",
        projectId: "proj-1",
        payload: { fromStatus: "todo", toStatus: "in_progress" },
      };

      await service.evaluate(event, "org-1", "proj-1");

      // Should have queried enabled automations for project
      expect(em.find).toHaveBeenCalled();
    });

    it("halts at cycle depth 5 and does not throw", async () => {
      const automation = {
        id: "auto-1",
        projectId: "proj-1",
        triggerType: "task.status_changed",
        condition: null,
        actionType: "set_status",
        actionConfig: { status: "in_progress" },
        enabled: true,
        executionCount: 0,
        org: { id: "org-1" },
      };
      const em = makeEm([automation]);
      const eventBus = makeEventBus();
      const service = new AutomationService(em as never, eventBus);

      const event = {
        verb: "task.status_changed",
        taskId: "task-1",
        orgId: "org-1",
        projectId: "proj-1",
        payload: {},
      };

      // Depth 5 — should halt gracefully without infinite recursion
      await expect(service.evaluate(event, "org-1", "proj-1", 5)).resolves.toBeUndefined();
    });

    it("skips automation when condition field value does not match", async () => {
      const automation = {
        id: "auto-1",
        projectId: "proj-1",
        triggerType: "task.status_changed",
        condition: { field: "priority", operator: "equals", value: "high" },
        actionType: "set_status",
        actionConfig: { status: "done" },
        enabled: true,
        executionCount: 0,
        org: { id: "org-1" },
      };
      const em = makeEm([automation]) as ReturnType<typeof makeEm>;
      const eventBus = makeEventBus();
      const service = new AutomationService(em as never, eventBus);

      const event = {
        verb: "task.status_changed",
        taskId: "task-1",
        orgId: "org-1",
        projectId: "proj-1",
        payload: { priority: "low" }, // doesn't match condition
      };

      await service.evaluate(event, "org-1", "proj-1");

      // em.find was called but no update should have been executed (no flush on task update)
      // The action should not fire — executionCount stays 0
      // flush may not be called if condition fails
      expect(automation.executionCount).toBe(0);
    });

    it("inherits locked parent automation to descendant projects and keeps child project automations local", async () => {
      const parentAutomation = {
        id: "auto-parent",
        projectId: "proj-parent",
        triggerType: "task.assigned",
        triggerConfig: { inheritance: { scope: "descendants", locked: true } },
        condition: { fact: "priority", operator: "equal", value: "high" },
        actionType: "set_assignee",
        actionConfig: { assigneeId: "reviewer-1" },
        enabled: true,
        executionCount: 0,
        org: { id: "org-1" },
      };
      const siblingAutomation = {
        ...parentAutomation,
        id: "auto-sibling",
        projectId: "proj-sibling",
        triggerConfig: { inheritance: { scope: "self" } },
      };
      const childAutomation = {
        ...parentAutomation,
        id: "auto-child",
        projectId: "proj-child",
        triggerConfig: { inheritance: { scope: "self" } },
      };
      const em = makeEm([parentAutomation, siblingAutomation, childAutomation], {
        projectAncestry: [
          { id: "proj-parent", path: "workspace/parent", depth: 1 },
          { id: "proj-child", path: "workspace/parent/child", depth: 2 },
        ],
      });
      const service = new AutomationService(em as never, makeEventBus());

      await service.evaluate({
        verb: "task.assigned",
        taskId: "task-1",
        orgId: "org-1",
        projectId: "proj-child",
        payload: { priority: "high" },
      }, "org-1", "proj-child");

      expect(parentAutomation.executionCount).toBe(1);
      expect(childAutomation.executionCount).toBe(1);
      expect(siblingAutomation.executionCount).toBe(0);
      expect(em.find).toHaveBeenCalledWith(expect.anything(), {
        org: { id: "org-1" },
        projectId: { $in: ["proj-parent", "proj-child"] },
        triggerType: "task.assigned",
        enabled: true,
      });
    });
  });

  describe("getTemplates", () => {
    it("returns exactly 4 predefined templates", async () => {
      const em = makeEm();
      const eventBus = makeEventBus();
      const service = new AutomationService(em as never, eventBus);

      const templates = service.getTemplates();
      expect(templates).toHaveLength(4);
      expect(templates[0]).toHaveProperty("name");
      expect(templates[0]).toHaveProperty("triggerType");
      expect(templates[0]).toHaveProperty("actionType");
    });
  });

  describe("setupAutomationListener", () => {
    it("subscribes to task.* topics on the event bus", async () => {
      const em = makeEm();
      const eventBus = makeEventBus();
      const service = new AutomationService(em as never, eventBus);

      service.setupAutomationListener(eventBus);

      expect(eventBus.subscribe).toHaveBeenCalled();
    });
  });

  describe("CRUD", () => {
    it("list returns automations for a project", async () => {
      const automation = {
        id: "auto-1",
        projectId: "proj-1",
        triggerType: "task.status_changed",
        condition: null,
        actionType: "set_status",
        actionConfig: {},
        enabled: true,
        executionCount: 0,
        org: { id: "org-1" },
        name: "Test",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const em = makeEm([automation]);
      const eventBus = makeEventBus();
      const service = new AutomationService(em as never, eventBus);

      const result = await service.list("org-1", "proj-1");
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe("auto-1");
    });
  });
});
