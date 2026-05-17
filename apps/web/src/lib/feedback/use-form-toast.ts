import { toast } from "svelte-sonner";
import { type ActionResult, dispatchToast } from "./action-result";

type Toaster = { success: (msg: string) => void; error: (msg: string) => void };

function isActionResult(v: unknown): v is ActionResult {
  return (
    typeof v === "object" &&
    v !== null &&
    "ok" in v &&
    typeof (v as Record<string, unknown>)["ok"] === "boolean" &&
    "message" in v &&
    typeof (v as Record<string, unknown>)["message"] === "string"
  );
}

export function toastFromForm(
  form: ActionResult | null | undefined,
  injectedToast: Toaster = toast,
): void {
  if (!isActionResult(form)) return;
  dispatchToast(form, injectedToast);
}
