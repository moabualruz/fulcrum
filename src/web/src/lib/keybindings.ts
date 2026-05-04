import {
  resolveKeybindings,
  type KeybindingPlatform,
  type TenantSettingsReader,
} from "@fulcrum/keybindings/index.ts";
import type { KeybindingAction } from "@fulcrum/keybindings/schema.ts";

export function createKeybind(action: KeybindingAction) {
  return { action };
}

export async function getWebKeybindings(options: {
  platform?: KeybindingPlatform;
  settings?: TenantSettingsReader;
} = {}) {
  return resolveKeybindings(options);
}
