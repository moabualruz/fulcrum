import type { Handle } from "@sveltejs/kit";

import { getActiveProject } from "$lib/state/active-project";

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.activeProjectId = getActiveProject(event.cookies);
  return resolve(event);
};
