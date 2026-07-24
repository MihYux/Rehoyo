import { ArrowRight, ChatCircleText, Database, PaperPlaneTilt, Stop, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Streamdown } from 'streamdown'
import 'streamdown/styles.css'
import {
  getLiveAdvisorClient,
  type LiveAdvisorClient,
  type LiveAdvisorRequest,
  type LiveAdvisorResult,
  type LiveAdvisorStatus,
  type LiveAdvisorStreamEvent,
} from '../../desktop/bridge'
import type { ReleaseProject, ReleaseRegion } from '../../domain/release-project'

interface Props {
  project: ReleaseProject
  region: ReleaseRegion
  onShowEvidence: () => void
}

interface AssistantTurn {
  id: string
  requestId?: string
  question: string
  answer: string
  fallbackAnswer: string
  mode: 'live' | 'local'
  state: 'streaming' | 'complete' | 'error' | 'cancelled'
  model?: string
  error?: string
}

const regionLabels: Record<ReleaseRegion, string> = { CN: '中国', JP: '日本', WEST: '北美及英语市场' }
const questions = ['为什么这样规划这个区域？', '当前最需要人工确认什么？', '证据还缺什么？']
let fallbackRequestSequence = 0

function createRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  fallbackRequestSequence += 1
  return `release-assistant-${Date.now()}-${fallbackRequestSequence}`
}

export function ReleaseAssistant({ project, region, onShowEvidence }: Props) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<AssistantTurn[]>([])
  const [isAsking, setIsAsking] = useState(false)
  const [liveStatus, setLiveStatus] = useState<LiveAdvisorStatus>()
  const activeRequestId = useRef<string | null>(null)
  const advisorClient = useMemo(() => getLiveAdvisorClient(), [])
  const plan = project.currentPlan
  const regional = plan?.regionalPlans.find((item) => item.region === region)
  const actions = plan?.actions.filter((item) => item.region === region) ?? []
  const evidenceIds = useMemo(() => regional?.decisionTrace.evidenceIds ?? [], [regional])
  const regionalEvidence = useMemo(() => {
    const evidence = project.researchSnapshot?.evidence ?? []
    const cited = evidence.filter((item) => item.region === region && evidenceIds.includes(item.id))
    return (cited.length ? cited : evidence.filter((item) => item.region === region)).slice(0, 12)
  }, [evidenceIds, project.researchSnapshot?.evidence, region])

  useEffect(() => {
    let active = true
    if (!advisorClient) return undefined
    void advisorClient.getStatus()
      .then((status) => { if (active) setLiveStatus(status) })
      .catch(() => { if (active) setLiveStatus({ configured: false, endpoint: '', model: '' }) })
    return () => { active = false }
  }, [advisorClient])

  useEffect(() => {
    if (!advisorClient?.onEvent) return undefined
    const finish = (requestId: string) => {
      if (activeRequestId.current !== requestId) return
      activeRequestId.current = null
      setIsAsking(false)
    }
    const unsubscribe = advisorClient.onEvent((event: LiveAdvisorStreamEvent) => {
      if (activeRequestId.current !== event.requestId) return
      setTurns((current) => current.map((turn) => {
        if (turn.requestId !== event.requestId) return turn
        if (event.type === 'start') return { ...turn, model: event.model, state: 'streaming' }
        if (event.type === 'delta') return { ...turn, answer: `${turn.answer}${event.content}` }
        if (event.type === 'complete') return { ...turn, model: event.model, state: 'complete' }
        const hasPartialAnswer = Boolean(turn.answer.trim())
        return {
          ...turn,
          answer: hasPartialAnswer ? turn.answer : turn.fallbackAnswer,
          mode: hasPartialAnswer ? 'live' : 'local',
          state: event.type,
          error: event.type === 'cancelled'
            ? '已停止生成，已保留当前内容。'
            : hasPartialAnswer ? `回答未完成：${event.error}` : `实时模型不可用，已显示本地证据解释：${event.error}`,
        }
      }))
      if (['complete', 'error', 'cancelled'].includes(event.type)) finish(event.requestId)
    })
    return () => {
      unsubscribe()
      const requestId = activeRequestId.current
      activeRequestId.current = null
      if (requestId && advisorClient.cancel) void advisorClient.cancel(requestId)
    }
  }, [advisorClient])

  function explain(input: string) {
    if (!regional) return '当前项目还没有生成区域方案。'
    if (/证据|缺|来源/.test(input)) {
      return regional.evidenceCount
        ? `${regionLabels[region]}当前有 ${regional.evidenceCount} 条可核验公开证据。它们只支持“${regional.playerSignals.join('、') || '继续观察'}”这些已出现主题；仍不能代表全部当地玩家。`
        : `${regionLabels[region]}当前没有可核验区域证据。方案只保留Brief驱动的基础动作，不会把它描述为当地玩家偏好。`
    }
    if (/人工|确认|风险|审批/.test(input)) {
      const pending = actions.filter((item) => item.requiresApproval)
      return pending.length
        ? `${regionLabels[region]}有 ${pending.length} 项动作需要人工确认，优先检查“${pending[0].title}”：${pending[0].evaluation.issues.join('、') || '需要确认执行边界'}。`
        : `${regionLabels[region]}当前没有强制审批动作；执行前仍需核对素材、日期和渠道权限。`
    }
    return regional.strategySummary + ` 判断依据为${regional.decisionTrace.basis === 'evidence_backed' ? '真实公开证据与版本Brief' : '版本Brief'}，置信度为${regional.decisionTrace.confidence === 'high' ? '高' : regional.decisionTrace.confidence === 'medium' ? '中' : '低'}。`
  }

  function appendLocalTurn(nextQuestion: string, fallbackAnswer: string, error?: string) {
    setTurns((current) => [...current, {
      id: `local-${current.length + 1}`,
      question: nextQuestion,
      answer: fallbackAnswer,
      fallbackAnswer,
      mode: 'local',
      state: error ? 'error' : 'complete',
      error,
    }])
  }

  function buildLiveRequest(nextQuestion: string, fallbackAnswer: string): LiveAdvisorRequest {
    return {
      question: nextQuestion,
      localAnswer: [
        `游戏：${project.game} ${project.version} ${project.updateName}`,
        `区域：${regionLabels[region]}`,
        `当前方案：${regional?.strategySummary || '尚未生成区域方案'}`,
        `确定性本地解释：${fallbackAnswer}`,
      ].join('\n'),
      dataMode: 'live',
      evidence: regionalEvidence.map((item) => ({
        id: item.id,
        source: item.source,
        region: item.region,
        excerptZh: item.excerptZh,
        sentiment: item.sentiment,
        topics: item.topics,
        title: item.title,
        url: item.url,
      })),
    }
  }

  function settleWithoutEvent(requestId: string, result: LiveAdvisorResult) {
    if (activeRequestId.current !== requestId) return
    setTurns((current) => current.map((turn) => {
      if (turn.requestId !== requestId) return turn
      if (result.ok) return { ...turn, answer: turn.answer || result.content, model: result.model, state: 'complete' }
      const hasPartialAnswer = Boolean(turn.answer.trim())
      return {
        ...turn,
        answer: hasPartialAnswer ? turn.answer : turn.fallbackAnswer,
        mode: hasPartialAnswer ? 'live' : 'local',
        state: result.cancelled ? 'cancelled' : 'error',
        error: result.cancelled ? '已停止生成，已保留当前内容。' : hasPartialAnswer ? `回答未完成：${result.error}` : `实时模型不可用，已显示本地证据解释：${result.error}`,
      }
    }))
    activeRequestId.current = null
    setIsAsking(false)
  }

  async function ask(value: string) {
    const next = value.trim()
    if (!next || isAsking) return
    const fallbackAnswer = explain(next)
    setQuestion('')
    if (!advisorClient || !liveStatus?.configured || !regionalEvidence.length) {
      appendLocalTurn(next, fallbackAnswer, !regionalEvidence.length ? '当前区域没有可供实时模型引用的真实证据。' : undefined)
      return
    }

    setIsAsking(true)
    const request = buildLiveRequest(next, fallbackAnswer)
    try {
      if (advisorClient.stream && advisorClient.onEvent && advisorClient.cancel) {
        const requestId = createRequestId()
        activeRequestId.current = requestId
        setTurns((current) => [...current, {
          id: requestId,
          requestId,
          question: next,
          answer: '',
          fallbackAnswer,
          mode: 'live',
          state: 'streaming',
          model: liveStatus.model,
        }])
        const result = await advisorClient.stream({ requestId, request })
        settleWithoutEvent(requestId, result)
        return
      }
      const result = await advisorClient.ask(request)
      if (!result.ok) {
        appendLocalTurn(next, fallbackAnswer, `实时模型不可用，已显示本地证据解释：${result.error}`)
      } else {
        setTurns((current) => [...current, { id: result.requestId || `live-${current.length + 1}`, question: next, answer: result.content, fallbackAnswer, mode: 'live', state: 'complete', model: result.model }])
      }
    } catch (error) {
      const requestId = activeRequestId.current
      if (requestId) settleWithoutEvent(requestId, { ok: false, error: error instanceof Error ? error.message : '实时模型请求失败' })
      else appendLocalTurn(next, fallbackAnswer, '实时模型请求失败，已显示本地证据解释。')
    } finally {
      if (!activeRequestId.current) setIsAsking(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isAsking) {
      const requestId = activeRequestId.current
      if (requestId && advisorClient?.cancel) void advisorClient.cancel(requestId)
      return
    }
    void ask(question)
  }

  return <>
    <button className="release-assistant-launcher" type="button" onClick={() => setOpen(true)} aria-label="打开常驻发行助手"><ChatCircleText size={21} weight="fill" /><span>问发行助手</span></button>
    {open && <aside className="release-assistant-panel" aria-label="常驻发行助手">
      <header><div><span>REHOYO RELEASE COPILOT</span><strong>{regionLabels[region]}决策解释</strong></div><button type="button" onClick={() => setOpen(false)} aria-label="关闭发行助手"><X size={19} /></button></header>
      <section className="release-assistant-context"><Database size={18} /><div><strong>{regional?.evidenceCount ?? 0} 条区域证据</strong><span>{liveStatus?.configured ? `${liveStatus.model.toLocaleUpperCase()} 实时连接` : regional?.decisionTrace.basis === 'evidence_backed' ? '本地证据解释' : 'Brief驱动／证据不足'}</span></div></section>
      <div className="release-assistant-questions">{questions.map((item) => <button type="button" key={item} disabled={isAsking} onClick={() => void ask(item)}>{item}<ArrowRight size={15} /></button>)}</div>
      <div className="release-assistant-thread" aria-live="polite">
        {turns.map((turn) => <article key={turn.id}>
          <small>YOU · {turn.question}</small>
          <header><span>ASSISTANT</span><em>{turn.mode === 'live' ? `${turn.model?.toLocaleUpperCase() || 'GLM'} · ${turn.state === 'streaming' ? 'STREAMING' : 'LIVE'}` : 'LOCAL EVIDENCE'}</em></header>
          {turn.answer ? <div className="release-assistant-markdown"><Streamdown mode={turn.state === 'streaming' ? 'streaming' : 'static'} isAnimating={turn.state === 'streaming'} skipHtml>{turn.answer}</Streamdown></div> : <p>正在建立安全流式连接…</p>}
          {turn.error && <p className="release-assistant-error">{turn.error}</p>}
          {evidenceIds.length > 0 && <button type="button" onClick={onShowEvidence}>查看 {evidenceIds.length} 条判断依据 <ArrowRight size={14} /></button>}
        </article>)}
      </div>
      <form onSubmit={submit}><input value={question} disabled={isAsking} onChange={(event) => setQuestion(event.target.value)} placeholder="输入任意区域、风险或证据问题" aria-label="询问发行助手" /><button type="submit" disabled={!isAsking && !question.trim()} aria-label={isAsking ? '停止生成' : '发送问题'}>{isAsking ? <Stop size={17} weight="fill" /> : <PaperPlaneTilt size={18} />}</button></form>
      <small>回答只读取当前Brief、方案与真实证据，不补造玩家观点。</small>
    </aside>}
  </>
}
