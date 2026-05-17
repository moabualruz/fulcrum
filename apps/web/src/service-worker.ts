/// <reference lib="webworker" />
/**
 * Service worker for VAPID Web Push (P12#19).
 * Registered only when FULCRUM_FEATURES=notify-push is ON.
 * Handles `push` events and displays browser notifications.
 */

declare const self: ServiceWorkerGlobalScope;

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  let data: { title?: string; body?: string; url?: string };
  try {
    data = event.data.json();
  } catch {
    data = { title: "Fulcrum", body: event.data.text() };
  }

  const title = data.title ?? "Fulcrum";
  const options: NotificationOptions = {
    body: data.body ?? "",
    icon: "/favicon.png",
    data: { url: data.url ?? "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url ?? "/";
  event.waitUntil(self.clients.openWindow(url));
});
