import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionClient, ConnectionStatus } from '../../desktop/bridge'
import { ConnectionGate } from './ConnectionGate'

const endpoint = 'https://open.bigmodel.cn/api/coding/paas/v4'

function status(overrides: Partial<ConnectionStatus> = {}): ConnectionStatus {
  return {
    configured: false,
    provider: null,
    endpoint,
    endpointHost: null,
    model: null,
    persistence: 'none',
    ...overrides,
  }
}

function installConnectionClient(client: ConnectionClient) {
  window.rehoyoDesktop = {
    isElectron: true,
    platform: 'win32',
    connection: client,
  }
}

describe('first-run connection gate', () => {
  beforeEach(() => {
    delete window.rehoyoDesktop
  })

  it('blocks the product until credentials are securely handed to Electron', async () => {
    const user = userEvent.setup()
    const save = vi.fn(async () => status({
      configured: true,
      provider: 'bigmodel',
      endpointHost: 'open.bigmodel.cn',
      model: 'glm-5.2',
      persistence: 'encrypted',
    }))
    installConnectionClient({
      getStatus: vi.fn(async () => status()),
      save,
      clear: vi.fn(),
    })

    render(<ConnectionGate><h1>任务大厅</h1></ConnectionGate>)

    expect(await screen.findByRole('heading', { name: '连接 ReHoYo' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: '任务大厅' })).not.toBeInTheDocument()
    const keyInput = screen.getByLabelText('API Key')
    expect(screen.getByLabelText('API Endpoint')).toHaveValue(endpoint)

    await user.type(keyInput, 'private-ui-test-key')
    await user.click(screen.getByRole('button', { name: '连接并进入' }))

    expect(await screen.findByRole('heading', { name: '任务大厅' })).toBeVisible()
    expect(keyInput).toHaveValue('')
    expect(save).toHaveBeenCalledWith({ apiKey: 'private-ui-test-key', endpoint })
  })

  it('skips the greeting when an encrypted or external connection already exists', async () => {
    installConnectionClient({
      getStatus: vi.fn(async () => status({
        configured: true,
        provider: 'bigmodel',
        endpointHost: 'open.bigmodel.cn',
        model: 'glm-5.2',
        persistence: 'encrypted',
      })),
      save: vi.fn(),
      clear: vi.fn(),
    })

    render(<ConnectionGate><h1>任务大厅</h1></ConnectionGate>)

    expect(await screen.findByRole('heading', { name: '任务大厅' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: '连接 ReHoYo' })).not.toBeInTheDocument()
  })

  it('keeps the form available with a concise error when saving fails', async () => {
    const user = userEvent.setup()
    installConnectionClient({
      getStatus: vi.fn(async () => status()),
      save: vi.fn(async () => { throw new Error('Unsupported endpoint') }),
      clear: vi.fn(),
    })

    render(<ConnectionGate><h1>任务大厅</h1></ConnectionGate>)
    const keyInput = await screen.findByLabelText('API Key')
    await user.type(keyInput, 'private-ui-test-key')
    await user.click(screen.getByRole('button', { name: '连接并进入' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('当前版本仅支持 BigModel Coding Endpoint')
    expect(keyInput).toHaveValue('private-ui-test-key')
    expect(screen.queryByRole('heading', { name: '任务大厅' })).not.toBeInTheDocument()
  })

  it('shows a desktop-only error when the secure preload bridge is unavailable', async () => {
    render(<ConnectionGate><h1>任务大厅</h1></ConnectionGate>)

    expect(await screen.findByRole('heading', { name: '需要 ReHoYo 桌面应用' })).toBeVisible()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '任务大厅' })).not.toBeInTheDocument()
  })

  it('surfaces the session-only warning after unlocking the product', async () => {
    const user = userEvent.setup()
    installConnectionClient({
      getStatus: vi.fn(async () => status()),
      save: vi.fn(async () => status({
        configured: true,
        provider: 'bigmodel',
        endpointHost: 'open.bigmodel.cn',
        model: 'glm-5.2',
        persistence: 'session',
        warning: '仅本次会话有效，重启后需要重新输入 API Key。',
      })),
      clear: vi.fn(),
    })

    render(<ConnectionGate><h1>任务大厅</h1></ConnectionGate>)
    await user.type(await screen.findByLabelText('API Key'), 'session-ui-test-key')
    await user.click(screen.getByRole('button', { name: '连接并进入' }))

    expect(await screen.findByRole('heading', { name: '任务大厅' })).toBeVisible()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('仅本次会话有效'))
  })
})
