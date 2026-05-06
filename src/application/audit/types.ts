export interface AppContext { orgId: string; userId: string | null; projectId?: string | null }
export interface AuditEventDto { id: string; orgId: string; projectId: string; action: string; subjectKind: string; subjectId: string }
export interface RecordAuditEventInput { action: string; subjectKind: string; subjectId: string; payload?: Record<string, unknown> }
