# @fulcrum/test-fixtures

Shared test fixture package for OD adoption.

## Track B: realistic data

`src/factories/<slice>.factory.ts` files own Fishery factories for real-data E2E and service tests. Factories may use `@faker-js/faker` when randomized but realistic values help exercise persistence, ordering, filtering, and rendering.

## Track A: design fixtures

`src/design/<slice>.fixture.ts` files own Zod-validated design fixtures that match OD mockup data exactly. Do not use faker output in design fixtures. These fixtures are stable visual-regression inputs.

## Barrel

`src/index.ts` intentionally exports nothing until a slice adds its own factory or design fixture.
