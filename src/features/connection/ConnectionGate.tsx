import { ArrowRight, LockKey, Plugs, ShieldCheck } from '@phosphor-icons/react'
import { type FormEvent, type PropsWithChildren, useEffect, useRef, useState } from 'react'
import logoUrl from '../../../ReHoYo_Logo_Transparent.png'
import {
  getConnectionClient,
  type ConnectionStatus,
  type ProviderConnectionInput,
} from '../../desktop/bridge'
import './connection-gate.css'

const BIGMODEL_CODING_ENDPOINT = 'https://open.bigmodel.cn/api/coding/paas/v4'
const OPENAI_API_ENDPOINT = 'https://api.openai.com/v1'

type GatePhase = 'checking' | 'required' | 'saving' | 'ready' | 'unavailable'

function friendlyConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (message.includes('openai') && message.includes('endpoint')) {
    return 'OpenAI Endpoint 无效，请使用官方 API 地址。'
  }
  if (message.includes('bigmodel') && message.includes('endpoint')) {
    return 'BigModel Endpoint 无效，请使用 Coding API 地址。'
  }
  if (message.includes('api key')) return '请输入有效的 API Key。'
  return '连接配置未能保存，请检查输入后重试。'
}

function sessionWarnings(status: ConnectionStatus | null) {
  return [...new Set([status?.ai?.warning, status?.search?.warning].filter(Boolean))].join(' ')
}

export function ConnectionGate({ children }: PropsWithChildren) {
  const [phase, setPhase] = useState<GatePhase>('checking')
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null)
  const [error, setError] = useState('')
  const aiKeyInputRef = useRef<HTMLInputElement>(null)
  const searchKeyInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    const client = getConnectionClient()
    if (!client) {
      setPhase('unavailable')
      return () => { active = false }
    }

    const unsubscribe = client.onStatus?.((status) => {
      if (!active) return
      setConnectionStatus(status)
      setError('')
      setPhase(status.configured ? 'ready' : 'required')
    })
    client.getStatus()
      .then((status) => {
        if (!active) return
        setConnectionStatus(status)
        setPhase(status.configured ? 'ready' : 'required')
      })
      .catch(() => {
        if (active) setPhase('unavailable')
      })

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const client = getConnectionClient()
    if (!client || !connectionStatus) {
      setPhase('unavailable')
      return
    }

    const formData = new FormData(event.currentTarget)
    const input: { ai?: ProviderConnectionInput; search?: ProviderConnectionInput } = {}
    if (!connectionStatus.ai.configured) {
      const apiKey = String(formData.get('aiApiKey') || '').trim()
      if (!apiKey) {
        setError('请输入 BigModel API Key。')
        aiKeyInputRef.current?.focus()
        return
      }
      input.ai = {
        apiKey,
        endpoint: String(formData.get('aiEndpoint') || '').trim(),
      }
    }
    if (!connectionStatus.search.configured) {
      const apiKey = String(formData.get('searchApiKey') || '').trim()
      if (!apiKey) {
        setError('请输入 OpenAI API Key。')
        searchKeyInputRef.current?.focus()
        return
      }
      input.search = {
        apiKey,
        endpoint: String(formData.get('searchEndpoint') || '').trim(),
      }
    }

    setError('')
    setPhase('saving')
    try {
      const status = await client.save(input)
      if (aiKeyInputRef.current) aiKeyInputRef.current.value = ''
      if (searchKeyInputRef.current) searchKeyInputRef.current.value = ''
      setConnectionStatus(status)
      setPhase(status.configured ? 'ready' : 'required')
    } catch (saveError) {
      setError(friendlyConnectionError(saveError))
      setPhase('required')
    }
  }

  if (phase === 'ready') {
    const warning = sessionWarnings(connectionStatus)
    return (
      <>
        {children}
        {warning && (
          <div className="connection-session-notice" role="status">
            <ShieldCheck size={20} weight="duotone" />
            <span>{warning}</span>
          </div>
        )}
      </>
    )
  }

  if (phase === 'checking') {
    return (
      <main className="connection-gate connection-gate--checking" aria-busy="true">
        <img src={logoUrl} alt="ReHoYo" />
        <span>正在检查安全连接…</span>
      </main>
    )
  }

  if (phase === 'unavailable') {
    return (
      <main className="connection-gate">
        <section className="connection-card connection-card--error">
          <div className="connection-icon"><Plugs size={30} weight="duotone" /></div>
          <p className="connection-eyebrow">DESKTOP CONNECTION REQUIRED</p>
          <h1>需要 ReHoYo 桌面应用</h1>
          <p>安全连接桥接不可用。请通过 Electron 桌面应用启动 ReHoYo。</p>
        </section>
      </main>
    )
  }

  const needsAi = !connectionStatus?.ai.configured
  const needsSearch = !connectionStatus?.search.configured

  return (
    <main className="connection-gate">
      <section className="connection-card connection-card--dual" aria-labelledby="connection-title">
        <header className="connection-brand">
          <img src={logoUrl} alt="ReHoYo" />
          <span>GLOBAL PLAYER INTELLIGENCE</span>
        </header>

        <div className="connection-copy">
          <p className="connection-eyebrow">SECURE FIRST CONNECTION</p>
          <h1 id="connection-title">连接 ReHoYo</h1>
          <p>补充缺失的推理与官方搜索连接。密钥只会交给 Electron 主进程安全保存。</p>
        </div>

        <form className="connection-form" onSubmit={handleSubmit}>
          {needsAi && (
            <fieldset className="connection-provider">
              <legend><span>AI 推理服务</span><strong>BigModel · GLM-5.2</strong></legend>

              <label htmlFor="rehoyo-ai-api-key">BigModel API Key</label>
              <div className="connection-input">
                <LockKey size={21} aria-hidden="true" />
                <input
                  ref={aiKeyInputRef}
                  id="rehoyo-ai-api-key"
                  name="aiApiKey"
                  type="password"
                  autoComplete="off"
                  autoFocus
                  required
                  maxLength={4096}
                  placeholder="粘贴 BigModel API Key"
                />
              </div>

              <label htmlFor="rehoyo-ai-endpoint">BigModel Endpoint</label>
              <div className="connection-input">
                <Plugs size={21} aria-hidden="true" />
                <input
                  id="rehoyo-ai-endpoint"
                  name="aiEndpoint"
                  type="url"
                  required
                  defaultValue={connectionStatus?.ai.endpoint || BIGMODEL_CODING_ENDPOINT}
                  spellCheck={false}
                />
              </div>
            </fieldset>
          )}

          {needsSearch && (
            <fieldset className="connection-provider">
              <legend><span>官方搜索服务</span><strong>OpenAI · Web Search</strong></legend>

              <label htmlFor="rehoyo-search-api-key">OpenAI API Key</label>
              <div className="connection-input">
                <LockKey size={21} aria-hidden="true" />
                <input
                  ref={searchKeyInputRef}
                  id="rehoyo-search-api-key"
                  name="searchApiKey"
                  type="password"
                  autoComplete="off"
                  autoFocus={!needsAi}
                  required
                  maxLength={4096}
                  placeholder="粘贴 OpenAI API Key"
                />
              </div>

              <label htmlFor="rehoyo-search-endpoint">OpenAI Endpoint</label>
              <div className="connection-input">
                <Plugs size={21} aria-hidden="true" />
                <input
                  id="rehoyo-search-endpoint"
                  name="searchEndpoint"
                  type="url"
                  required
                  defaultValue={connectionStatus?.search.endpoint || OPENAI_API_ENDPOINT}
                  spellCheck={false}
                />
              </div>
            </fieldset>
          )}

          {error && <p className="connection-error" role="alert">{error}</p>}

          <button type="submit" disabled={phase === 'saving'}>
            <span>{phase === 'saving' ? '正在安全保存…' : '安全连接并进入'}</span>
            <ArrowRight size={21} aria-hidden="true" />
          </button>
        </form>

        <footer className="connection-privacy">
          <ShieldCheck size={21} weight="duotone" aria-hidden="true" />
          <p><strong>密钥不进入前端状态</strong><span>系统加密后保存在此设备，不写入项目、localStorage、SQLite 或日志。</span></p>
        </footer>
      </section>
    </main>
  )
}
