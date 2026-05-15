import {
  resolveKeybindings,
  type KeybindingAction,
  type KeybindingPlatform,
  type TenantSettingsReader,
} from "@platform-core/interface/input-bindings.ts";

export function createKeybind(action: KeybindingAction) {
  return { action };
}

export async function getWebKeybindings(options: {
  platform?: KeybindingPlatform;
  settings?: TenantSettingsReader;
} = {}) {
  return resolveKeybindings(options);
}
