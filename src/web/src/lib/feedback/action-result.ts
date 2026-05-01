export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export function actionOk(message: string): ActionResult {
  return { ok: true, message };
}

export function actionFail(message: string): ActionResult {
  return { ok: false, message };
}

export function dispatchToast(
  result: ActionResult,
  toaster: { success: (msg: string) => void; error: (msg: string) => void },
): void {
  if (result.ok) {
    toaster.success(result.message);
  } else {
    toaster.error(result.message);
  }
}
