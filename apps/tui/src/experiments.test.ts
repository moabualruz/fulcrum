import { describe, expect, test, afterEach } from "bun:test";
import {
  ExperimentsPanel,
  type Experiment,
} from "./experiments.ts";

describe("ExperimentsPanel", () => {
  afterEach(() => {
    delete process.env["FULCRUM_FEATURES"];
  });

  test("hidden when experiments flag OFF", () => {
    delete process.env["FULCRUM_FEATURES"];
    const panel = new ExperimentsPanel();
    expect(panel.isVisible()).toBe(false);
  });

  test("visible when experiments flag ON", () => {
    process.env["FULCRUM_FEATURES"] = "experiments";
    const panel = new ExperimentsPanel();
    expect(panel.isVisible()).toBe(true);
  });

  test("lists active experiments with variant badges", () => {
    process.env["FULCRUM_FEATURES"] = "experiments";
    const panel = new ExperimentsPanel();
    panel.addExperiment({ id: "exp-1", name: "Dark Mode Beta", variant: "treatment" });
    panel.addExperiment({ id: "exp-2", name: "New Nav", variant: "control" });

    const list = panel.listExperiments();
    expect(list).toHaveLength(2);
    expect(list[0]!.variant).toBe("treatment");
    expect(list[1]!.variant).toBe("control");
  });

  test("returns empty list when no experiments", () => {
    process.env["FULCRUM_FEATURES"] = "experiments";
    const panel = new ExperimentsPanel();
    expect(panel.listExperiments()).toEqual([]);
  });

  test("not in navigator items when OFF", () => {
    delete process.env["FULCRUM_FEATURES"];
    const panel = new ExperimentsPanel();
    expect(panel.navigatorEntry()).toBeNull();
  });

  test("in navigator items when ON", () => {
    process.env["FULCRUM_FEATURES"] = "experiments";
    const panel = new ExperimentsPanel();
    expect(panel.navigatorEntry()).toEqual({
      label: "Experiments",
      path: "settings/experiments",
    });
  });

  // ── keyboard navigation + metrics pane ──────────────────────────────────

  test("selectNext / selectedExperiment", () => {
    process.env["FULCRUM_FEATURES"] = "experiments";
    const panel = new ExperimentsPanel();
    panel.addExperiment({ id: "e1", name: "Exp1", variant: "A" });
    panel.addExperiment({ id: "e2", name: "Exp2", variant: "B" });
    expect(panel.selectedExperiment()).toBeNull();
    panel.selectNext();
    expect(panel.selectedExperiment()?.id).toBe("e1");
    panel.selectNext();
    expect(panel.selectedExperiment()?.id).toBe("e2");
    // clamps at end
    panel.selectNext();
    expect(panel.selectedExperiment()?.id).toBe("e2");
  });

  test("selectPrev navigates back", () => {
    process.env["FULCRUM_FEATURES"] = "experiments";
    const panel = new ExperimentsPanel();
    panel.addExperiment({ id: "e1", name: "Exp1", variant: "A" });
    panel.addExperiment({ id: "e2", name: "Exp2", variant: "B" });
    panel.selectNext();
    panel.selectNext();
    panel.selectPrev();
    expect(panel.selectedExperiment()?.id).toBe("e1");
  });

  test("openMetrics returns metrics pane with name", () => {
    process.env["FULCRUM_FEATURES"] = "experiments";
    const panel = new ExperimentsPanel();
    panel.addExperiment({ id: "e1", name: "btn-color", variant: "blue" });
    panel.selectNext();
    const pane = panel.openMetrics({ blue: { assigned: 50, conversions: 5 }, red: { assigned: 50, conversions: 8 } });
    expect(pane).not.toBeNull();
    expect(pane!.experimentName).toBe("btn-color");
    expect(pane!.metrics["blue"]!.assigned).toBe(50);
  });

  test("renderList shows cursor for selected row", () => {
    process.env["FULCRUM_FEATURES"] = "experiments";
    const panel = new ExperimentsPanel();
    panel.addExperiment({ id: "e1", name: "Exp1", variant: "A" });
    panel.addExperiment({ id: "e2", name: "Exp2", variant: "B" });
    panel.selectNext();
    const rows = panel.renderList();
    expect(rows[0]).toContain("▶");
    expect(rows[1]).not.toContain("▶");
  });

  test("renderMetrics shows variant metrics", () => {
    process.env["FULCRUM_FEATURES"] = "experiments";
    const panel = new ExperimentsPanel();
    panel.addExperiment({ id: "e1", name: "color", variant: "blue" });
    panel.selectNext();
    panel.openMetrics({ blue: { assigned: 30, conversions: 3 } });
    const lines = panel.renderMetrics();
    expect(lines.some((l) => l.includes("blue"))).toBe(true);
    expect(lines.some((l) => l.includes("assigned=30"))).toBe(true);
  });

  test("closeMetrics clears metrics pane", () => {
    process.env["FULCRUM_FEATURES"] = "experiments";
    const panel = new ExperimentsPanel();
    panel.addExperiment({ id: "e1", name: "x", variant: "A" });
    panel.selectNext();
    panel.openMetrics({ A: { assigned: 10, conversions: 1 } });
    expect(panel.currentMetricsPane()).not.toBeNull();
    panel.closeMetrics();
    expect(panel.currentMetricsPane()).toBeNull();
  });
});
