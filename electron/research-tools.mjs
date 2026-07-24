const DEFAULT_TEXT_LIMIT = 2_000

function clean(value, limit = DEFAULT_TEXT_LIMIT) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function objectValue(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }
  return value
}

function requiredText(value, field, limit = DEFAULT_TEXT_LIMIT) {
  const normalized = clean(value, limit)
  if (!normalized) throw new Error(`${field} is required.`)
  return normalized
}

function onlyKeys(value, keys, actionName) {
  const allowed = new Set(['type', ...keys])
  const unknown = Object.keys(value).filter((key) => !allowed.has(key))
  if (unknown.length) throw new Error(`${actionName} contains unsupported fields: ${unknown.join(', ')}.`)
}

function stringProperty(description, options = {}) {
  return {
    type: 'string',
    description,
    ...(options.minLength ? { minLength: options.minLength } : {}),
    ...(options.maxLength ? { maxLength: options.maxLength } : {}),
    ...(options.enum ? { enum: options.enum } : {}),
  }
}

function defineTool({ name, description, properties, required, method, validate }) {
  return Object.freeze({
    name,
    method,
    validate,
    schema: Object.freeze({
      type: 'function',
      function: Object.freeze({
        name,
        description,
        strict: true,
        parameters: Object.freeze({
          type: 'object',
          properties: Object.freeze(properties),
          required: Object.freeze(required),
          additionalProperties: false,
        }),
      }),
    }),
  })
}

const PAGE_ID = stringProperty('The opaque id of a browser page opened by this research run.', { minLength: 1, maxLength: 160 })
const REASON = stringProperty('A concise, auditable reason for taking this action.', { minLength: 1, maxLength: 500 })

export const RESEARCH_TOOL_REGISTRY = Object.freeze([
  defineTool({
    name: 'search_web',
    description: 'Discover public player-feedback pages for the current regional research objective. The runtime selects the search provider.',
    method: 'searchWeb',
    properties: {
      query: stringProperty('A localized search query targeting original player discussion.', { minLength: 4, maxLength: 500 }),
      language: stringProperty('BCP-47 language tag for the query, such as zh-CN, ja-JP, or en-US.', { minLength: 2, maxLength: 30 }),
      purpose: stringProperty('What new evidence this query is intended to find.', { minLength: 1, maxLength: 500 }),
    },
    required: ['query', 'language', 'purpose'],
    validate(value) {
      onlyKeys(value, ['query', 'language', 'purpose'], 'search_web')
      const query = requiredText(value.query, 'search_web.query', 500)
      if (query.length < 4) throw new Error('search_web.query must contain at least 4 characters.')
      return {
        type: 'search_web',
        query,
        language: requiredText(value.language, 'search_web.language', 30),
        purpose: requiredText(value.purpose, 'search_web.purpose', 500),
      }
    },
  }),
  defineTool({
    name: 'open_page',
    description: 'Open a candidate URL already present in the candidate pool with Playwright.',
    method: 'openPage',
    properties: {
      candidateId: stringProperty('Opaque candidate id returned by a discovery route.', { minLength: 1, maxLength: 160 }),
      reason: REASON,
    },
    required: ['candidateId', 'reason'],
    validate(value) {
      onlyKeys(value, ['candidateId', 'reason'], 'open_page')
      return {
        type: 'open_page',
        candidateId: requiredText(value.candidateId, 'open_page.candidateId', 160),
        reason: requiredText(value.reason, 'open_page.reason', 500),
      }
    },
  }),
  defineTool({
    name: 'scroll_page',
    description: 'Scroll an open Playwright page to reveal more visible player discussion.',
    method: 'scrollPage',
    properties: {
      pageId: PAGE_ID,
      direction: stringProperty('Scroll direction.', { enum: ['up', 'down'] }),
      amount: { type: 'integer', description: 'Scroll distance in CSS pixels.', minimum: 200, maximum: 4_000 },
    },
    required: ['pageId', 'direction', 'amount'],
    validate(value) {
      onlyKeys(value, ['pageId', 'direction', 'amount'], 'scroll_page')
      if (!['up', 'down'].includes(value.direction)) throw new Error('scroll_page.direction must be up or down.')
      const amount = Number(value.amount)
      if (!Number.isInteger(amount) || amount < 200 || amount > 4_000) {
        throw new Error('scroll_page.amount must be an integer from 200 to 4000.')
      }
      return {
        type: 'scroll_page',
        pageId: requiredText(value.pageId, 'scroll_page.pageId', 160),
        direction: value.direction,
        amount,
      }
    },
  }),
  defineTool({
    name: 'click_page',
    description: 'Click a safe, visible control in an open Playwright page, such as an expand-comments button.',
    method: 'clickPage',
    properties: {
      pageId: PAGE_ID,
      selector: stringProperty('CSS selector for the visible target.', { minLength: 1, maxLength: 500 }),
      reason: REASON,
    },
    required: ['pageId', 'selector', 'reason'],
    validate(value) {
      onlyKeys(value, ['pageId', 'selector', 'reason'], 'click_page')
      return {
        type: 'click_page',
        pageId: requiredText(value.pageId, 'click_page.pageId', 160),
        selector: requiredText(value.selector, 'click_page.selector', 500),
        reason: requiredText(value.reason, 'click_page.reason', 500),
      }
    },
  }),
  defineTool({
    name: 'type_page',
    description: 'Type text into a safe, visible input on an open Playwright page.',
    method: 'typePage',
    properties: {
      pageId: PAGE_ID,
      selector: stringProperty('CSS selector for the visible input.', { minLength: 1, maxLength: 500 }),
      value: stringProperty('Text to enter.', { minLength: 1, maxLength: 1_000 }),
      reason: REASON,
    },
    required: ['pageId', 'selector', 'value', 'reason'],
    validate(value) {
      onlyKeys(value, ['pageId', 'selector', 'value', 'reason'], 'type_page')
      return {
        type: 'type_page',
        pageId: requiredText(value.pageId, 'type_page.pageId', 160),
        selector: requiredText(value.selector, 'type_page.selector', 500),
        value: requiredText(value.value, 'type_page.value', 1_000),
        reason: requiredText(value.reason, 'type_page.reason', 500),
      }
    },
  }),
  defineTool({
    name: 'extract_comments',
    description: 'Extract visible player-authored comments from an open Playwright page.',
    method: 'extractComments',
    properties: {
      pageId: PAGE_ID,
      selectors: {
        type: 'array',
        description: 'Candidate CSS selectors that identify player comments.',
        items: stringProperty('A CSS selector.', { minLength: 1, maxLength: 300 }),
        minItems: 1,
        maxItems: 8,
      },
    },
    required: ['pageId', 'selectors'],
    validate(value) {
      onlyKeys(value, ['pageId', 'selectors'], 'extract_comments')
      if (!Array.isArray(value.selectors)) throw new Error('extract_comments.selectors must be an array.')
      const selectors = value.selectors.map((item) => requiredText(item, 'extract_comments.selectors[]', 300))
      if (!selectors.length || selectors.length > 8) throw new Error('extract_comments.selectors must contain 1 to 8 selectors.')
      return {
        type: 'extract_comments',
        pageId: requiredText(value.pageId, 'extract_comments.pageId', 160),
        selectors,
      }
    },
  }),
  defineTool({
    name: 'fetch_supplement',
    description: 'Fetch a public RSS, API, or response body for the same page when the browser cannot expose the complete text.',
    method: 'fetchSupplement',
    properties: { pageId: PAGE_ID, reason: REASON },
    required: ['pageId', 'reason'],
    validate(value) {
      onlyKeys(value, ['pageId', 'reason'], 'fetch_supplement')
      return {
        type: 'fetch_supplement',
        pageId: requiredText(value.pageId, 'fetch_supplement.pageId', 160),
        reason: requiredText(value.reason, 'fetch_supplement.reason', 500),
      }
    },
  }),
  defineTool({
    name: 'close_page',
    description: 'Close a Playwright page after it has been accepted, rejected, or is no longer useful.',
    method: 'closePage',
    properties: { pageId: PAGE_ID, reason: REASON },
    required: ['pageId', 'reason'],
    validate(value) {
      onlyKeys(value, ['pageId', 'reason'], 'close_page')
      return {
        type: 'close_page',
        pageId: requiredText(value.pageId, 'close_page.pageId', 160),
        reason: requiredText(value.reason, 'close_page.reason', 500),
      }
    },
  }),
  defineTool({
    name: 'finish_region',
    description: 'Finish this regional research loop only after its verified evidence quota has been reached.',
    method: null,
    properties: { reason: REASON },
    required: ['reason'],
    validate(value) {
      onlyKeys(value, ['reason'], 'finish_region')
      return { type: 'finish_region', reason: requiredText(value.reason, 'finish_region.reason', 500) }
    },
  }),
])

const TOOL_BY_NAME = new Map(RESEARCH_TOOL_REGISTRY.map((tool) => [tool.name, tool]))

export function getResearchToolSchemas() {
  return RESEARCH_TOOL_REGISTRY.map((tool) => JSON.parse(JSON.stringify(tool.schema)))
}

export function validateResearchAction(value) {
  const action = objectValue(value, 'Research action')
  const type = clean(action.type, 80)
  const tool = TOOL_BY_NAME.get(type)
  if (!tool) throw new Error(`Agent returned an unsupported research action: ${type || '(missing type)'}.`)
  return tool.validate(action)
}

function parseArgumentsOnce(value, toolName) {
  let args = value
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args)
    } catch {
      throw new Error(`${toolName} tool call arguments must be valid JSON.`)
    }
  }
  args = objectValue(args, `${toolName} tool call arguments`)

  // Some OpenAI-compatible gateways wrap the real argument object once.
  // This is the only compatibility repair: it never reads message.content and
  // deliberately does not recurse through nested wrappers.
  if (Object.keys(args).length === 1 && Object.hasOwn(args, 'arguments')) {
    args = objectValue(args.arguments, `${toolName} wrapped arguments`)
  }
  return args
}

export function parseResearchToolCall(value) {
  const response = objectValue(value, 'Agent response')
  const message = response?.choices?.[0]?.message ?? response
  const calls = message?.tool_calls
  if (!Array.isArray(calls) || calls.length !== 1) {
    throw new Error('Agent response must contain exactly one function tool call.')
  }
  const call = objectValue(calls[0], 'Research tool call')
  if (call.type && call.type !== 'function') throw new Error('Research tool call must have type function.')
  const fn = objectValue(call.function, 'Research tool call function')
  const name = requiredText(fn.name, 'Research tool call function.name', 80)
  const args = parseArgumentsOnce(fn.arguments, name)
  if (Object.hasOwn(args, 'type') && args.type !== name) {
    throw new Error(`Research tool call name ${name} conflicts with arguments.type ${clean(args.type, 80)}.`)
  }
  return validateResearchAction({ ...args, type: name })
}

/**
 * Compatibility adapter for injected test/development models that already
 * return a typed object. Production model adapters should pass a GLM message
 * to parseResearchToolCall; arbitrary JSON strings and message.content are not
 * accepted here.
 */
export function parseResearchAction(value) {
  if (value && typeof value === 'object' && Array.isArray(value.tool_calls)) {
    return parseResearchToolCall(value)
  }
  if (value && typeof value === 'object' && Array.isArray(value?.choices?.[0]?.message?.tool_calls)) {
    return parseResearchToolCall(value)
  }
  return validateResearchAction(value)
}

function normalizedResult(result) {
  return {
    evidence: Array.isArray(result?.evidence) ? result.evidence : [],
    inspected: Array.isArray(result?.inspected) ? result.inspected : [],
    pages: Array.isArray(result?.pages) ? result.pages : [],
    candidates: Array.isArray(result?.candidates) ? result.candidates : [],
    message: clean(result?.message, 500),
  }
}

export async function executeResearchAction(actionInput, tools, context = {}) {
  const action = validateResearchAction(actionInput)
  const registration = TOOL_BY_NAME.get(action.type)
  if (!registration?.method) return normalizedResult(null)
  const method = tools?.[registration.method]
  if (typeof method !== 'function') throw new Error(`Research tool ${registration.method} is unavailable.`)
  return normalizedResult(await method(action, context))
}
