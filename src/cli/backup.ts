/**
 * CLI: fulcrum backup [--output DIR] [--json]
 */

export interface BackupResult {
  path: string;
  sizeBytes: number;
  createdAt: string;
}

export function formatBackupResult(result: BackupResult, json: boolean): string {
  if (json) return JSON.stringify(result, null, 2);
  return `Backup created: ${result.path} (${result.sizeBytes} bytes, ${result.createdAt})`;
}

export async function run(args: string[]): Promise<void> {
  const isJson = args.includes("--json");
  const outputIdx = args.indexOf("--output");
  const outputDir = outputIdx >= 0 ? args[outputIdx + 1] : "/tmp";

  if (!outputDir) {
    console.error("usage: fulcrum backup [--output DIR] [--json]");
    process.exit(2);
  }

  // Stub — full implementation creates actual backup via product kernel
  const result: BackupResult = {
    path: `${outputDir}/fulcrum-backup-${Date.now()}.tar.gz`,
    sizeBytes: 0,
    createdAt: new Date().toISOString(),
  };
  console.log(formatBackupResult(result, isJson));
}
