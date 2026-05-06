export interface AppContext { orgId: string; userId: string | null; projectId?: string | null }
export interface NotificationDto { id: string; orgId: string; userId: string; title: string; read: boolean }
export interface CreateNotificationInput { eventId: string; entityKind: string; entityId: string; title: string; body?: string }
