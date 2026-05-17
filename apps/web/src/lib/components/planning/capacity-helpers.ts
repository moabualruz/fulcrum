export interface CapacityDisplay {
  used: number;
  total: number | null;
  percent: number | null;
  /** Over 100% of capacity. */
  overCapacity: boolean;
  /** Between 80% and 100% of capacity. */
  nearCapacity: boolean;
  /** CSS class for the progress bar fill. */
  barClass: string;
}

export function computeCapacity(
  estimatePoints: (number | null)[],
  capacityPoints: number | null,
): CapacityDisplay {
  const used = estimatePoints.reduce((sum, p) => sum + (p ?? 0), 0);
  const percent = capacityPoints != null && capacityPoints > 0
    ? Math.round((used / capacityPoints) * 100)
    : null;
  const overCapacity = capacityPoints != null && used > capacityPoints;
  const nearCapacity = !overCapacity && percent != null && percent > 80;

  let barClass = "bg-green-500";
  if (overCapacity) barClass = "bg-red-500";
  else if (nearCapacity) barClass = "bg-amber-400";

  return { used, total: capacityPoints, percent, overCapacity, nearCapacity, barClass };
}
