export type {
  DashboardData,
  ProjectTile,
} from "@work-management/application/dashboard/queries.ts";

type LoadDashboard = typeof import("@work-management/application/dashboard/queries.ts").loadDashboard;

export async function loadDashboard(
  ...args: Parameters<LoadDashboard>
): Promise<Awaited<ReturnType<LoadDashboard>>> {
  const queries = await import("@work-management/application/dashboard/queries.ts");
  return queries.loadDashboard(...args);
}
