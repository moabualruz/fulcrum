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
});
