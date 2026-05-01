import { describe, expect, mock, test } from "bun:test";
import { makeBoardCardClick } from "./board-card-handlers.ts";

describe("makeBoardCardClick", () => {
  test("invokes onEdit with the task id once per call", () => {
    const onEdit = mock((_id: string) => {});
    const click = makeBoardCardClick("01J", onEdit);
    click();
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith("01J");
  });

  test("is a no-op when onEdit is undefined", () => {
    const click = makeBoardCardClick("01J", undefined);
    expect(() => click()).not.toThrow();
  });

  test("multiple invocations fire the callback multiple times", () => {
    const onEdit = mock((_id: string) => {});
    const click = makeBoardCardClick("abc", onEdit);
    click();
    click();
    click();
    expect(onEdit).toHaveBeenCalledTimes(3);
    expect(onEdit).toHaveBeenLastCalledWith("abc");
  });
});
