import { describe, it, expect, vi } from "bun:test";
import { AppNotFoundError, AppValidationError } from "@platform-core/domain/errors.ts";
import { WorkCycleService } from "@work-management/application/work-cycle-service.ts";

function makeMockEm(sprint: Record<string, unknown> | null = null) {
  return {
    findOne: vi.fn().mockResolvedValue(sprint),
    find: vi.fn().mockResolvedValue([]),
    persist: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    getConnection: vi.fn().mockReturnValue({
      execute: vi.fn().mockResolvedValue([{ total_points: 30 }]),
    }),
  };
}

function makeSprint(overrides: Record<string, unknown> = {}) {
  return {
    id: "sprint-1",
    org: { id: "org-1" },
    orgId: "org-1",
    name: "Sprint 1",
    startDate: new Date("2026-01-01"),
    endDate: new Date("2026-01-14"),
    status: "active",
    capacityPoints: 50,
    retrospectiveNotes: null,
    closedSummary: null,
    methodology: "scrum",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("WorkCycleService - capacity", () => {
  it("computes capacity preview with assigned vs total", async () => {
    const sprint = makeSprint({ capacityPoints: 50 });
    const em = makeMockEm(sprint);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new WorkCycleService(em as any);
    const result = await svc.getCapacityPreview("org-1", "sprint-1");
    expect(result.assigned).toBe(30);
    expect(result.capacity).toBe(50);
    expect(result.percentage).toBeCloseTo(60);
  });

  it("reports missing sprint as an application not-found error", async () => {
    const em = makeMockEm(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new WorkCycleService(em as any);
    await expect(svc.getCapacityPreview("org-1", "missing")).rejects.toBeInstanceOf(AppNotFoundError);
  });
});

describe("WorkCycleService - retrospective", () => {
  it("rejects invalid updated date order as an application validation error", async () => {
    const sprint = makeSprint({
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-01-14"),
    });
    const em = makeMockEm(sprint);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new WorkCycleService(em as any);

    await expect(
      svc.update("org-1", {
        id: "sprint-1",
        startDate: new Date("2026-01-20"),
      }),
    ).rejects.toBeInstanceOf(AppValidationError);
  });

  it("saves retrospective notes and summary", async () => {
    const sprint = makeSprint({ retrospectiveNotes: null as unknown as Record<string, string> });
    const em = makeMockEm(sprint);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new WorkCycleService(em as any);
    const result = await svc.saveRetrospective("org-1", "sprint-1", "Great sprint", "Velocity up");
    expect(em.flush).toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect((sprint.retrospectiveNotes as unknown as Record<string, string>)?.notes).toBe("Great sprint");
  });

  it("closes sprint with rollover disposition", async () => {
    const sprint = makeSprint({
      status: "active",
      closedSummary: null as unknown as Record<string, string>,
      retrospectiveNotes: null as unknown as Record<string, string>,
    });
    const em = makeMockEm(sprint);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new WorkCycleService(em as any);
    const result = await svc.saveRetrospective("org-1", "sprint-1", "Rollover notes", "closed");
    expect(result).not.toBeNull();
    expect(em.flush).toHaveBeenCalled();
    expect((sprint.retrospectiveNotes as unknown as Record<string, string>)?.notes).toBe("Rollover notes");
  });
});
