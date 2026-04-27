// fulcrum hooks list / enable / disable — stub. Full impl in next phase.
export async function run(args: string[]): Promise<void> {
  const [sub] = args;
  console.error(`fulcrum hooks ${sub ?? "list"}: not yet ported to TS (stub)`);
  process.exit(2);
}
