import { createTRPCClient, httpBatchLink, httpLink, splitLink } from "@trpc/client";

import type { AppRouter } from "@fulcrum/server/trpc/router.ts";

const trpcUrl = import.meta.env.VITE_FULCRUM_TRPC_URL ?? "/api/trpc";

export const trpc = createTRPCClient<AppRouter>({
	links: [
		splitLink({
			condition: () => import.meta.env.MODE === "test",
			true: httpLink({ url: trpcUrl }),
			false: httpBatchLink({ url: trpcUrl }),
		}),
	],
});
