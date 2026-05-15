import {
  resolveKeybindings,
  type KeybindingPlatform,
  type TenantSettingsReader,
} from "@platform-core/application/input-bindings/index.ts";
import type { KeybindingAction } from "@platform-core/application/input-bindings/schema.ts";

export function createKeybind(action: KeybindingAction) {
  return { action };
}

export async function getWebKeybindings(options: {
  platform?: KeybindingPlatform;
  settings?: TenantSettingsReader;
} = {}) {
  return resolveKeybindings(options);
}
