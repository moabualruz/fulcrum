import { faker } from "@faker-js/faker";
import { Factory } from "fishery";
import { z } from "zod";

export const captureItemSchema = z.object({
	id: z.string().uuid(),
	title: z.string().min(1),
	description: z.string(),
	status: z.enum(["new", "triaged", "accepted", "rejected"]),
	source: z.enum(["manual", "import", "agent"]),
	createdAt: z.string().datetime(),
});

export type CaptureItem = z.infer<typeof captureItemSchema>;
export type CaptureItemStatus = CaptureItem["status"];

export const captureItemFactory = Factory.define<CaptureItem>(() => {
	const createdAt = faker.date.recent({ days: 10 });

	return {
		id: faker.string.uuid(),
		title: faker.hacker.phrase(),
		description: faker.lorem.sentences({ min: 1, max: 2 }),
		status: faker.helpers.arrayElement(["new", "triaged", "accepted", "rejected"] satisfies CaptureItemStatus[]),
		source: faker.helpers.arrayElement(["manual", "import", "agent"] satisfies CaptureItem["source"][]),
		createdAt: createdAt.toISOString(),
	};
});
