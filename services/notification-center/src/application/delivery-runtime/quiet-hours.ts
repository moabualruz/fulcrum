export interface QuietHoursLike {
  userId: string;
  tz?: string | null;
  startHour: number;
  endHour: number;
  daysOfWeek?: number[] | null;
}

export interface QuietHoursEvaluationInput {
  quietHours: QuietHoursLike | null | undefined;
  now?: Date;
}

export interface QuietHoursEvaluation {
  quiet: boolean;
  status: "held-quiet-hours" | "queued";
  nextAttemptAt: Date | null;
  reason: string | null;
}

export function evaluateQuietHours(input: QuietHoursEvaluationInput): QuietHoursEvaluation {
  const quietHours = input.quietHours;
  if (!quietHours) return { quiet: false, status: "queued", nextAttemptAt: null, reason: null };

  const now = input.now ?? new Date();
  const timeZone = quietHours.tz || "UTC";
  const parts = zonedParts(now, timeZone);
  const days = quietHours.daysOfWeek?.length ? quietHours.daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
  if (!days.includes(parts.weekday)) {
    return { quiet: false, status: "queued", nextAttemptAt: null, reason: null };
  }

  if (!isHourInWindow(parts.hour, quietHours.startHour, quietHours.endHour)) {
    return { quiet: false, status: "queued", nextAttemptAt: null, reason: null };
  }

  return {
    quiet: true,
    status: "held-quiet-hours",
    nextAttemptAt: quietWindowEnd(now, quietHours, timeZone),
    reason: "held-quiet-hours",
  };
}

function isHourInWindow(hour: number, startHour: number, endHour: number): boolean {
  if (startHour === endHour) return true;
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  return hour >= startHour || hour < endHour;
}

function quietWindowEnd(now: Date, quietHours: QuietHoursLike, timeZone: string): Date {
  const parts = zonedParts(now, timeZone);
  const currentUtcMidnight = Date.UTC(parts.year, parts.month - 1, parts.day);
  const endDayOffset = quietHours.startHour > quietHours.endHour && parts.hour >= quietHours.startHour ? 1 : 0;
  const candidate = new Date(currentUtcMidnight + endDayOffset * 86_400_000 + quietHours.endHour * 3_600_000);
  if (candidate.getTime() <= now.getTime()) return new Date(candidate.getTime() + 86_400_000);
  return candidate;
}

function zonedParts(now: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  weekday: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return {
    year: Number(get("year") ?? now.getUTCFullYear()),
    month: Number(get("month") ?? now.getUTCMonth() + 1),
    day: Number(get("day") ?? now.getUTCDate()),
    hour: Number(get("hour") ?? now.getUTCHours()),
    weekday: weekdayIndex(get("weekday") ?? "Sun"),
  };
}

function weekdayIndex(value: string): number {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value);
}
