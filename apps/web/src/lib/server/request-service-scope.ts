export async function requestServiceScope(): Promise<never> {
  throw new Error("Web request service scope is retired; use public API web clients.");
}
