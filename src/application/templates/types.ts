import type { TemplateOutput } from "../../services/TemplateService.ts";

export interface AppContext {
  orgId: string;
  userId: string;
}

export type TemplateDto = TemplateOutput;

export interface CreateTemplateInput {
  projectId?: string | null;
  name: string;
  templateData: Record<string, unknown>;
  description?: string;
}
