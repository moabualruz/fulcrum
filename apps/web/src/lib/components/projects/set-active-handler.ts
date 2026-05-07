// Thin delegator around the app picker's `selectProject` so the
// `SetActiveButton.svelte` onclick path stays declarative and the fetch
// payload contract can be unit-tested without an SSR/DOM harness.
import {
  selectProject,
  type SelectProjectResult,
} from "$lib/components/app/project-picker-helpers";

export interface RunSetActiveOpts {
  fetch?: typeof fetch;
  onSuccess?: () => void;
}

export async function runSetActive(
  slug: string,
  opts?: RunSetActiveOpts,
): Promise<SelectProjectResult> {
  return selectProject(slug, opts);
}
