import Root from "./tabs.svelte";
import List from "./tabs-list.svelte";
import Trigger from "./tabs-trigger.svelte";
import Content from "./tabs-content.svelte";

export type { TabsProps } from "./tabs.exports.js";
export type { TabsListProps } from "./tabs-list.exports.js";
export type { TabsTriggerProps } from "./tabs-trigger.exports.js";
export type { TabsContentProps } from "./tabs-content.exports.js";

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
