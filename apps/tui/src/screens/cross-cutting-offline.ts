import { c, type Renderer } from "../renderer.ts";

export type ApiConnectivityState = "online" | "reconnecting" | "offline";

export interface ApiConnectivitySnapshot {
  state: ApiConnectivityState;
  lastCheckedAt: string | null;
  nextRetryInSec?: number;
  failureReason?: string | null;
}

export function statusBarApiLabel(snapshot: ApiConnectivitySnapshot): string {
  switch (snapshot.state) {
    case "online":
      return "API:online";
    case "reconnecting":
      return snapshot.nextRetryInSec !== undefined
        ? `API:reconnecting (retry in ${snapshot.nextRetryInSec}s)`
        : "API:reconnecting";
    case "offline":
      return "API:offline";
  }
}

export function offlineFooterHint(snapshot: ApiConnectivitySnapshot): string {
  if (snapshot.state === "online") return "";
  if (snapshot.state === "reconnecting") {
    return snapshot.nextRetryInSec !== undefined
      ? `Reconnecting… retry in ${snapshot.nextRetryInSec}s, press r to retry now`
      : "Reconnecting… press r to retry now";
  }
  return snapshot.failureReason
    ? `API offline: ${snapshot.failureReason}. Press r to reconnect.`
    : "API offline. Press r to reconnect.";
}

export function isInteractive(snapshot: ApiConnectivitySnapshot): boolean {
  return snapshot.state === "online";
}

export function renderOfflineOverlay(renderer: Renderer, snapshot: ApiConnectivitySnapshot): void {
  if (snapshot.state === "online") return;
  renderer.writeln();
  renderer.writeln(`  ${c.bold(statusBarApiLabel(snapshot))}`);
  renderer.writeln(`  ${c.dim(offlineFooterHint(snapshot))}`);
}
