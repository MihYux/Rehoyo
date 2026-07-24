import { describe, expect, it, vi } from 'vitest'
import {
  createOpenAIWebSearchBody,
  parseOpenAIWebSearchResponse,
  searchOpenAIWeb,
} from '../../electron/openai-web-search.mjs'

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('official OpenAI Web Search adapter', () => {
  it('builds a Responses API request that requires official web search and disables storage', () => {
    expect(createOpenAIWebSearchBody({
      model: 'gpt-5.6',
      input: '搜索日本玩家对崩铁 2.0 的真实评价',
    })).toEqual({
      model: 'gpt-5.6',
      store: false,
      tools: [{
        type: 'web_search',
        external_web_access: true,
        search_context_size: 'high',
      }],
      tool_choice: 'required',
      include: ['web_search_call.action.sources'],
      input: '搜索日本玩家对崩铁 2.0 的真实评价',
    })
  })

  it('extracts and deduplicates HTTPS sources and URL citations without treating model text as evidence', () => {
    const parsed = parseOpenAIWebSearchResponse({
      id: 'resp_123',
      output: [
        {
          type: 'web_search_call',
          action: {
            type: 'search',
            sources: [
              { type: 'url', url: 'https://reddit.com/r/HonkaiStarRail/comments/abc', title: 'Player reactions' },
              { type: 'url', url: 'http://unsafe.example/post', title: 'Unsafe' },
            ],
          },
        },
        {
          type: 'message',
          content: [{
            type: 'output_text',
            text: 'The model summarizes several reactions, but this is not player evidence.',
            annotations: [
              { type: 'url_citation', url: 'https://reddit.com/r/HonkaiStarRail/comments/abc', title: 'Duplicate' },
              { type: 'url_citation', url: 'https://www.youtube.com/watch?v=real', title: 'YouTube comments' },
            ],
          }],
        },
      ],
    })

    expect(parsed.requestId).toBe('resp_123')
    expect(parsed.candidates).toEqual([
      expect.objectContaining({ url: 'https://reddit.com/r/HonkaiStarRail/comments/abc', title: 'Player reactions' }),
      expect.objectContaining({ url: 'https://www.youtube.com/watch?v=real', title: 'YouTube comments' }),
    ])
    expect(parsed.candidates.every((candidate) => !('excerptOriginal' in candidate))).toBe(true)
    expect(parsed.modelText).toContain('not player evidence')
  })

  it('posts only to the configured Responses endpoint and returns provider auth metadata', async () => {
    const fetchImpl = vi.fn(async () => response({
      id: 'resp_ok',
      output: [{
        type: 'web_search_call',
        action: { sources: [{ url: 'https://example.com/public-thread', title: 'Thread' }] },
      }],
    }))
    const result = await searchOpenAIWeb({
      endpoint: 'https://api.openai.com/v1/',
      apiKey: 'secret-test-key',
      model: 'gpt-5.6',
      input: 'regional player comments',
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledWith('https://api.openai.com/v1/responses', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer secret-test-key' }),
    }))
    expect(result.candidates).toHaveLength(1)
  })

  it('surfaces 401/403 as a reauthentication error for the OpenAI connection group', async () => {
    await expect(searchOpenAIWeb({
      endpoint: 'https://api.openai.com/v1',
      apiKey: 'expired',
      input: 'query',
      fetchImpl: vi.fn(async () => response({ error: { message: 'expired credential' } }, 401)),
    })).rejects.toMatchObject({
      name: 'ProviderAuthenticationError',
      provider: 'openai',
      status: 401,
    })
  })
})
