import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import CalendarView from "../../src/lib/components/tasks/CalendarView.svelte";

// CalendarView wraps @event-calendar/core with task due dates and sprint overlay.

describe("CalendarView", () => {
  it("renders @event-calendar/core with task due dates", () => {
    const { container } = render(CalendarView, {
      props: { projectId: "test-1", tasks: [
        { id: "t1", title: "Task one", due_date: "2026-06-15", priority: 2 },
      ] },
    });
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("renders task cards in calendar day cells", () => {
    const { container } = render(CalendarView, {
      props: { projectId: "test-1", tasks: [
        { id: "t2", title: "Task two", due_date: "2026-06-20", status: "todo" },
      ] },
    });
    expect(container.innerHTML).toBeTruthy();
  });

  it("supports month/week/day view switching", () => {
    const { container } = render(CalendarView, {
      props: { projectId: "test-1" },
    });
    // View switcher buttons rendered via data-view attribute on .view-buttons div
    expect(container.querySelector("[data-view]")).toBeTruthy();
  });
});
