/**
 * Complete `mock.module` factory for `$lib/feedback/use-form-toast`.
 *
 * Bun's `mock.module` is process-global: the `toastFromForm` value registered
 * first wins for every later importer. `routes/layout.svelte.test.ts` mocked
 * this module with a no-op `toastFromForm` so the SSR-shell render does not
 * dispatch real toasts — which then hijacked `toastFromForm` for
 * `lib/feedback/use-form-toast.test.ts`, whose whole purpose is to assert the
 * real `toastFromForm` calls the injected toaster.
 *
 * The real `$lib/feedback/use-form-toast` is intentionally NOT imported here:
 * Bun's `mock.module` retroactively rewrites already-resolved import bindings,
 * so a static import of the mocked path would make this factory's "real"
 * delegation call itself and recurse forever. `toastFromForm` is a tiny pure
 * function — its behaviour is reproduced verbatim below.
 */

type ActionResultLike = { ok: boolean; message: string };
type Toaster = { success: (msg: string) => void; error: (msg: string) => void };

function isActionResult(v: unknown): v is ActionResultLike {
  return (
    typeof v === "object" &&
    v !== null &&
    "ok" in v &&
    typeof (v as Record<string, unknown>)["ok"] === "boolean" &&
    "message" in v &&
    typeof (v as Record<string, unknown>)["message"] === "string"
  );
}

// Verbatim copy of `$lib/feedback/use-form-toast`'s `toastFromForm` (and the
// `dispatchToast` branch it delegates to) so foreign suites get real behaviour
// without importing — and thus re-mocking — the module under test.
function realToastFromForm(form: unknown, injectedToast: Toaster): void {
  if (!isActionResult(form)) return;
  if (form.ok) injectedToast.success(form.message);
  else injectedToast.error(form.message);
}

/**
 * Seam invoked on every `toastFromForm` call. Return the owning suite's
 * `toastFromForm` double while the suite is active, or `null` to use the real
 * implementation (foreign-suite path).
 */
export type UseFormToastSuiteSeam = () => ((form: unknown, toaster: Toaster) => void) | null;

export interface UseFormToastMockExports {
  toastFromForm: (form: unknown, injectedToast: Toaster) => void;
}

export function useFormToastMock(suiteSeam: UseFormToastSuiteSeam): UseFormToastMockExports {
  return {
    toastFromForm(form, injectedToast) {
      (suiteSeam() ?? realToastFromForm)(form, injectedToast);
    },
  };
}
