import { homedir } from "node:os";
import { join } from "node:path";

export function fulcrumHome(): string {
  return process.env["FULCRUM_HOME"] ?? join(homedir(), ".fulcrum");
}

export function productStateDir(): string {
  return join(fulcrumHome(), "state", "product");
}

export function productDbDir(): string {
  return join(productStateDir(), "db");
}

export function artifactBodyDir(): string {
  return join(productStateDir(), "artifacts");
}
