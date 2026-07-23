import { ArrowRight, LockKey, Plugs, ShieldCheck } from '@phosphor-icons/react'
import { type FormEvent, type PropsWithChildren, useEffect, useRef, useState } from 'react'
import logoUrl from '../../../ReHoYo_Logo_Transparent.png'
import { getConnectionClient, type ConnectionStatus } from '../../desktop/bridge'

const BIGMODEL_CODING_ENDPOINT = 'https://open.bigmodel.cn/api/coding/paas/v4'

type GatePhase = 'checking' | 'required' | 'saving' | 'ready' | 'unavailable'

function friendlyConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (message.includes('endpoint')) return '当前版本仅支持 BigModel Coding Endpoint。'
  if (message.includes('api key')) return '请输入有效的 API Key。'
  return '连接配置未能保存，请检查输入后重试。'
}

export function ConnectionGate({ children }: PropsWithChildren) {
  const [phase, setPhase] = useState<GatePhase>('checking')
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null)
  const [error, setError] = useState('')
  const apiKeyInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    const client = getConnectionClient()
    if (!client) {
      setPhase('unavailable')
      return () => { active = false }
    }

    client.getStatus()
      .then((status) => {
        if (!active) return
        setConnectionStatus(status)
        setPhase(status.configured ? 'ready' : 'required')
      })
      .catch(() => {
        if (active) setPhase('unavailable')
      })

    return () => { active = false }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const client = getConnectionClient()
    if (!client) {
      setPhase('unavailable')
      return
    }

    const formData = new FormData(event.currentTarget)
    const apiKey = String(formData.get('apiKey') || '').trim()
    const endpoint = String(formData.get('endpoint') || '').trim()
    if (!apiKey) {
      setError('请输入 API Key。')
      apiKeyInputRef.current?.focus()
      return
    }

    setError('')
    setPhase('saving')
    try {
      const status = await client.save({ apiKey, endpoint })
      if (apiKeyInputRef.current) apiKeyInputRef.current.value = ''
      setConnectionStatus(status)
      setPhase(status.configured ? 'ready' : 'required')
    } catch (saveError) {
      setError(friendlyConnectionError(saveError))
      setPhase('required')
    }
  }

  if (phase === 'ready') {
    return (
      <>
        {children}
        {connectionStatus?.persistence === 'session' && connectionStatus.warning && (
          <div className="connection-session-notice" role="status">
            <ShieldCheck size={20} weight="duotone" />
            <span>{connectionStatus.warning}</span>
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

  return (
    <main className="connection-gate">
      <section className="connection-card" aria-labelledby="connection-title">
        <header className="connection-brand">
          <img src={logoUrl} alt="ReHoYo" />
          <span>GLOBAL PLAYER INTELLIGENCE</span>
        </header>

        <div className="connection-copy">
          <p className="connection-eyebrow">SECURE FIRST CONNECTION</p>
          <h1 id="connection-title">连接 ReHoYo</h1>
          <p>配置真实研究所需的 BigModel API。完成后进入全球玩家洞察指挥中心。</p>
        </div>

        <form className="connection-form" onSubmit={handleSubmit}>
          <label htmlFor="rehoyo-api-key">API Key</label>
          <div className="connection-input">
            <LockKey size={21} aria-hidden="true" />
            <input
              ref={apiKeyInputRef}
              id="rehoyo-api-key"
              name="apiKey"
              type="password"
              autoComplete="off"
              autoFocus
              required
              maxLength={4096}
              placeholder="粘贴 API Key"
            />
          </div>

          <label htmlFor="rehoyo-api-endpoint">API Endpoint</label>
          <div className="connection-input">
            <Plugs size={21} aria-hidden="true" />
            <input
              id="rehoyo-api-endpoint"
              name="endpoint"
              type="url"
              required
              defaultValue={connectionStatus?.endpoint || BIGMODEL_CODING_ENDPOINT}
              spellCheck={false}
            />
          </div>

          {error && <p className="connection-error" role="alert">{error}</p>}

          <button type="submit" disabled={phase === 'saving'}>
            <span>{phase === 'saving' ? '正在安全保存…' : '连接并进入'}</span>
            <ArrowRight size={21} aria-hidden="true" />
          </button>
        </form>

        <footer className="connection-privacy">
          <ShieldCheck size={21} weight="duotone" aria-hidden="true" />
          <p><strong>仅保存在此设备</strong><span>密钥由操作系统加密，不写入项目、浏览器存储或 ReHoYo 日志。</span></p>
        </footer>
      </section>
    </main>
  )
}
