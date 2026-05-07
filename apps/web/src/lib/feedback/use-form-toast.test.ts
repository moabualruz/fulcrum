import { describe, it, expect, mock } from "bun:test";
import { toastFromForm } from "./use-form-toast";

function makeToast() {
  return { success: mock(), error: mock() };
}

describe("toastFromForm", () => {
  it("is a no-op for null", () => {
    const t = makeToast();
    toastFromForm(null, t);
    expect(t.success).toHaveBeenCalledTimes(0);
    expect(t.error).toHaveBeenCalledTimes(0);
  });

  it("is a no-op for undefined", () => {
    const t = makeToast();
    toastFromForm(undefined, t);
    expect(t.success).toHaveBeenCalledTimes(0);
    expect(t.error).toHaveBeenCalledTimes(0);
  });

  it("calls success for {ok:true, message}", () => {
    const t = makeToast();
    toastFromForm({ ok: true, message: "saved" }, t);
    expect(t.success).toHaveBeenCalledTimes(1);
    expect(t.success).toHaveBeenCalledWith("saved");
    expect(t.error).toHaveBeenCalledTimes(0);
  });

  it("calls error for {ok:false, message}", () => {
    const t = makeToast();
    toastFromForm({ ok: false, message: "denied" }, t);
    expect(t.error).toHaveBeenCalledTimes(1);
    expect(t.error).toHaveBeenCalledWith("denied");
    expect(t.success).toHaveBeenCalledTimes(0);
  });

  it("is a no-op for wrong shape", () => {
    const t = makeToast();
    // Cast to unknown to bypass TS; simulates unexpected runtime shape
    toastFromForm({ status: "oops" } as unknown as null, t);
    expect(t.success).toHaveBeenCalledTimes(0);
    expect(t.error).toHaveBeenCalledTimes(0);
  });
});
