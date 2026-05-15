export class ReportBurndownQueryDto {
  orgId!: string;
  project_id?: string;
  projectId?: string;
  sprint_id?: string;
  sprintId?: string;
}

export class ReportVelocityQueryDto {
  orgId!: string;
  project_id?: string;
  projectId?: string;
}

export class ReportResponseDto {
  data!: unknown[];
}
