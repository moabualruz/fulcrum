import { useEffect, useState } from "react";

interface RunEvent {
  eventId: string;
  type: string;
  timestamp: string;
  payloadSummary: { message?: string };
}

export function LiveActivity({ runId }: { runId: string }) {
  const [events, setEvents] = useState<RunEvent[]>([]);

  useEffect(() => {
    let active = true;
    const load = () => {
      fetch(`/api/v1/runs/${encodeURIComponent(runId)}/events`)
        .then((response) => response.json())
        .then((payload: { data?: RunEvent[] }) => {
          if (active) {
            setEvents(payload.data ?? []);
          }
        })
        .catch(() => {
          if (active) {
            setEvents([]);
          }
        });
    };
    load();
    const timer = globalThis.setInterval(load, 1000);
    return () => {
      active = false;
      globalThis.clearInterval(timer);
    };
  }, [runId]);

  return (
    <section aria-label="Live activity">
      <h2>Live Activity</h2>
      <ol>
        {events.map((event) => (
          <li key={event.eventId}>
            <time>{event.timestamp}</time> {event.type} {event.payloadSummary.message ?? ""}
          </li>
        ))}
      </ol>
    </section>
  );
}
