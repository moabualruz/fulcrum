/**
 * Format a duration between two ISO timestamps.
 *
 * Rules:
 *   - `null` end → "—" (run still in flight)
 *   - diff < 60s → "<n>s"
 *   - diff < 1h  → "<m>m <s>s"
 *   - diff < 24h → "<h>h <m>m"
 *   - ≥24h       → "<d>d <h>h"
 */
export function formatDuration(startISO: string, endISO: string | null): string {
  if (endISO === null) return "—";
  const start = Date.parse(startISO);
  const end = Date.parse(endISO);
  const diffMs = Math.max(0, end - start);
  const totalSec = Math.floor(diffMs / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) {
    const s = totalSec % 60;
    return `${totalMin}m ${s}s`;
  }
  const totalHour = Math.floor(totalMin / 60);
  if (totalHour < 24) {
    const m = totalMin % 60;
    return `${totalHour}h ${m}m`;
  }
  const days = Math.floor(totalHour / 24);
  const h = totalHour % 24;
  return `${days}d ${h}h`;
}
