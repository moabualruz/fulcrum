export type CaptureStatus = "triage" | "in_review" | "approved" | "blocked" | "escalated";

export type CaptureQuickAction = "assign" | "block" | "approve" | "escalate";

export interface CaptureReviewState {
  captureId: string;
  status: CaptureStatus;
  note: string;
  assignee: string | null;
  history: CaptureReviewEvent[];
}

export interface CaptureReviewEvent {
  occurredAt: string;
  kind: "status" | "note" | "action";
  payload: string;
}

export interface CaptureReviewEnv {
  now?: () => Date;
}

export function submitReviewNote(state: CaptureReviewState, note: string, env: CaptureReviewEnv = {}): CaptureReviewState {
  const trimmed = note.trim();
  if (!trimmed) return state;
  const occurredAt = (env.now ?? (() => new Date()))().toISOString();
  return {
    ...state,
    note: trimmed,
    history: [...state.history, { occurredAt, kind: "note", payload: trimmed }],
  };
}

export function setCaptureStatus(state: CaptureReviewState, status: CaptureStatus, env: CaptureReviewEnv = {}): CaptureReviewState {
  if (state.status === status) return state;
  const occurredAt = (env.now ?? (() => new Date()))().toISOString();
  return {
    ...state,
    status,
    history: [...state.history, { occurredAt, kind: "status", payload: status }],
  };
}

export function applyQuickAction(state: CaptureReviewState, action: CaptureQuickAction, args: { assignee?: string | null } = {}, env: CaptureReviewEnv = {}): CaptureReviewState {
  const occurredAt = (env.now ?? (() => new Date()))().toISOString();
  switch (action) {
    case "assign": {
      const assignee = args.assignee ?? null;
      const payload = assignee ?? "unassigned";
      return {
        ...state,
        assignee,
        history: [...state.history, { occurredAt, kind: "action", payload: `assign:${payload}` }],
      };
    }
    case "block":
      return setCaptureStatus({ ...state, history: [...state.history, { occurredAt, kind: "action", payload: "block" }] }, "blocked", env);
    case "approve":
      return setCaptureStatus({ ...state, history: [...state.history, { occurredAt, kind: "action", payload: "approve" }] }, "approved", env);
    case "escalate":
      return setCaptureStatus({ ...state, history: [...state.history, { occurredAt, kind: "action", payload: "escalate" }] }, "escalated", env);
  }
}

export function captureSummary(state: CaptureReviewState): string {
  const assignee = state.assignee ?? "unassigned";
  return `${state.captureId} • ${state.status} • ${assignee}`;
}
