import type { PageServerLoad } from "./$types";
import { DEFAULT_MEMORY_CONFIG } from "$lib/memory/memory-browser";

export const load: PageServerLoad = ({ params }) => ({
  project: { id: params.id },
  memory_config: DEFAULT_MEMORY_CONFIG,
});
