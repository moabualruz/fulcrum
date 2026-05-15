import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  uploadManualArtifact,
  type ManualArtifactUploadDeps,
} from "@workflow-coordination/infrastructure/artifacts/manual-upload.ts";
import { LocalFsBackend } from "@workflow-coordination/infrastructure/artifacts/storage.ts";

let root: string;
let storeRoot: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "fulcrum-manual-upload-"));
  storeRoot = join(root, "store");
  mkdirSync(storeRoot, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  delete process.env.FULCRUM_ARTIFACT_MAX_SIZE_MB;
});

describe("uploadManualArtifact", () => {
  it("stores file bytes, creates artifact metadata, writes attached_to edge, and returns row", async () => {
    const sourcePath = join(root, "notes.txt");
    writeFileSync(sourcePath, "manual artifact\n");
    const deps = createDeps();

    const artifact = await uploadManualArtifact({
      org: deps.org,
      orgSlug: "acme",
      projectId: "project_01",
      projectSlug: "fulcrum",
      sourcePath,
      filename: "notes.txt",
      mime: "text/plain",
      attachedTo: { kind: "task", id: "task_01" },
      metadataJson: { surface: "cli" },
      deps,
    });

    expect(deps.artifactRepository.created).toHaveLength(1);
    expect(artifact).toEqual(deps.artifactRepository.created[0]!);
    expect(artifact.filename).toBe("notes.txt");
    expect(artifact.mime).toBe("text/plain");
    expect(artifact.sizeBytes).toBe(16n);
    expect(artifact.checksumSha256).toBe(sha256("manual artifact\n"));
    expect(artifact.path).toBe("acme/fulcrum/manual/notes.txt");
    expect(artifact.metadataJson).toEqual({ surface: "cli" });
    expect(await readFile(join(storeRoot, artifact.path), "utf8")).toBe("manual artifact\n");
    expect(deps.edgeRepository.created).toEqual([
      {
        org: deps.org,
        fromKind: "artifact",
        fromId: artifact.id,
        toKind: "task",
        toId: "task_01",
        kind: "attached_to",
      },
    ]);
    expect(deps.eventRepository.uploaded).toEqual([{ org: deps.org, artifact }]);
  });

  it("rejects uploads over FULCRUM_ARTIFACT_MAX_SIZE_MB before writing storage or DB rows", async () => {
    process.env.FULCRUM_ARTIFACT_MAX_SIZE_MB = "1";
    const sourcePath = join(root, "large.bin");
    writeFileSync(sourcePath, Buffer.alloc(1024 * 1024 + 1));
    const deps = createDeps();

    await expect(
      uploadManualArtifact({
        org: deps.org,
        orgSlug: "acme",
        sourcePath,
        filename: "large.bin",
        mime: "application/octet-stream",
        attachedTo: { kind: "doc", id: "doc_01" },
        deps,
      }),
    ).rejects.toThrow("Artifact exceeds FULCRUM_ARTIFACT_MAX_SIZE_MB=1");

    expect(deps.artifactRepository.created).toEqual([]);
    expect(deps.edgeRepository.created).toEqual([]);
    expect(deps.eventRepository.uploaded).toEqual([]);
  });
});

type TestArtifact = {
  id: string;
  org?: unknown;
  projectId?: string | null;
  taskId?: string | null;
  runId?: string | null;
  docId?: string | null;
  filename: string;
  mime: string;
  sizeBytes: bigint;
  path: string;
  checksumSha256: string;
  metadataJson: Record<string, unknown>;
};

type TestDeps = ManualArtifactUploadDeps & {
  org: { id: string; slug: string };
  artifactRepository: FakeArtifactRepository;
  edgeRepository: FakeEdgeRepository;
  eventRepository: FakeEventRepository;
};

function createDeps(): TestDeps {
  const org = { id: "org_01", slug: "acme" };
  const deps: TestDeps = {
    org,
    storageBackend: new LocalFsBackend({ root: storeRoot }),
    artifactRepository: new FakeArtifactRepository(),
    edgeRepository: new FakeEdgeRepository(),
    eventRepository: new FakeEventRepository(),
  };
  return deps;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

class FakeArtifactRepository {
  created: TestArtifact[] = [];

  async create(input: Omit<TestArtifact, "id">) {
    const artifact = { id: randomUUID(), ...input };
    this.created.push(artifact);
    return artifact;
  }
}

class FakeEdgeRepository {
  created: Record<string, unknown>[] = [];

  async createMany(input: Record<string, unknown>[]) {
    this.created.push(...input);
  }
}

class FakeEventRepository {
  uploaded: unknown[] = [];

  async recordArtifactUploaded(input: unknown) {
    this.uploaded.push(input);
  }
}
