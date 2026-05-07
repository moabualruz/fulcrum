import { describe, expect, test } from "bun:test";
import { formatBackupResult } from "./backup.ts";

describe("backup CLI formatter", () => {
  test("formatBackupResult --json", () => {
    const result = { path: "/tmp/fulcrum-backup.tar.gz", sizeBytes: 1024, createdAt: "2026-05-03" };
    const json = JSON.parse(formatBackupResult(result, true));
    expect(json.path).toBe("/tmp/fulcrum-backup.tar.gz");
  });

  test("formatBackupResult text", () => {
    const result = { path: "/tmp/fulcrum-backup.tar.gz", sizeBytes: 1024, createdAt: "2026-05-03" };
    const text = formatBackupResult(result, false);
    expect(text).toContain("/tmp/fulcrum-backup.tar.gz");
    expect(text).toContain("1024");
  });
});
