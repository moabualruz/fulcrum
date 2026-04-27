// fulcrum skills sync / lint — stub. Full impl in next phase.
export async function run(args: string[]): Promise<void> {
  const [sub] = args;
  console.error(`fulcrum skills ${sub ?? "sync"}: not yet ported to TS (stub)`);
  process.exit(2);
}
