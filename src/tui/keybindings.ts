import {
  resolveKeybindings,
  type KeybindingPlatform,
  type TenantSettingsReader,
} from "../keybindings/index.ts";

export async function createTuiKeybindingMap(options: {
  platform?: KeybindingPlatform;
  settings?: TenantSettingsReader;
} = {}) {
  return resolveKeybindings(options);
}
