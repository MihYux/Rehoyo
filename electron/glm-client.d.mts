export interface GlmRuntimeConfig {
  readonly baseUrl: string
  readonly searchBaseUrl: string
  readonly model: string
  readonly keyFile: string
  readonly configured: boolean
}

export interface GlmAdvisorRequest {
  question: string
  localAnswer: string
  dataMode: 'live'
  evidence: Array<{
    id: string
    source: string
    region: string
    excerptZh: string
    sentiment: string
    topics: string[]
    title?: string
    url: string
  }>
}

export function createGlmRuntimeConfig(
  environment?: Record<string, string | undefined>,
  fileExists?: (path: string) => boolean,
  argv?: string[],
): GlmRuntimeConfig

export function getPublicGlmStatus(config: GlmRuntimeConfig): {
  configured: boolean
  endpoint: string
  model: string
}

export function readGlmLaunchEnvironment(
  argv?: string[],
  readText?: (path: string) => string,
): Record<string, string>

export function sanitizeGlmAdvisorRequest(value: unknown): GlmAdvisorRequest

export function requestGlmAdvisor(options: {
  config: GlmRuntimeConfig
  request: GlmAdvisorRequest
  fetchImpl?: typeof fetch
  getApiKey?: () => Promise<string>
  readKeyFile?: (path: string) => Promise<string>
}): Promise<{ content: string; model: string; requestId: string }>

export function streamGlmAdvisor(options: {
  config: GlmRuntimeConfig
  request: GlmAdvisorRequest
  fetchImpl?: typeof fetch
  getApiKey?: () => Promise<string>
  readKeyFile?: (path: string) => Promise<string>
  signal?: AbortSignal
  onEvent?: (event: { type: 'delta'; content: string }) => void | Promise<void>
}): Promise<{ content: string; model: string; requestId: string }>
