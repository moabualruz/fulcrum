export type TaskStateGroup = "backlog" | "unstarted" | "started" | "completed" | "cancelled";

export interface TaskState {
  id: string;
  group: TaskStateGroup;
  sequence: number;
}

export interface DraggableTaskStateData {
  groupKey: TaskStateGroup;
  id: string;
}

export const TASK_STATE_GROUPS: Record<TaskStateGroup, {
  key: TaskStateGroup;
  label: string;
  defaultStateName: string;
  color: string;
}> = {
  backlog: {
    key: "backlog",
    label: "Backlog",
    defaultStateName: "Backlog",
    color: "#d9d9d9",
  },
  unstarted: {
    key: "unstarted",
    label: "Unstarted",
    defaultStateName: "Todo",
    color: "#3f76ff",
  },
  started: {
    key: "started",
    label: "Started",
    defaultStateName: "In Progress",
    color: "#f59e0b",
  },
  completed: {
    key: "completed",
    label: "Completed",
    defaultStateName: "Done",
    color: "#16a34a",
  },
  cancelled: {
    key: "cancelled",
    label: "Canceled",
    defaultStateName: "Cancelled",
    color: "#dc2626",
  },
};

export const TASK_STATE_GROUP_ORDER = Object.keys(TASK_STATE_GROUPS) as TaskStateGroup[];

export type TaskStateGroupsResponse<State = unknown> = Partial<Record<TaskStateGroup, State[]>>;

export const TASK_VIEW_ACCESS_SPECIFIERS = [
  { key: "PUBLIC", i18nLabel: "common.access.public" },
  { key: "PRIVATE", i18nLabel: "common.access.private" },
] as const;

export function countTaskViewFilters<T extends Record<string, unknown> | null | undefined>(
  filters: T,): number {
  return filters && Object.keys(filters).length > 0
    ? Object.keys(filters).map((key) => {
        const value = (filters as Record<string, unknown>)[key];
        if (value === null) return 0;
        if (Array.isArray(value)) return value.length;
        if (typeof value === "boolean") return value ? 1 : 0;
        return 0;
      }).reduce((curr, prev) => curr + prev, 0)
    : 0;
}

export function satisfiesTaskDateFilter(date: Date, filter: string, now = new Date()): boolean {
  const [value, operator, from] = filter.split(";");

  const dateValue = getTaskDate(value);
  const differenceInDays = differenceInCalendarDays(date, now);

  if (operator === "custom" && from === "custom") {
    if (value === "today") return differenceInDays === 0;
    if (value === "yesterday") return differenceInDays === -1;
    if (value === "last_7_days") return differenceInDays >= -7;
    if (value === "last_30_days") return differenceInDays >= -30;
  }

  if (!from && dateValue) {
    if (operator === "after") return date >= dateValue;
    if (operator === "before") return date <= dateValue;
  }

  if (from === "fromnow") {
    if (operator === "before") {
      if (value === "1_weeks") return differenceInDays <= -7;
      if (value === "2_weeks") return differenceInDays <= -14;
      if (value === "1_months") return differenceInDays <= -30;
    }

    if (operator === "after") {
      if (value === "1_weeks") return differenceInDays >= 7;
      if (value === "2_weeks") return differenceInDays >= 14;
      if (value === "1_months") return differenceInDays >= 30;
      if (value === "2_months") return differenceInDays >= 60;
    }
  }

  return false;
}

export function orderTaskStateGroups<State>(
  unorderedStateGroups: TaskStateGroupsResponse<State> | undefined,): Record<TaskStateGroup, State[]> | undefined {
  if (!unorderedStateGroups) return undefined;
  return Object.assign({
    backlog: [],
    unstarted: [],
    started: [],
    completed: [],
    cancelled: [],
  }, unorderedStateGroups);
}

export function sortTaskStates<State extends TaskState>(states: State[] | undefined): State[] | undefined {
  if (!states || states.length === 0) return undefined;

  return states.sort((stateA, stateB) => {
    if (stateA.group === stateB.group) {
      return stateA.sequence - stateB.sequence;
    }
    return TASK_STATE_GROUP_ORDER.indexOf(stateA.group) - TASK_STATE_GROUP_ORDER.indexOf(stateB.group);
  });
}

export function getCurrentTaskStateSequence(
  groupStates: TaskState[],
  destinationData: DraggableTaskStateData,
  edge: string | undefined,): number | undefined {
  const defaultSequence = 65535;
  if (!edge) return defaultSequence;

  const currentStateIndex = groupStates.findIndex((state) => state.id === destinationData.id);
  const currentStateSequence = groupStates[currentStateIndex]?.sequence || undefined;

  if (!currentStateSequence) return defaultSequence;

  if (edge === "top") {
    const prevStateSequence = groupStates[currentStateIndex - 1]?.sequence || undefined;

    if (prevStateSequence === undefined) {
      return currentStateSequence - defaultSequence;
    }
    return (currentStateSequence + prevStateSequence) / 2;
  } else if (edge === "bottom") {
    const nextStateSequence = groupStates[currentStateIndex + 1]?.sequence || undefined;

    if (nextStateSequence === undefined) {
      return currentStateSequence + defaultSequence;
    }
    return (currentStateSequence + nextStateSequence) / 2;
  }
}

export function shouldRenderTaskColumn(
  key: string,
  project: { estimateEnabled: boolean },): boolean {
  switch (key) {
    case "estimate":
      return project.estimateEnabled;
    default:
      return true;
  }
}

function getTaskDate(date: string | Date | undefined | null): Date | undefined {
  try {
    if (!date || date === "") return undefined;
    if (typeof date !== "string" && !(date instanceof String)) return date;

    const [yearString, monthString, dayString] = date.substring(0, 10).split("-");
    const year = Number.parseInt(yearString ?? "", 10);
    const month = Number.parseInt(monthString ?? "", 10);
    const day = Number.parseInt(dayString ?? "", 10);
    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return undefined;

    return new Date(year, month - 1, day);
  } catch (_error) {
    return undefined;
  }
}

function differenceInCalendarDays(left: Date, right: Date): number {
  const leftStart = new Date(left.getFullYear(), left.getMonth(), left.getDate()).getTime();
  const rightStart = new Date(right.getFullYear(), right.getMonth(), right.getDate()).getTime();
  return Math.round((leftStart - rightStart) / 86_400_000);
}
