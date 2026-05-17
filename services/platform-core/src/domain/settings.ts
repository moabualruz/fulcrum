export interface AppContext { orgId: string; userId: string | null; projectId?: string | null }
export interface TenantSettingDto { id: string; orgId: string; key: string; value: unknown }
export interface CredentialDto { id: string; orgId: string; projectId: string; provider: string; accountId: string; label: string }
export interface SetTenantSettingInput { key: string; value: unknown }
export interface CreateCredentialInput { provider: string; accountId: string; label: string; encryptedSecret: string }
