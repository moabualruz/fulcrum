import { createTRPCMsw, httpLink } from "msw-trpc";

import type { AppRouter } from "@fulcrum/server/trpc/router.ts";

export const trpcMsw = createTRPCMsw<AppRouter>({
	links: [
		httpLink({
			url: "http://127.0.0.1:4200/api/trpc",
		}),
	],
});
