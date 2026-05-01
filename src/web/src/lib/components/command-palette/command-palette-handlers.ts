import { filterAndSort, type CommandItem } from "./command-palette-filter";

export type { CommandItem } from "./command-palette-filter";

type OpenChange = (next: boolean) => void;
type SelectCommand = (item: CommandItem) => void;

export function makeKeydownHandler(open: boolean, onOpenChange: OpenChange) {
  return (event: KeyboardEvent) => {
    const commandK = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
    if (commandK) {
      event.preventDefault();
      onOpenChange(!open);
      return;
    }

    if (open && event.key === "Escape") {
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
