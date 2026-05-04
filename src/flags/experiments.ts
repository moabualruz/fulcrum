/**
 * Experiments — in-process A/B experiment store.
 *
 * Gated by FULCRUM_FEATURES=experiments (C1).
 * Deterministic assignment reuses bucketFor() from evaluation.ts.
 *
 * No DB entity: experiments live in process memory (local-first).
 * Schema-ready: all types exported for future MikroORM entity mapping (C2).
 */

import { bucketFor } from "./evaluation.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Domain types (C2 schema-ready)
// ─────────────────────────────────────────────────────────────────────────────

export interface Experiment {
  id: string;
  name: string;
  description: string;
  variants: string[];
  /** 0-100 inclusive */
  rolloutPercent: number;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
}

export interface ExperimentAssignment {
  experimentId: string;
  userId: string;
  variant: string;
  assignedAt: Date;
}

export interface ConversionEvent {
  experimentId: string;
  userId: string;
  kind: string;
  recordedAt: Date;
}

export interface AssignmentCounts {
  [variant: string]: number;
}

export interface MetricsResult {
  [variant: string]: { assigned: number; conversions: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// ExperimentStore — singleton in-process store
// ─────────────────────────────────────────────────────────────────────────────

export class ExperimentStore {
  private readonly experiments = new Map<string, Experiment>();
  /** keyed by `${experimentId}:${userId}` */
  private readonly _assignments = new Map<string, ExperimentAssignment>();
  private readonly conversions: ConversionEvent[] = [];

  // ── Experiments ────────────────────────────────────────────────────────────

  create(input: {
    name: string;
    description?: string;
    variants: string[];
    rolloutPercent?: number;
    startDate?: Date | null;
    endDate?: Date | null;
  }): Experiment {
    const id = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const exp: Experiment = {
      id,
      name: input.name,
      description: input.description ?? "",
      variants: input.variants,
      rolloutPercent: input.rolloutPercent ?? 100,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      createdAt: new Date(),
    };
    this.experiments.set(id, exp);
    return exp;
  }

  list(): Experiment[] {
    return [...this.experiments.values()];
  }

  get(id: string): Experiment | undefined {
    return this.experiments.get(id);
  }

  getByName(name: string): Experiment | undefined {
    for (const exp of this.experiments.values()) {
      if (exp.name === name) return exp;
    }
    return undefined;
  }

  // ── Assignment ─────────────────────────────────────────────────────────────

  /**
   * assign — deterministically assign a user to a variant.
   *
   * If the user already has an assignment, return it (idempotent).
   * If rolloutPercent < 100, users outside the bucket get null (not enrolled).
   */
  assign(experimentId: string, userId: string): ExperimentAssignment | null {
    const exp = this.experiments.get(experimentId);
    if (!exp || exp.variants.length === 0) return null;

    const existingKey = `${experimentId}:${userId}`;
    const existing = this._assignments.get(existingKey);
    if (existing) return existing;

    // Rollout gate: bucket 0-99 vs rolloutPercent
    const bucket = bucketFor(userId, experimentId);
    if (bucket >= exp.rolloutPercent) return null;

    // Deterministic variant selection using a second hash dimension
    const variantBucket = bucketFor(userId, `${experimentId}:variant`);
    const variantIndex = variantBucket % exp.variants.length;
    const variant = exp.variants[variantIndex]!;

    const assignment: ExperimentAssignment = {
      experimentId,
      userId,
      variant,
      assignedAt: new Date(),
    };
    this._assignments.set(existingKey, assignment);
    return assignment;
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  assignments(experimentId: string): AssignmentCounts {
    const counts: AssignmentCounts = {};
    for (const a of this._assignments.values()) {
      if (a.experimentId !== experimentId) continue;
      counts[a.variant] = (counts[a.variant] ?? 0) + 1;
    }
    return counts;
  }

  recordConversion(experimentId: string, userId: string, kind: string): void {
    this.conversions.push({ experimentId, userId, kind, recordedAt: new Date() });
  }

  metrics(experimentId: string, conversionKind: string): MetricsResult {
    const exp = this.experiments.get(experimentId);
    if (!exp) return {};

    const result: MetricsResult = {};
    for (const variant of exp.variants) {
      result[variant] = { assigned: 0, conversions: 0 };
    }

    for (const a of this._assignments.values()) {
      if (a.experimentId !== experimentId) continue;
      const row = result[a.variant];
      if (row) row.assigned++;
    }

    for (const c of this.conversions) {
      if (c.experimentId !== experimentId || c.kind !== conversionKind) continue;
      const a = this._assignments.get(`${experimentId}:${c.userId}`);
      if (!a) continue;
      const row = result[a.variant];
      if (row) row.conversions++;
    }

    return result;
  }

  // ── Test helpers ───────────────────────────────────────────────────────────

  /** Reset all state — for use in tests only. */
  _reset(): void {
    this.experiments.clear();
    this._assignments.clear();
    this.conversions.length = 0;
  }
}

/** Process-wide singleton store. */
export const experimentStore = new ExperimentStore();
