/**
 * Experiments panel for Settings screen.
 * Gated by FULCRUM_FEATURES=experiments.
 * Lists active experiments with assigned variant badges.
 * Press E on Settings → Feature Flags to open sub-pane.
 * Press Enter on a row to see metrics pane.
 */

import { isFeatureEnabled } from "./feature-flags.ts";
import type { AssignmentCounts, MetricsResult } from "../flags/experiments.ts";

export interface Experiment {
  id: string;
  name: string;
  variant: string;
  /** Optional assignment counts per variant, shown as badges */
  assignmentCounts?: AssignmentCounts;
}

export interface NavigatorEntry {
  label: string;
  path: string;
}

export interface ExperimentMetricsPane {
  experimentId: string;
  experimentName: string;
  metrics: MetricsResult;
}

export class ExperimentsPanel {
  private experiments: Experiment[] = [];
  private selectedIndex = -1;
  private metricsPane: ExperimentMetricsPane | null = null;

  isVisible(): boolean {
    return isFeatureEnabled("experiments");
  }

  addExperiment(exp: Experiment): void {
    this.experiments.push(exp);
  }

  listExperiments(): Experiment[] {
    return [...this.experiments];
  }

  /** Returns navigator entry if visible, null otherwise. */
  navigatorEntry(): NavigatorEntry | null {
    if (!this.isVisible()) return null;
    return { label: "Experiments", path: "settings/experiments" };
  }

  // ── Keyboard navigation ───────────────────────────────────────────────────

  selectNext(): void {
    if (this.experiments.length === 0) return;
    this.selectedIndex = Math.min(this.selectedIndex + 1, this.experiments.length - 1);
    this.metricsPane = null;
  }

  selectPrev(): void {
    if (this.experiments.length === 0) return;
    this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
    this.metricsPane = null;
  }

  selectedExperiment(): Experiment | null {
    return this.experiments[this.selectedIndex] ?? null;
  }

  /**
   * openMetrics — enter metrics pane for the currently selected experiment.
   * Called when user presses Enter on a row.
   */
  openMetrics(metrics: MetricsResult): ExperimentMetricsPane | null {
    const exp = this.selectedExperiment();
    if (!exp) return null;
    this.metricsPane = { experimentId: exp.id, experimentName: exp.name, metrics };
    return this.metricsPane;
  }

  currentMetricsPane(): ExperimentMetricsPane | null {
    return this.metricsPane;
  }

  closeMetrics(): void {
    this.metricsPane = null;
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  /**
   * renderList — returns terminal-friendly rows for the experiment list.
   * Each row: "[selected?] name  variant  [badge counts]"
   */
  renderList(): string[] {
    return this.experiments.map((exp, i) => {
      const cursor = i === this.selectedIndex ? "▶ " : "  ";
      const badges = exp.assignmentCounts
        ? Object.entries(exp.assignmentCounts)
            .map(([v, n]) => `${v}:${n}`)
            .join(" ")
        : "";
      return `${cursor}${exp.name}  [${exp.variant}]${badges ? "  " + badges : ""}`;
    });
  }

  /**
   * renderMetrics — returns terminal-friendly metrics display.
   * Shows assigned + conversion counts per variant.
   */
  renderMetrics(): string[] {
    if (!this.metricsPane) return [];
    const lines: string[] = [`Metrics — ${this.metricsPane.experimentName}`];
    for (const [variant, data] of Object.entries(this.metricsPane.metrics)) {
      lines.push(`  ${variant}: assigned=${data.assigned}  conversions=${data.conversions}`);
    }
    return lines;
  }
}
