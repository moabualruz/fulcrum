export class InteractiveRequiredError extends Error {
  code = 7;
  constructor(reason: string) {
    super(`INTERACTIVE_REQUIRED: ${reason}`);
    this.name = "InteractiveRequiredError";
  }
}
