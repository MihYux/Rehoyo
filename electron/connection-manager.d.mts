import type { GlmRuntimeConfig } from './glm-client.mjs'

export const BIGMODEL_CODING_ENDPOINT: 'https://open.bigmodel.cn/api/coding/paas/v4'
export const BIGMODEL_SEARCH_ENDPOINT: 'https://open.bigmodel.cn/api/paas/v4'
export const DEFAULT_GLM_MODEL: 'glm-5.2'

export type ConnectionPersistence = 'encrypted' | 'session' | 'external' | 'none'

export interface ConnectionStatus {
  configured: boolean
  provider: 'bigmodel' | null
  endpoint: string
  endpointHost: string | null
  model: string | null
  persistence: ConnectionPersistence
  warning?: string
}

export interface SafeStorageAdapter {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

export interface ConnectionManager {
  initialize(): Promise<ConnectionStatus>
  getStatus(): ConnectionStatus
  save(input: unknown): Promise<ConnectionStatus>
  clear(): Promise<{ configured: false }>
  getApiKey(): Promise<string>
}

export function sanitizeConnectionInput(value: unknown): {
  apiKey: string
  endpoint: typeof BIGMODEL_CODING_ENDPOINT
}

export function createConnectionManager(options: {
  userDataPath: string
  safeStorage: SafeStorageAdapter
  externalConfig?: GlmRuntimeConfig
  externalGetApiKey?: () => Promise<string>
  now?: () => number
}): ConnectionManager
