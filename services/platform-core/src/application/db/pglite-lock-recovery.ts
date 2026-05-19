import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";

export interface PgliteLockRecoveryResult {
  lockPath: string;
  status: "absent" | "active" | "stale-removed" | "unparseable";
  pid: number | null;
}

export async function recoverStalePgliteLock(dataDir: string): Promise<PgliteLockRecoveryResult> {
  const lockPath = join(dataDir, "postmaster.pid");
  let content: string;
  try {
    content = await readFile(lockPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { lockPath, status: "absent", pid: null };
    }
    throw error;
  }

  const pid = Number.parseInt(content.split(/\r?\n/, 1)[0] ?? "", 10);
  if (!Number.isFinite(pid) || pid <= 0) {
    return { lockPath, status: "unparseable", pid: null };
  }

  if (isProcessAlive(pid)) {
    return { lockPath, status: "active", pid };
  }

  await unlink(lockPath);
  return { lockPath, status: "stale-removed", pid };
}

export async function assertPgliteLockRecoverable(dataDir: string): Promise<PgliteLockRecoveryResult> {
  const result = await recoverStalePgliteLock(dataDir);
  if (result.status === "active") {
    throw new Error(`PGlite lock is held by live process ${result.pid} at ${result.lockPath}`);
  }
  return result;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
