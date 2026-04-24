import type { ComplianceAuditInput, ComplianceService } from "@fulcrum/core";

export function complianceAuditCommand(
  service: ComplianceService,
  input: ComplianceAuditInput = {}
) {
  return service.audit(input);
}

export function complianceShowCommand(service: ComplianceService, requirementId: string) {
  return service.show(requirementId);
}

export function complianceExportCommand(
  service: ComplianceService,
  input: { format: "json" | "markdown"; output: string; auditInput?: ComplianceAuditInput }
) {
  const audit = service.audit(input.auditInput ?? {});
  return service.export({ format: input.format, output: input.output, audit });
}
