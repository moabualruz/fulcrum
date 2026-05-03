import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ params }) => ({
  id: params.id,
});
