declare module "@aws-sdk/client-s3" {
  export class S3Client {
    constructor(config?: unknown);
    send(command: unknown): Promise<unknown>;
  }
  export class PutObjectCommand {
    constructor(input: unknown);
  }
  export class GetObjectCommand {
    constructor(input: unknown);
  }
  export class DeleteObjectCommand {
    constructor(input: unknown);
  }
  export class HeadObjectCommand {
    constructor(input: unknown);
  }
}

declare module "@azure/storage-blob" {
  export class BlobServiceClient {
    static fromConnectionString(connectionString: string): BlobServiceClient;
    getContainerClient(containerName: string): unknown;
  }
}

declare module "@google-cloud/storage" {
  export class Storage {
    constructor(config?: unknown);
    bucket(name: string): unknown;
  }
}

declare module "@hocuspocus/server" {
  export class Server {
    static configure(config: unknown): Server;
    listen(port?: number): unknown;
    destroy(): unknown;
  }
}

declare module "asciichart" {
  const asciichart: {
    plot(data: readonly number[], options?: unknown): string;
  };
  export default asciichart;
}

declare module "unified" {
  export function unified(): {
    use(plugin: unknown, options?: unknown): ReturnType<typeof unified>;
    process(input: string): Promise<unknown>;
  };
}

declare module "rehype-parse" {
  const plugin: unknown;
  export default plugin;
}

declare module "rehype-remark" {
  const plugin: unknown;
  export default plugin;
}

declare module "remark-stringify" {
  const plugin: unknown;
  export default plugin;
}
