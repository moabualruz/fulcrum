import { describe, expect, test } from "bun:test";
import { applicationMigrations } from "@platform-core/infrastructure/application-database/typeorm.config.ts";

function migrationName(migration: unknown): string {
  return (migration as { name?: string }).name ?? (migration as { constructor: { name: string } }).constructor.name;
}

function migrationTimestamp(migration: unknown): number {
  return (migration as { timestamp?: number }).timestamp ?? Number(/(\d{10,})/.exec(migrationName(migration))?.[1] ?? 0);
}

describe("migration ordering", () => {
  test("application migrations expose unique names and numeric versions", () => {
    const names = applicationMigrations.map(migrationName);
    const versions = applicationMigrations.map(migrationTimestamp);

    expect(new Set(names).size).toBe(names.length);
    expect(versions.every((version) => Number.isInteger(version) && version > 0)).toBe(true);
  });

  test("foundation schemas precede service-specific schemas", () => {
    const names = applicationMigrations.map(migrationName);
    const index = (name: string) => names.findIndex((candidate) => candidate.includes(name));

    expect(index("CoreAndAuth")).toBeLessThan(index("WorkManagement"));
    expect(index("WorkManagement1715788800001")).toBeLessThan(index("WorkManagement1778623200003"));
    expect(index("Knowledge1715788800002")).toBeLessThan(index("KnowledgeDocuments"));
    expect(index("Orchestration1715788800003")).toBeLessThan(index("RunContext"));
    expect(index("Integration1715788800004")).toBeLessThan(index("IntegrationRepositories"));
    expect(index("Notifications1715788800005")).toBeLessThan(index("NotificationReadState"));
    expect(index("Platform1715788800006")).toBeLessThan(index("Credential"));
  });
});
