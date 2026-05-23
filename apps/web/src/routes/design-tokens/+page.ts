import type { PageLoad } from "./$types";

const modes = new Set(["light", "dark", "high-contrast"]);

export const load: PageLoad = ({ url }) => {
	const requestedMode = url.searchParams.get("mode") ?? "light";
	return {
		mode: modes.has(requestedMode) ? requestedMode : "light",
	};
};
