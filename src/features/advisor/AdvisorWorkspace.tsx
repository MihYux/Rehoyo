import {
  ArrowLeft,
  ArrowRight,
  Brain,
  ChatCircleText,
  Database,
  MagnifyingGlass,
  PaperPlaneTilt,
  Quotes,
  Sparkle,
  Stop,
} from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { defaultUrlTransform, Streamdown, type UrlTransform } from 'streamdown'
import 'streamdown/styles.css'
import { BrandMark } from '../../components/BrandMark'
import {
  getLiveAdvisorClient,
  type LiveAdvisorClient,
  type LiveAdvisorRequest,
  type LiveAdvisorStatus,
  type LiveAdvisorStreamEvent,
} from '../../desktop/bridge'
import { getAdvisorResponse, type GroundedAdvisorResponse } from '../../domain/advisor'
import type { AnalysisPreset } from '../../domain/types'
import type { ReportTab } from '../report/ReportDashboard'

interface AdvisorWorkspaceProps {
  preset: AnalysisPreset
  onBackToReport: () => void
  onOpenEvidence: (evidenceId: string, tab: ReportTab) => void
  liveAdvisor?: LiveAdvisorClient
}

interface ConversationTurn extends GroundedAdvisorResponse {
  id: string
  question: string
  answerMode: 'live' | 'evidence'
  model?: string
  liveError?: string
  requestId?: string
  fallbackAnswer?: string
  streamState?: 'streaming' | 'complete' | 'cancelled' | 'error'
}

const advisorUrlTransform: UrlTransform = (url, key, node) => {
  const safeUrl = defaultUrlTransform(url, key, node)
  if (!safeUrl) return null
  return safeUrl.startsWith('https://') || safeUrl.startsWith('#') ? safeUrl : null
}

let fallbackRequestSequence = 0

function createAdvisorRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  fallbackRequestSequence += 1
  return `advisor-${Date.now()}-${fallbackRequestSequence}`
}

function getTurnStatus(turn: ConversationTurn) {
  if (turn.answerMode !== 'live') return 'REAL EVIDENCE FALLBACK'
  if (turn.streamState === 'streaming') return `${turn.model?.toLocaleUpperCase()} · STREAMING`
  if (turn.streamState === 'cancelled' || turn.streamState === 'error') return `${turn.model?.toLocaleUpperCase()} · PARTIAL`
  return `${turn.model?.toLocaleUpperCase()} · LIVE`
}

export function AdvisorWorkspace({ preset, onBackToReport, onOpenEvidence, liveAdvisor }: AdvisorWorkspaceProps) {
  const [input, setInput] = useState('')
  const [turns, setTurns] = useState<ConversationTurn[]>([])
  const [isAsking, setIsAsking] = useState(false)
  const [liveStatus, setLiveStatus] = useState<LiveAdvisorStatus>()
  const activeRequestIdRef = useRef<string | undefined>(undefined)
  const advisorClient = useMemo(() => liveAdvisor ?? getLiveAdvisorClient(), [liveAdvisor])
  const suggestedQuestions = preset.advisorAnswers.length
    ? preset.advisorAnswers.map((item) => item.question)
    : ['不同地区的真实证据有什么差异？', '当前最大风险是什么？', '下一版本应该优先改进什么？', '哪些结论的证据仍然不足？']
  const activeTurn = turns.at(-1)
  const activeEvidence = useMemo(
    () => preset.evidence.filter((item) => activeTurn?.evidenceIds.includes(item.id)),
    [activeTurn, preset.evidence],
  )

  useEffect(() => {
    let active = true
    if (!advisorClient) return undefined

    void advisorClient.getStatus()
      .then((status) => {
        if (active) setLiveStatus(status)
      })
      .catch(() => {
        if (active) setLiveStatus({ configured: false, endpoint: '', model: '' })
      })

    return () => {
      active = false
    }
  }, [advisorClient])

  useEffect(() => {
    if (!advisorClient?.onEvent) return undefined

    const finishRequest = (requestId: string) => {
      if (activeRequestIdRef.current !== requestId) return
      activeRequestIdRef.current = undefined
      setIsAsking(false)
    }

    const updateStreamingTurn = (event: LiveAdvisorStreamEvent) => {
      if (activeRequestIdRef.current !== event.requestId) return
      setTurns((current) => current.map((turn) => {
        if (turn.requestId !== event.requestId) return turn
        if (event.type === 'start') return { ...turn, model: event.model, streamState: 'streaming' }
        if (event.type === 'delta') return { ...turn, answer: `${turn.answer}${event.content}` }
        if (event.type === 'complete') return { ...turn, model: event.model, streamState: 'complete' }

        const hasPartialAnswer = Boolean(turn.answer.trim())
        const isCancelled = event.type === 'cancelled'
        return {
          ...turn,
          answer: hasPartialAnswer ? turn.answer : turn.fallbackAnswer || turn.answer,
          answerMode: hasPartialAnswer ? 'live' : 'evidence',
          streamState: event.type,
          liveError: isCancelled
            ? '已停止生成，已保留当前内容。'
            : hasPartialAnswer
              ? `回答未完成：${event.error}`
              : `实时模型不可用，已回退本地证据：${event.error}`,
        }
      }))

      if (event.type === 'complete' || event.type === 'error' || event.type === 'cancelled') {
        finishRequest(event.requestId)
      }
    }

    const unsubscribe = advisorClient.onEvent(updateStreamingTurn)
    return () => {
      unsubscribe()
      const requestId = activeRequestIdRef.current
      activeRequestIdRef.current = undefined
      if (requestId && advisorClient.cancel) void advisorClient.cancel(requestId)
    }
  }, [advisorClient])

  const appendEvidenceTurn = (question: string, response: GroundedAdvisorResponse, liveError?: string) => {
    setTurns((current) => [...current, {
      ...response,
      id: `turn-${current.length + 1}`,
      question,
      answerMode: 'evidence',
      liveError: liveError ? `实时模型不可用，已回退本地证据：${liveError}` : undefined,
    }])
  }

  const buildLiveRequest = (question: string, response: GroundedAdvisorResponse): LiveAdvisorRequest => ({
    question,
    localAnswer: response.answer,
    dataMode: 'live',
    evidence: preset.evidence
      .filter((item) => response.evidenceIds.includes(item.id))
      .map((item) => ({
        id: item.id,
        source: item.source,
        region: item.region,
        excerptZh: item.excerptZh,
        sentiment: item.sentiment,
        topics: item.topics,
        title: item.title,
        url: item.url,
      })),
  })

  const settleStreamWithoutEvent = (
    requestId: string,
    result: Awaited<ReturnType<NonNullable<LiveAdvisorClient['stream']>>>,
  ) => {
    if (activeRequestIdRef.current !== requestId) return
    setTurns((current) => current.map((turn) => {
      if (turn.requestId !== requestId) return turn
      if (result.ok) {
        return {
          ...turn,
          answer: turn.answer || result.content,
          model: result.model,
          streamState: 'complete',
        }
      }

      const hasPartialAnswer = Boolean(turn.answer.trim())
      return {
        ...turn,
        answer: hasPartialAnswer ? turn.answer : turn.fallbackAnswer || turn.answer,
        answerMode: hasPartialAnswer ? 'live' : 'evidence',
        streamState: result.cancelled ? 'cancelled' : 'error',
        liveError: result.cancelled
          ? '已停止生成，已保留当前内容。'
          : hasPartialAnswer
            ? `回答未完成：${result.error}`
            : `实时模型不可用，已回退本地证据：${result.error}`,
      }
    }))
    activeRequestIdRef.current = undefined
    setIsAsking(false)
  }

  const ask = async (question: string) => {
    const trimmed = question.trim()
    if (!trimmed || isAsking) return
    const response = getAdvisorResponse(preset, trimmed)
    setInput('')

    if (!response.evidenceIds.length) {
      appendEvidenceTurn(trimmed, response)
      return
    }

    if (!advisorClient || !liveStatus?.configured) {
      appendEvidenceTurn(trimmed, response)
      return
    }

    setIsAsking(true)
    try {
      const liveRequest = buildLiveRequest(trimmed, response)
      if (advisorClient.stream && advisorClient.onEvent && advisorClient.cancel) {
        const requestId = createAdvisorRequestId()
        activeRequestIdRef.current = requestId
        setTurns((current) => [...current, {
          ...response,
          answer: '',
          fallbackAnswer: response.answer,
          id: requestId,
          requestId,
          question: trimmed,
          answerMode: 'live',
          model: liveStatus.model,
          streamState: 'streaming',
        }])
        const result = await advisorClient.stream({ requestId, request: liveRequest })
        settleStreamWithoutEvent(requestId, result)
        return
      }

      const result = await advisorClient.ask(liveRequest)

      if (!result.ok) {
        appendEvidenceTurn(trimmed, response, result.error)
        return
      }

      setTurns((current) => [...current, {
        ...response,
        answer: result.content,
        id: `turn-${current.length + 1}`,
        question: trimmed,
        answerMode: 'live',
        model: result.model,
      }])
    } catch (error) {
      const requestId = activeRequestIdRef.current
      if (requestId) {
        settleStreamWithoutEvent(requestId, {
          ok: false,
          error: error instanceof Error ? error.message : '实时模型请求失败',
        })
      } else {
        appendEvidenceTurn(trimmed, response, '实时模型请求失败')
      }
    } finally {
      if (!activeRequestIdRef.current) setIsAsking(false)
    }
  }

  const stopGenerating = () => {
    const requestId = activeRequestIdRef.current
    if (requestId && advisorClient?.cancel) void advisorClient.cancel(requestId)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (isAsking) {
      stopGenerating()
      return
    }
    void ask(input)
  }

  return (
    <div className="advisor-page">
      <header className="advisor-header">
        <button type="button" className="advisor-back" onClick={onBackToReport} aria-label="返回洞察报告"><ArrowLeft size={16} /></button>
        <BrandMark compact />
        <div className="advisor-header__title"><span>GROUNDED GAME ADVISOR</span><strong>AI 游戏顾问</strong></div>
        <div className="advisor-report-context"><span>{preset.game.name}</span><strong>{preset.version.label} · {preset.version.title}</strong></div>
        <span className="advisor-grounded"><Database size={14} /> GROUNDED IN {preset.evidence.length} EVIDENCE</span>
      </header>

      <main className="advisor-main">
        <aside className="advisor-sidebar">
          <div className="advisor-identity">
            <div><Brain size={28} weight="duotone" /></div>
            <span>STRATEGY AGENT</span>
            <h1>版本决策顾问</h1>
            <p>只基于本次 Agent 团队收集和分析的证据回答，不补充未验证的外部信息。</p>
          </div>
          <section>
            <span>SUGGESTED QUESTIONS</span>
            <div className="suggested-questions">
              {suggestedQuestions.map((question, index) => (
                <button type="button" key={question} aria-label={question} disabled={isAsking} onClick={() => void ask(question)}>
                  <i>{String(index + 1).padStart(2, '0')}</i><span>{question}</span><ArrowRight size={13} />
                </button>
              ))}
            </div>
          </section>
          <div className="advisor-rule"><Sparkle size={15} /><p><strong>证据优先</strong>每个结论都会显示引用编号，可返回报告查看原始观点。</p></div>
        </aside>

        <section className="advisor-chat">
          <div className="advisor-chat__head">
            <div><ChatCircleText size={17} /><span>ADVISOR SESSION</span></div>
            <small className={liveStatus?.configured ? 'is-live' : ''}>
              {liveStatus?.configured ? `${liveStatus.model.toLocaleUpperCase()} 实时连接` : '本地检索 · 真实公开网页证据'}
            </small>
          </div>
          <div className="conversation-stream" aria-live="polite">
            <div className="advisor-welcome">
              <span><Sparkle size={16} /></span>
              <div><strong>报告已经准备好。</strong><p>我可以解释地区差异、争议成因、未来风险和版本策略。所有回答都会附带可定位的证据。</p></div>
            </div>
            {turns.map((turn) => (
              <motion.div className="conversation-turn" key={turn.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <div className="user-question"><span>YOU</span><p>{turn.question}</p></div>
                <div className="advisor-answer">
                  <header>
                    <Brain size={15} weight="duotone" />
                    <span>REHOYO ADVISOR</span>
                    {turn.isFallback && <small>证据不足</small>}
                    <small className={turn.answerMode === 'live' ? 'is-live' : ''}>{getTurnStatus(turn)}</small>
                  </header>
                  {turn.answer ? (
                    <div className="advisor-markdown">
                      <Streamdown
                        mode={turn.streamState === 'streaming' ? 'streaming' : 'static'}
                        isAnimating={turn.streamState === 'streaming'}
                        skipHtml
                        urlTransform={advisorUrlTransform}
                      >
                        {turn.answer}
                      </Streamdown>
                    </div>
                  ) : <div className="advisor-stream-connecting">正在建立安全流式连接…</div>}
                  {turn.liveError && <div className="advisor-live-error">{turn.liveError}</div>}
                  {!!turn.evidenceIds.length && (
                    <footer>
                      <span><Database size={12} /> 引用证据</span>
                      {turn.evidenceIds.map((id) => <button type="button" key={id} aria-label={`查看证据 ${id}`} onClick={() => onOpenEvidence(id, 'controversies')}>{id}</button>)}
                    </footer>
                  )}
                </div>
              </motion.div>
            ))}
            {isAsking && !activeTurn?.answer && <div className="advisor-pending"><Brain size={15} weight="duotone" /><span>GLM 正在综合当前证据链…</span></div>}
          </div>
          <form className="advisor-composer" onSubmit={submit}>
            <MagnifyingGlass size={18} />
            <input aria-label="向 AI 游戏顾问提问" value={input} disabled={isAsking} onChange={(event) => setInput(event.target.value)} placeholder="询问地区差异、版本风险或下一步策略…" />
            <button type="submit" className={isAsking ? 'is-stop' : ''} disabled={!isAsking && !input.trim()}>
              <span>{isAsking ? '停止生成' : '发送问题'}</span>
              {isAsking ? <Stop size={15} weight="fill" /> : <PaperPlaneTilt size={16} weight="fill" />}
            </button>
          </form>
          <p className="advisor-composer-note">AI 回答仅基于当前任务实际检索到的公开网页证据；不代表全部玩家总体。</p>
        </section>

        <aside className="advisor-evidence-rail">
          <header><div><Quotes size={17} /><span>EVIDENCE CHAIN</span></div><strong>{activeEvidence.length.toString().padStart(2, '0')}</strong></header>
          {activeTurn ? (
            <>
              <div className="evidence-chain-summary"><span>当前回答</span><p>{activeTurn.question}</p></div>
              <div className="advisor-evidence-list">
                {activeEvidence.map((item, index) => (
                  <article key={item.id}>
                    <header><i>{String(index + 1).padStart(2, '0')}</i><span>{item.source}</span><small>{item.region}</small></header>
                    <blockquote>{item.excerptZh}</blockquote>
                    <code className="evidence-source-url">{item.url}</code>
                    <footer><span>{item.id}</span><button type="button" onClick={() => onOpenEvidence(item.id, 'controversies')}>在报告中查看 <ArrowRight size={12} /></button></footer>
                  </article>
                ))}
                {!activeEvidence.length && <div className="advisor-evidence-empty"><Database size={22} /><p>当前回答没有引用证据。尝试提出与报告内容相关的问题。</p></div>}
              </div>
            </>
          ) : (
            <div className="advisor-evidence-empty"><Database size={25} /><p>提出问题后，相关证据会在这里组成可追溯链路。</p></div>
          )}
        </aside>
      </main>
    </div>
  )
}
