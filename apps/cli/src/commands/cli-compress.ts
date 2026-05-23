export interface CliCompressOptions {
  checkMode: boolean;
  targets: string[];
}

export function parseCompressArgs(args: readonly string[]): CliCompressOptions {
  const checkMode = args.includes("--check");
  const targets = args.filter((arg) => arg !== "--check" && arg !== "--help" && arg !== "-h" && !arg.startsWith("-"));
  return { checkMode, targets };
}

export function describeCompressPlan(opts: CliCompressOptions, resolvedTargets: readonly string[]): string {
  if (resolvedTargets.length === 0) return "No targets to compress.";
  const verb = opts.checkMode ? "Would check" : "Compressing";
  return `${verb} ${resolvedTargets.length} file(s).`;
}

export function compressTargetIsCompressed(path: string, originalSiblings: ReadonlySet<string>): boolean {
  return originalSiblings.has(`${path}.original.md`) || originalSiblings.has(path.replace(/\.md$/, ".original.md"));
}

export function pendingTargets(targets: readonly string[], originalSiblings: ReadonlySet<string>): string[] {
  return targets.filter((target) => !compressTargetIsCompressed(target, originalSiblings));
}

export { run } from "../compress.ts";
