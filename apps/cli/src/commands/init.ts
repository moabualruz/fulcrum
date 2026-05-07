import { initializeLocalDatabase } from "@/application/init/queries.ts";

export async function run(_argv: readonly string[] = []): Promise<void> {
  const status = await initializeLocalDatabase();
  if (status === "bootstrapped") {
    console.log("✓ Local org bootstrapped");
    return;
  }

  console.log("✓ Already initialized");
}
