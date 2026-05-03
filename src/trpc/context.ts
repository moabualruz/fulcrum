import type { ProductDb } from "../product-kernel/db/types.ts";

/**
 * tRPC context — every procedure receives a `ProductDb` handle and the
 * authenticated org ID. Expand as auth / session layers land.
 */
export interface TrpcContext {
  db: ProductDb;
  orgId: string;
}
