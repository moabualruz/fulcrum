# @fulcrum/test-fixtures

Shared test fixture package for OD adoption.

## Track B: realistic data

`src/factories/<slice>.factory.ts` files own Fishery factories for real-data E2E and service tests. Factories may use `@faker-js/faker` when randomized but realistic values help exercise persistence, ordering, filtering, and rendering.

Factory files export both the data type and the Fishery factory:

```ts
import { captureItemFactory } from "@fulcrum/test-fixtures";

const item = captureItemFactory.build({
	title: "Review OAuth callback copy",
});
```

Use `.build()` for plain objects and `.buildList(count)` for deterministic collections. Override only fields relevant to the test. Keep factories in this package instead of adding hand-rolled fixture builders inside service or surface tests.

## Track A: design fixtures

`src/design/<slice>.fixture.ts` files own Zod-validated design fixtures that match OD mockup data exactly. Do not use faker output in design fixtures. These fixtures are stable visual-regression inputs.

## Barrel

`src/index.ts` exports stable factory and fixture names. Add one export per slice so tests can import from `@fulcrum/test-fixtures` without reaching into package internals.
