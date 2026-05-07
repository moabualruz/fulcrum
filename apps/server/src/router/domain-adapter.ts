import { z } from "zod";
import { appErrorToTrpcError } from "@/application/error-mapping.ts";

export const DomainContextSchema = z.object({
  orgId: z.string().min(1),
  userId: z.string().min(1).nullable().optional(),
});

export type DomainContext = z.infer<typeof DomainContextSchema>;

export interface DomainApplication<Input, Output> {
  execute(input: Input, context: DomainContext): Promise<Output>;
}

export function createDomainQuery<Input, Output>(config: {
  input: z.ZodType<Input>;
  output: z.ZodType<Output>;
  application: DomainApplication<Input, Output>;
}) {
  return async (rawInput: unknown, rawContext: unknown): Promise<Output> => {
    try {
      const input = config.input.parse(rawInput);
      const context = DomainContextSchema.parse(rawContext);
      return config.output.parse(await config.application.execute(input, context));
    } catch (error) {
      throw appErrorToTrpcError(error);
    }
  };
}
