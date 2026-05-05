import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  LocalFsBackend,
  deleteArtifact,
  isSubPath,
} from "../storage.ts";

let scratch = "";

beforeEach(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "fulcrum-artifact-security-"));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe("phase 07 artifact security hardening", () => {
  test("storage rejects traversal paths before read/delete operations", async () => {
    const root = path.join(scratch, "store");
    const backend = new LocalFsBackend({ root });

    expect(isSubPath(root, path.join(root, "org/project/file.txt"))).toBe(true);
    expect(isSubPath(root, path.join(scratch, "escaped.txt"))).toBe(false);
    await expect(backend.get("../escaped.txt")).rejects.toThrow(/escapes store root/i);
    await expect(backend.delete("../escaped.txt")).rejects.toThrow(/escapes store root/i);
  });

  test("cross-org download lookup returns not_found without payload leakage", async () => {
    const payloadPath = path.join(scratch, "secret-artifact.txt");
    await writeFile(payloadPath, "top secret artifact body", "utf8");

    const result = await deleteArtifact({
      artifact: {
        id: "artifact-1",
        orgId: "org-a",
        archived: false,
        bodyPath: payloadPath,
      },
      callerOrgId: "org-b",
      hard: false,
    });

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(JSON.stringify(result)).not.toContain("top secret artifact body");
    expect(JSON.stringify(result)).not.toContain(payloadPath);
  });

  test("archived artifact delete defaults to soft path unless hard confirmed", async () => {
    const payloadPath = path.join(scratch, "archived.txt");
    await writeFile(payloadPath, "archived body", "utf8");

    const soft = await deleteArtifact({
      artifact: {
        id: "artifact-2",
        orgId: "org-a",
        archived: true,
        bodyPath: payloadPath,
      },
      callerOrgId: "org-a",
      hard: false,
    });

    expect(soft).toMatchObject({ ok: true, mode: "soft", id: "artifact-2" });

    const hardWithoutConfirm = await deleteArtifact({
      artifact: {
        id: "artifact-2",
        orgId: "org-a",
        archived: true,
        bodyPath: payloadPath,
      },
      callerOrgId: "org-a",
      hard: true,
      confirm: false,
    });

    expect(hardWithoutConfirm).toEqual({ ok: false, reason: "confirmation_required" });
  });
});
