export interface UninstallOptions {
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
  dryRun?: boolean;
  purge?: boolean;
  includeCaveman?: boolean;
  resolveTargets?: () => Promise<readonly UninstallTarget[]>;
  removeTarget?: (target: UninstallTarget) => Promise<void>;
}

export type UninstallTargetKind =
  | "hook"
  | "rule-block"
  | "skill-cache"
  | "policy-file"
  | "component-ledger"
  | "caveman"
  | "mcp";

export interface UninstallTarget {
  id: string;
  kind: UninstallTargetKind;
  path: string;
  agent?: string;
}

export interface UninstallPlan {
  targets: UninstallTarget[];
  skipped: UninstallTarget[];
}

const HELP = `fulcrum uninstall

Usage:
  fulcrum uninstall [--dry-run] [--purge] [--include-caveman]

Options:
  --dry-run         Show what would be removed without making changes.
  --purge           Also remove skill cache, policy file, and component ledger.
  --include-caveman Also remove caveman per agent install.
`;

export function planUninstall(targets: readonly UninstallTarget[], opts: { purge?: boolean; includeCaveman?: boolean }): UninstallPlan {
  const include: UninstallTarget[] = [];
  const skipped: UninstallTarget[] = [];
  for (const target of targets) {
    if (target.kind === "rule-block") {
      // Sentinel block is rewritten in place; the user content outside the block is preserved.
      include.push(target);
      continue;
    }
    if (target.kind === "skill-cache" || target.kind === "policy-file" || target.kind === "component-ledger") {
      if (opts.purge) include.push(target);
      else skipped.push(target);
      continue;
    }
    if (target.kind === "caveman") {
      if (opts.includeCaveman) include.push(target);
      else skipped.push(target);
      continue;
    }
    include.push(target);
  }
  return { targets: include, skipped };
}

export async function run(argv: readonly string[], opts: UninstallOptions = {}): Promise<void> {
  const print = opts.print ?? console.log;
  const printErr = opts.printErr ?? console.error;
  const exit = opts.exit ?? process.exit;

  if (argv.includes("--help") || argv.includes("-h") || argv.includes("help")) {
    print(HELP);
    return;
  }

  const dryRun = opts.dryRun ?? argv.includes("--dry-run");
  const purge = opts.purge ?? argv.includes("--purge");
  const includeCaveman = opts.includeCaveman ?? argv.includes("--include-caveman");

  if (!opts.resolveTargets) {
    printErr("fulcrum uninstall: target resolver is not configured.");
    exit(1);
    return;
  }

  let targets: readonly UninstallTarget[];
  try {
    targets = await opts.resolveTargets();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    printErr(`fulcrum uninstall: ${message}`);
    exit(1);
    return;
  }

  const plan = planUninstall(targets, { purge, includeCaveman });

  if (plan.targets.length === 0 && plan.skipped.length === 0) {
    print("Nothing to uninstall.");
    return;
  }

  if (dryRun) {
    print(`Would remove ${plan.targets.length} target(s); ${plan.skipped.length} preserved.`);
    for (const target of plan.targets) {
      print(`  - ${target.kind}: ${target.path}${target.agent ? ` (${target.agent})` : ""}`);
    }
    for (const target of plan.skipped) {
      print(`  ~ kept: ${target.kind}: ${target.path}`);
    }
    return;
  }

  for (const target of plan.targets) {
    try {
      await opts.removeTarget?.(target);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      printErr(`fulcrum uninstall: failed to remove ${target.path}: ${message}`);
      exit(1);
      return;
    }
  }
  print(`Removed ${plan.targets.length} target(s).`);
}
