import { describe, expect, it, vi } from 'vitest'
import {
  createGlmRuntimeConfig,
  getPublicGlmStatus,
  readGlmLaunchEnvironment,
  requestGlmAdvisor,
  sanitizeGlmAdvisorRequest,
} from '../../electron/glm-client.mjs'

describe('GLM desktop advisor client', () => {
  it('keeps the key path private and rejects non-BigModel endpoints', () => {
    const config = createGlmRuntimeConfig({
      REHOYO_GLM_API_KEY_FILE: 'C:/secure/glm-key.txt',
      REHOYO_GLM_BASE_URL: 'https://open.bigmodel.cn/api/coding/paas/v4',
      REHOYO_GLM_MODEL: 'glm-5.2',
    }, () => true)

    expect(getPublicGlmStatus(config)).toEqual({
      configured: true,
      endpoint: 'open.bigmodel.cn',
      model: 'glm-5.2',
    })
    expect(getPublicGlmStatus(config)).not.toHaveProperty('keyFile')

    expect(() => createGlmRuntimeConfig({
      REHOYO_GLM_API_KEY_FILE: 'C:/secure/glm-key.txt',
      REHOYO_GLM_BASE_URL: 'https://example.com/v4',
    }, () => true)).toThrow(/endpoint/i)
  })

  it('accepts a key-file-only desktop launch argument without exposing the key', () => {
    const config = createGlmRuntimeConfig({}, () => true, [
      'electron.exe',
      '.',
      '--rehoyo-glm-key-file=C:/secure/glm-key.txt',
      '--rehoyo-glm-base-url=https://open.bigmodel.cn/api/coding/paas/v4',
      '--rehoyo-glm-model=glm-5.2',
    ])

    expect(getPublicGlmStatus(config)).toEqual({
      configured: true,
      endpoint: 'open.bigmodel.cn',
      model: 'glm-5.2',
    })
    expect(JSON.stringify(getPublicGlmStatus(config))).not.toContain('glm-key.txt')
  })

  it('loads a private ignored launch configuration by path', () => {
    const environment = readGlmLaunchEnvironment(
      ['electron.exe', '.', '--rehoyo-glm-config=.rehoyo-live.json'],
      () => JSON.stringify({
        keyFile: 'C:/secure/glm-key.txt',
        baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
        model: 'glm-5.2',
      }),
    )

    expect(environment).toEqual({
      REHOYO_GLM_API_KEY_FILE: 'C:/secure/glm-key.txt',
      REHOYO_GLM_BASE_URL: 'https://open.bigmodel.cn/api/coding/paas/v4',
      REHOYO_GLM_MODEL: 'glm-5.2',
    })
    expect(environment).not.toHaveProperty('apiKey')
  })

  it('calls GLM with grounded evidence and disabled thinking', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      id: 'request-1',
      model: 'glm-5.2',
      choices: [{ message: { content: '基于证据，欧美玩家更关注叙事落差。[gi-west-02]' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const config = createGlmRuntimeConfig({
      REHOYO_GLM_API_KEY_FILE: 'C:/secure/glm-key.txt',
      REHOYO_GLM_BASE_URL: 'https://open.bigmodel.cn/api/coding/paas/v4',
      REHOYO_GLM_MODEL: 'glm-5.2',
    }, () => true)

    const result = await requestGlmAdvisor({
      config,
      request: {
        question: '为什么欧美玩家不喜欢这个角色？',
        localAnswer: '宣传与体验存在落差。',
        evidence: [{
          id: 'gi-west-02',
          source: 'Reddit',
          region: 'WEST',
          excerptZh: '宣传呈现与实机体验存在落差。',
          sentiment: 'negative',
          topics: ['宣传落差'],
        }],
      },
      fetchImpl,
      readKeyFile: vi.fn(async () => 'test-secret-key\n'),
    })

    expect(result).toEqual({
      content: '基于证据，欧美玩家更关注叙事落差。[gi-west-02]',
      model: 'glm-5.2',
      requestId: 'request-1',
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://open.bigmodel.cn/api/coding/paas/v4/chat/completions')
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-secret-key' })
    const body = JSON.parse(String(init?.body))
    expect(body).toMatchObject({ model: 'glm-5.2', thinking: { type: 'disabled' }, stream: false })
    expect(body.messages.at(-1).content).toContain('gi-west-02')
  })

  it('bounds and sanitizes renderer-supplied advisor context', () => {
    const request = sanitizeGlmAdvisorRequest({
      question: '  为什么欧美玩家评价不同？  ',
      localAnswer: '  本地证据结论  ',
      evidence: Array.from({ length: 20 }, (_, index) => ({
        id: `evidence-${index}`,
        source: 'Reddit',
        region: 'WEST',
        excerptZh: '模拟证据',
        sentiment: 'negative',
        topics: ['宣传落差'],
      })),
      apiKey: 'renderer-must-not-send-keys',
    })

    expect(request.question).toBe('为什么欧美玩家评价不同？')
    expect(request.evidence).toHaveLength(12)
    expect(request).not.toHaveProperty('apiKey')
    expect(() => sanitizeGlmAdvisorRequest({ question: '  ', localAnswer: '', evidence: [] })).toThrow(/question/i)
  })
})
