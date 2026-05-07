import { filterAndSort, type CommandItem } from "./command-palette-filter";

export type { CommandItem } from "./command-palette-filter";

type OpenChange = (next: boolean) => void;
type OpenState = boolean | (() => boolean);
type SelectCommand = (item: CommandItem) => void;

export function makeKeydownHandler(open: OpenState, onOpenChange: OpenChange) {
  return (event: KeyboardEvent) => {
    const currentOpen = typeof open === "function" ? open() : open;
    const commandK = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
    if (commandK) {
      event.preventDefault();
      onOpenChange(!currentOpen);
      return;
    }

    if (currentOpen && event.key === "Escape") {
      event.preventDefault();
      onOpenChange(false);
    }
  };
}

export function makeSelect(
  items: CommandItem[],
  query: string,
  onSelect: SelectCommand,
  onOpenChange: OpenChange,
) {
  return () => {
    const [top] = filterAndSort(items, query);
    if (top === undefined) return;
    onSelect(top);
    onOpenChange(false);
  };
}
