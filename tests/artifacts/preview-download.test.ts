import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  buildArtifactDownload,
  buildArtifactPreview,
  downloadArtifact,
} from "../../src/artifacts/preview-download.ts";
import { LocalFsBackend } from "../../src/artifacts/storage.ts";

let root: string;
let storeRoot: string;
let downloadsRoot: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "fulcrum-artifact-preview-"));
  storeRoot = join(root, "store");
  downloadsRoot = join(root, "downloads");
  mkdirSync(join(storeRoot, "acme", "manual"), { recursive: true });
  mkdirSync(downloadsRoot, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("buildArtifactPreview", () => {
  it("returns text preview content for text artifacts", async () => {
    const artifact = createArtifact("src/example.ts", "text/x-typescript", "export const n = 1;\n");

    const preview = await buildArtifactPreview({
      artifact,
      storageBackend: new LocalFsBackend({ root: storeRoot }),
    });

    expect(preview).toEqual({
      kind: "text",
      artifact,
      language: "typescript",
      content: "export const n = 1;\n",
      truncated: false,
    });
  });

  it("returns image preview metadata without reading bytes inline", async () => {
    const artifact = createArtifact("chart.png", "image/png", pngBytes());

    const preview = await buildArtifactPreview({
      artifact,
      storageBackend: new LocalFsBackend({ root: storeRoot }),
    });

    expect(preview).toEqual({
      kind: "image",
      artifact,
      srcPath: "acme/manual/chart.png",
      mime: "image/png",
      alt: "chart.png",
    });
  });

  it("returns binary preview with hex header", async () => {
    const artifact = createArtifact("payload.bin", "application/octet-stream", Buffer.from([0, 1, 2, 10, 255]));

    const preview = await buildArtifactPreview({
      artifact,
      storageBackend: new LocalFsBackend({ root: storeRoot }),
    });

    expect(preview).toEqual({
      kind: "binary",
      artifact,
      hexHeader: "0001020aff",
      bytesShown: 5,
    });
  });
});

describe("downloadArtifact", () => {
  it("writes artifact bytes to explicit output path and returns download metadata", async () => {
    const artifact = createArtifact("notes.txt", "text/plain", "download me\n");
    const outPath = join(downloadsRoot, "notes-copy.txt");

    const download = await downloadArtifact({
      artifact,
      storageBackend: new LocalFsBackend({ root: storeRoot }),
      outPath,
    });

    expect(await readFile(outPath, "utf8")).toBe("download me\n");
    expect(download).toEqual({
      artifact,
      outPath,
      filename: "notes.txt",
      sizeBytes: 12,
      checksumSha256: sha256("download me\n"),
    });
  });

  it("builds download headers for HTTP/file-response surfaces", () => {
    const artifact = createArtifact("report final.txt", "text/plain", "report\n");

    expect(buildArtifactDownload(artifact)).toEqual({
      artifact,
      filename: "report final.txt",
      path: "acme/manual/report final.txt",
      mime: "text/plain",
      sizeBytes: 7,
      headers: {
        "Content-Disposition": 'attachment; filename="report final.txt"',
        "Content-Length": "7",
        "Content-Type": "text/plain",
      },
    });
  });
});

type TestArtifact = {
  id: string;
  filename: string;
  mime: string | null;
  sizeBytes: bigint | number | string;
  path: string;
  checksumSha256: string | null;
};

function createArtifact(filename: string, mime: string | null, bytes: string | Buffer): TestArtifact {
  const path = join("acme", "manual", filename);
  mkdirSync(dirname(join(storeRoot, path)), { recursive: true });
  writeFileSync(join(storeRoot, path), bytes);
  return {
    id: filename,
    filename,
    mime,
    sizeBytes: Buffer.byteLength(bytes),
    path,
    checksumSha256: sha256(bytes),
  };
}

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function pngBytes(): Buffer {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  ]);
}
