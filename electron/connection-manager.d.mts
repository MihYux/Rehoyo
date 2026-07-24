import type { GlmRuntimeConfig } from './glm-client.mjs'

export const BIGMODEL_CODING_ENDPOINT: 'https://open.bigmodel.cn/api/coding/paas/v4'
export const BIGMODEL_SEARCH_ENDPOINT: 'https://open.bigmodel.cn/api/paas/v4'
export const OPENAI_API_ENDPOINT: 'https://api.openai.com/v1'
export const DEFAULT_GLM_MODEL: 'glm-5.2'
export const DEFAULT_OPENAI_MODEL: 'gpt-5.6'

export type ConnectionProvider = 'ai' | 'search'
export type ConnectionField = 'ai.apiKey' | 'ai.endpoint' | 'search.apiKey' | 'search.endpoint'
export type ConnectionPersistence = 'encrypted' | 'session' | 'environment' | 'external' | 'none'

export interface ProviderConnectionStatus {
  configured: boolean
  provider: 'bigmodel' | 'openai'
  endpoint: string
  model: 'glm-5.2' | 'gpt-5.6'
  persistence: ConnectionPersistence
  warning?: string
}

export interface ConnectionStatus {
  configured: boolean
  ai: ProviderConnectionStatus & { provider: 'bigmodel'; model: 'glm-5.2' }
  search: ProviderConnectionStatus & { provider: 'openai'; model: 'gpt-5.6' }
  missing: readonly ConnectionField[]
}

export interface SafeStorageAdapter {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

export interface ProviderConnectionInput {
  apiKey: string
  endpoint: string
}

export interface ConnectionSaveInput {
  ai?: ProviderConnectionInput
  search?: ProviderConnectionInput
}

export interface ConnectionManager {
  initialize(): Promise<ConnectionStatus>
  getStatus(): ConnectionStatus
  save(input: unknown): Promise<ConnectionStatus>
  clear(provider?: ConnectionProvider): Promise<ConnectionStatus>
  invalidate(provider: ConnectionProvider): Promise<ConnectionStatus>
  getApiKey(provider?: ConnectionProvider): Promise<string>
}

export function sanitizeConnectionInput(value: unknown): ConnectionSaveInput

export function createConnectionManager(options: {
  userDataPath: string
  safeStorage: SafeStorageAdapter
  environment?: Record<string, string | undefined>
  externalConfig?: GlmRuntimeConfig
  externalGetApiKey?: () => Promise<string>
  now?: () => number
}): ConnectionManager
