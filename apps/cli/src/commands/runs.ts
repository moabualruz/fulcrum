import { runPillar14Command, type Pillar14RunOptions } from "./pillar14-generated.ts";

export type RunsCommandOptions = Pillar14RunOptions;

export async function run(argv: readonly string[], opts: RunsCommandOptions = {}): Promise<void> {
  await runPillar14Command("runs", argv, opts);
}
