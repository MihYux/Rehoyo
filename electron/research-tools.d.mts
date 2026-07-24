export type ResearchAction =
  | { type: 'search_web'; query: string; language: string; purpose: string }
  | { type: 'open_page'; candidateId: string; reason: string }
  | { type: 'scroll_page'; pageId: string; direction: 'up' | 'down'; amount: number }
  | { type: 'click_page'; pageId: string; selector: string; reason: string }
  | { type: 'type_page'; pageId: string; selector: string; value: string; reason: string }
  | { type: 'extract_comments'; pageId: string; selectors: string[] }
  | { type: 'fetch_supplement'; pageId: string; reason: string }
  | { type: 'close_page'; pageId: string; reason: string }
  | { type: 'finish_region'; reason: string }

export interface GlmFunctionToolSchema {
  type: 'function'
  function: {
    name: ResearchAction['type']
    description: string
    strict: true
    parameters: {
      type: 'object'
      properties: Record<string, unknown>
      required: readonly string[]
      additionalProperties: false
    }
  }
}

export interface ResearchActionResult {
  evidence: any[]
  inspected: any[]
  pages: any[]
  candidates: any[]
  message: string
}

export const RESEARCH_TOOL_REGISTRY: readonly Readonly<{
  name: ResearchAction['type']
  method: string | null
  schema: GlmFunctionToolSchema
}>[]

export function getResearchToolSchemas(): GlmFunctionToolSchema[]
export function validateResearchAction(value: unknown): ResearchAction
export function parseResearchToolCall(value: unknown): ResearchAction
export function parseResearchAction(value: unknown): ResearchAction
export function executeResearchAction(
  action: ResearchAction,
  tools: Record<string, (action: any, context?: { signal?: AbortSignal; deadlineAt?: number }) => Promise<any>>,
  context?: { signal?: AbortSignal; deadlineAt?: number },
): Promise<ResearchActionResult>
