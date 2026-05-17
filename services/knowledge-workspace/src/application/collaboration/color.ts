// Deterministic colour from user ID — used for collab cursor overlays.
// Simple hash → HSL hue; saturation/lightness fixed for readability.

export function userColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}
