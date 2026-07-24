import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionClient, ConnectionStatus } from '../../desktop/bridge'
import { ConnectionGate } from './ConnectionGate'

const aiEndpoint = 'https://open.bigmodel.cn/api/coding/paas/v4'
const searchEndpoint = 'https://api.openai.com/v1'

function providerStatus(configured: boolean, provider: 'bigmodel'): ConnectionStatus['ai']
function providerStatus(configured: boolean, provider: 'openai'): ConnectionStatus['search']
function providerStatus(
  configured: boolean,
  provider: 'bigmodel' | 'openai',
): ConnectionStatus['ai'] | ConnectionStatus['search'] {
  if (provider === 'bigmodel') {
    return {
      configured, provider, endpoint: aiEndpoint, model: 'glm-5.2' as const,
      persistence: configured ? 'encrypted' as const : 'none' as const,
    }
  }
  return {
    configured, provider, endpoint: searchEndpoint, model: 'gpt-5.6' as const,
    persistence: configured ? 'encrypted' as const : 'none' as const,
  }
}

function status(overrides: Partial<ConnectionStatus> = {}): ConnectionStatus {
  return {
    configured: false,
    ai: providerStatus(false, 'bigmodel'),
    search: providerStatus(false, 'openai'),
    missing: ['ai.apiKey', 'search.apiKey'],
    ...overrides,
  }
}

function installConnectionClient(client: ConnectionClient) {
  window.rehoyoDesktop = { isElectron: true, platform: 'win32', connection: client }
}

describe('dual-provider first-run connection gate', () => {
  beforeEach(() => { delete window.rehoyoDesktop })

  it('blocks the product and submits both provider connections without retaining keys', async () => {
    const user = userEvent.setup()
    const save = vi.fn(async () => status({
      configured: true,
      ai: providerStatus(true, 'bigmodel'),
      search: providerStatus(true, 'openai'),
      missing: [],
    }))
    installConnectionClient({ getStatus: vi.fn(async () => status()), save, clear: vi.fn(), invalidate: vi.fn() })

    render(<ConnectionGate><h1>任务大厅</h1></ConnectionGate>)

    expect(await screen.findByRole('heading', { name: '连接 ReHoYo' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: '任务大厅' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('BigModel Endpoint')).toHaveValue(aiEndpoint)
    expect(screen.getByLabelText('OpenAI Endpoint')).toHaveValue(searchEndpoint)

    const aiKey = screen.getByLabelText('BigModel API Key')
    const searchKey = screen.getByLabelText('OpenAI API Key')
    await user.type(aiKey, 'private-ai-key')
    await user.type(searchKey, 'private-search-key')
    await user.click(screen.getByRole('button', { name: '安全连接并进入' }))

    expect(await screen.findByRole('heading', { name: '任务大厅' })).toBeVisible()
    expect(aiKey).toHaveValue('')
    expect(searchKey).toHaveValue('')
    expect(save).toHaveBeenCalledWith({
      ai: { apiKey: 'private-ai-key', endpoint: aiEndpoint },
      search: { apiKey: 'private-search-key', endpoint: searchEndpoint },
    })
  })

  it('shows only OpenAI fields after migrating an existing BigModel v1 connection', async () => {
    installConnectionClient({
      getStatus: vi.fn(async () => status({
        ai: providerStatus(true, 'bigmodel'),
        missing: ['search.apiKey'],
      })),
      save: vi.fn(), clear: vi.fn(), invalidate: vi.fn(),
    })

    render(<ConnectionGate><h1>任务大厅</h1></ConnectionGate>)

    expect(await screen.findByLabelText('OpenAI API Key')).toBeVisible()
    expect(screen.getByLabelText('OpenAI Endpoint')).toHaveValue(searchEndpoint)
    expect(screen.queryByLabelText('BigModel API Key')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('BigModel Endpoint')).not.toBeInTheDocument()
  })

  it('skips the greeting only when both connections exist', async () => {
    installConnectionClient({
      getStatus: vi.fn(async () => status({
        configured: true,
        ai: providerStatus(true, 'bigmodel'),
        search: providerStatus(true, 'openai'),
        missing: [],
      })),
      save: vi.fn(), clear: vi.fn(), invalidate: vi.fn(),
    })

    render(<ConnectionGate><h1>任务大厅</h1></ConnectionGate>)

    expect(await screen.findByRole('heading', { name: '任务大厅' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: '连接 ReHoYo' })).not.toBeInTheDocument()
  })

  it('keeps the form available with a provider-specific error when saving fails', async () => {
    const user = userEvent.setup()
    installConnectionClient({
      getStatus: vi.fn(async () => status({ ai: providerStatus(true, 'bigmodel'), missing: ['search.apiKey'] })),
      save: vi.fn(async () => { throw new Error('Unsupported OpenAI endpoint') }),
      clear: vi.fn(), invalidate: vi.fn(),
    })

    render(<ConnectionGate><h1>任务大厅</h1></ConnectionGate>)
    await user.type(await screen.findByLabelText('OpenAI API Key'), 'private-search-key')
    await user.click(screen.getByRole('button', { name: '安全连接并进入' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('OpenAI Endpoint')
    expect(screen.queryByRole('heading', { name: '任务大厅' })).not.toBeInTheDocument()
  })

  it('shows a desktop-only error when the secure preload bridge is unavailable', async () => {
    render(<ConnectionGate><h1>任务大厅</h1></ConnectionGate>)

    expect(await screen.findByRole('heading', { name: '需要 ReHoYo 桌面应用' })).toBeVisible()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('surfaces session-only warnings after both providers unlock the product', async () => {
    const user = userEvent.setup()
    const warning = '仅本次会话有效，重启后需要重新输入 API Key。'
    installConnectionClient({
      getStatus: vi.fn(async () => status()),
      save: vi.fn(async () => status({
        configured: true,
        ai: { ...providerStatus(true, 'bigmodel'), persistence: 'session', warning },
        search: { ...providerStatus(true, 'openai'), persistence: 'session', warning },
        missing: [],
      })),
      clear: vi.fn(), invalidate: vi.fn(),
    })

    render(<ConnectionGate><h1>任务大厅</h1></ConnectionGate>)
    await user.type(await screen.findByLabelText('BigModel API Key'), 'session-ai-key')
    await user.type(screen.getByLabelText('OpenAI API Key'), 'session-search-key')
    await user.click(screen.getByRole('button', { name: '安全连接并进入' }))

    expect(await screen.findByRole('heading', { name: '任务大厅' })).toBeVisible()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('仅本次会话有效'))
  })

  it('reopens only the invalid provider while a running task waits for reauthentication', async () => {
    let statusListener: ((next: ConnectionStatus) => void) | undefined
    const ready = status({
      configured: true,
      ai: providerStatus(true, 'bigmodel'),
      search: providerStatus(true, 'openai'),
      missing: [],
    })
    installConnectionClient({
      getStatus: vi.fn(async () => ready),
      save: vi.fn(),
      clear: vi.fn(),
      invalidate: vi.fn(),
      onStatus: vi.fn((listener) => {
        statusListener = listener
        return () => { statusListener = undefined }
      }),
    })

    render(<ConnectionGate><h1>正在运行的研究任务</h1></ConnectionGate>)
    expect(await screen.findByRole('heading', { name: '正在运行的研究任务' })).toBeVisible()

    act(() => statusListener?.(status({
      ai: providerStatus(true, 'bigmodel'),
      search: providerStatus(false, 'openai'),
      missing: ['search.apiKey'],
    })))

    expect(await screen.findByLabelText('OpenAI API Key')).toBeVisible()
    expect(screen.queryByLabelText('BigModel API Key')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '正在运行的研究任务' })).not.toBeInTheDocument()
  })
})
