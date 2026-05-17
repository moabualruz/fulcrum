import {
  defaultProductDbStatus,
  type ProductDbConnectionSummary,
  type ProductDbStatus,
} from "@platform-core/application/db/commands.ts";

export type DatabaseConnectionSummary = ProductDbConnectionSummary;
export type DatabaseStatus = ProductDbStatus;

export const defaultDatabaseStatus = defaultProductDbStatus;
