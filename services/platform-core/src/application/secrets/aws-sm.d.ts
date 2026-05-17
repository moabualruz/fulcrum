declare module "@aws-sdk/client-secrets-manager" {
  export class SecretsManagerClient { constructor(config: any); send(cmd: any): Promise<any>; }
  export class GetSecretValueCommand { constructor(input: any); }
  export class PutSecretValueCommand { constructor(input: any); }
}
