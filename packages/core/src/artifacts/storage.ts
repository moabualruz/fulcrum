import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export interface ArtifactStorageReference {
  storageRef: string;
  hash: string;
  sizeBytes: number;
}

export class LocalArtifactStorage {
  constructor(private readonly artifactRoot: string) {}

  async store(
    localRef: string,
    projectId?: string,
    runId?: string
  ): Promise<ArtifactStorageReference> {
    const dir = await this.ensureLayout(projectId, runId);
    const target = path.join(dir, path.basename(localRef));
    await copyFile(localRef, target);
    return this.describeStored(target);
  }

  private async describeStored(localRef: string): Promise<ArtifactStorageReference> {
    const fileStat = await stat(localRef);
    const hash = createHash("sha256")
      .update(await readFile(localRef))
      .digest("hex");
    return {
      storageRef: path.relative(this.artifactRoot, path.resolve(localRef)),
      hash,
      sizeBytes: fileStat.size
    };
  }

  async ensureLayout(projectId?: string, runId?: string): Promise<string> {
    const dir = path.join(this.artifactRoot, projectId ?? "global", runId ?? "unscoped");
    await mkdir(dir, { recursive: true });
    return dir;
  }
}
