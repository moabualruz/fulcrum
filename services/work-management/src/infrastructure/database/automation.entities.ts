import { EntitySchema } from "typeorm";

export interface WorkAutomation {
  id: string;
  orgId: string;
  projectId: string;
  name: string;
  triggerType: string;
  triggerConfig: Record<string, unknown> | null;
  condition: Record<string, unknown> | null;
  actionType: string;
  actionConfig: Record<string, unknown> | null;
  enabled: boolean;
  executionCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const timestampColumns = {
  createdAt: {
    name: "created_at",
    type: "timestamptz",
    createDate: true,
  },
  updatedAt: {
    name: "updated_at",
    type: "timestamptz",
    updateDate: true,
  },
} as const;

export const WorkAutomationEntity = new EntitySchema<WorkAutomation>({
  name: "WorkAutomation",
  tableName: "fulcrum_work_automations",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    orgId: { name: "org_id", type: "varchar", length: 128 },
    projectId: { name: "project_id", type: "varchar", length: 128 },
    name: { type: "varchar", length: 255 },
    triggerType: { name: "trigger_type", type: "varchar", length: 160 },
    triggerConfig: { name: "trigger_config", type: "jsonb", nullable: true },
    condition: { type: "jsonb", nullable: true },
    actionType: { name: "action_type", type: "varchar", length: 160 },
    actionConfig: { name: "action_config", type: "jsonb", nullable: true },
    enabled: { type: "boolean", default: true },
    executionCount: { name: "execution_count", type: "integer", default: 0 },
    ...timestampColumns,
  },
  indices: [
    { name: "fulcrum_work_automations_org_project_idx", columns: ["orgId", "projectId"] },
    { name: "fulcrum_work_automations_org_enabled_idx", columns: ["orgId", "enabled"] },
    { name: "fulcrum_work_automations_trigger_idx", columns: ["orgId", "triggerType"] },
  ],
});

export const WORK_AUTOMATION_ENTITIES = [WorkAutomationEntity];
