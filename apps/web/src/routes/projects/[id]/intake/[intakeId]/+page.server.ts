import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

import {
  createPlanningStructureApiForEvent,
  PlanningStructureApiError,
} from "$lib/server/planning-structure-api";

const INTAKE_STATUSES = ["open", "accepted", "declined", "converted"] as const;
type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export const load: PageServerLoad = async (event) => {
  try {
    const intake = await createPlanningStructureApiForEvent(event).intake.get({
      id: event.params.intakeId,
      projectId: event.params.id,
    });
    return { projectId: event.params.id, intake };
  } catch (err) {
    if (err instanceof PlanningStructureApiError && err.status === 404) {
      throw error(404, "Intake request not found");
    }
    throw err;
  }
};

export const actions: Actions = {
  update: async (event) => {
    const fd = await event.request.formData();
    const title = field(fd, "title");
    if (!title) return fail(400, { error: "Title is required" });
    await createPlanningStructureApiForEvent(event).intake.update({
      id: event.params.intakeId,
      projectId: event.params.id,
      title,
      description: field(fd, "description") || null,
      status: intakeStatus(field(fd, "status")) ?? "open",
    });
    return { success: true };
  },
};

function field(fd: FormData, name: string): string {
  const value = fd.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function intakeStatus(value: string): IntakeStatus | null {
  return (INTAKE_STATUSES as readonly string[]).includes(value) ? value as IntakeStatus : null;
}
