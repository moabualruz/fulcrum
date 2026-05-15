export class CredentialListQueryDto {
  orgId!: string;
  userId!: string;
  includeArchived?: boolean;
}

export class CredentialNameParamsDto {
  name!: string;
}

export class CredentialReadQueryDto {
  orgId!: string;
  userId!: string;
  targetUserId?: string;
}

export class CredentialSetDto {
  orgId!: string;
  userId!: string;
  name!: string;
  value!: string;
}

export class CredentialRotateDto {
  orgId!: string;
  userId!: string;
  targetUserId?: string;
  newValue!: string;
}

export class CredentialTargetDto {
  orgId!: string;
  userId!: string;
  targetUserId?: string;
}
