import Root from "./tabs.svelte";
import List from "./tabs-list.svelte";
import Trigger from "./tabs-trigger.svelte";
import Content from "./tabs-content.svelte";

export type { TabsProps } from "./tabs.svelte";
export type { TabsListProps } from "./tabs-list.svelte";
export type { TabsTriggerProps } from "./tabs-trigger.svelte";
export type { TabsContentProps } from "./tabs-content.svelte";

export {
	Root,
	List,
	Trigger,
	Content,
	//
	Root as Tabs,
	List as TabsList,
	Trigger as TabsTrigger,
	Content as TabsContent,
};
