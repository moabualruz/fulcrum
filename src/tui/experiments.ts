/**
 * Experiments panel for Settings screen.
 * Gated by FULCRUM_FEATURES=experiments.
 * Lists active experiments with assigned variant badges.
 */

import { isFeatureEnabled } from "./feature-flags.ts";

export interface Experiment {
  id: string;
  name: string;
  variant: string;
}

export interface NavigatorEntry {
  label: string;
  path: string;
}

export class ExperimentsPanel {
  private experiments: Experiment[] = [];

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
}
