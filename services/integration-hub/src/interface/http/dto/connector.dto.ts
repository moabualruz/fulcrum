export class ConnectorListQueryDto {
  orgId?: string;
}

export class ConnectorParamsDto {
  id!: string;
}

export class ConnectorStateBodyDto {
  orgId!: string;
  config?: Record<string, unknown>;
}

export class ConnectorSyncBodyDto {
  orgId!: string;
  trigger?: string;
}

export class ConnectorRunListQueryDto {
  orgId!: string;
  connectorId?: string;
}

export class ConnectorRunParamsDto {
  id!: string;
}

export class ConnectorRunQueryDto {
  orgId!: string;
}
