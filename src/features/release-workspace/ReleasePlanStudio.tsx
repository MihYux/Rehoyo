import { ArrowRight, Check, Database, MagnifyingGlass, PaperPlaneTilt, PencilSimple, Stop } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Streamdown } from 'streamdown'
import 'streamdown/styles.css'
import {
  getLiveAdvisorClient,
  getLiveResearchClient,
  type LiveAdvisorResult,
  type LiveAdvisorStatus,
  type LiveAdvisorStreamEvent,
} from '../../desktop/bridge'
import { applyReleasePlanMarkdown, buildReleasePlanMarkdown } from '../../domain/release-plan-markdown'
import { createPlanVersion, deriveReleasePlan, type ReleaseProject } from '../../domain/release-project'
import './ReleasePlanStudio.css'

interface Props {
  project: ReleaseProject
  onUpdate: (project: ReleaseProject) => void
  onShowEvidence: () => void
}

interface AgentTurn {
  id: string
  requestId: string
  question: string
  answer: string
  state: 'streaming' | 'complete' | 'error' | 'cancelled'
  error?: string
}

let requestSequence = 0
function requestId(prefix: string) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  requestSequence += 1
  return `${prefix}-${Date.now()}-${requestSequence}`
}

function extractMarkdown(answer: string) {
  const fenced = answer.match(/```(?:markdown|md)?\s*\n([\s\S]*?)```/i)?.[1]?.trim()
  if (fenced?.startsWith('# ')) return fenced
  return answer.trim().startsWith('# ') ? answer.trim() : ''
}

export function ReleasePlanStudio({ project, onUpdate, onShowEvidence }: Props) {
  const generatedMarkdown = useMemo(() => buildReleasePlanMarkdown(project), [project])
  const markdown = project.releasePlanDocument?.markdown ?? generatedMarkdown
  const revision = project.releasePlanDocument?.revision ?? 0
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(markdown)
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<AgentTurn[]>([])
  const [status, setStatus] = useState<LiveAdvisorStatus>()
  const [searching, setSearching] = useState(false)
  const [searchMessage, setSearchMessage] = useState('')
  const activeRequest = useRef<string | null>(null)
  const advisor = useMemo(() => getLiveAdvisorClient(), [])
  const research = useMemo(() => getLiveResearchClient(), [])

  useEffect(() => setDraft(markdown), [markdown])
  useEffect(() => {
    if (!advisor) return
    let active = true
    void advisor.getStatus().then((next) => { if (active) setStatus(next) }).catch(() => { if (active) setStatus({ configured: false, endpoint: '', model: '' }) })
    return () => { active = false }
  }, [advisor])

  useEffect(() => {
    if (!advisor?.onEvent) return
    const unsubscribe = advisor.onEvent((event: LiveAdvisorStreamEvent) => {
      if (activeRequest.current !== event.requestId) return
      setTurns((current) => current.map((turn) => {
        if (turn.requestId !== event.requestId) return turn
        if (event.type === 'delta') return { ...turn, answer: turn.answer + event.content }
        if (event.type === 'complete') return { ...turn, state: 'complete' }
        if (event.type === 'start') return turn
        return { ...turn, state: event.type, error: event.error }
      }))
      if (['complete', 'error', 'cancelled'].includes(event.type)) activeRequest.current = null
    })
    return () => {
      unsubscribe()
      if (activeRequest.current && advisor.cancel) void advisor.cancel(activeRequest.current)
    }
  }, [advisor])

  function settle(requestIdValue: string, result: LiveAdvisorResult) {
    if (activeRequest.current !== requestIdValue) return
    setTurns((current) => current.map((turn) => turn.requestId !== requestIdValue ? turn : result.ok
      ? { ...turn, answer: turn.answer || result.content, state: 'complete' }
      : { ...turn, state: result.cancelled ? 'cancelled' : 'error', error: result.error }))
    activeRequest.current = null
  }

  async function askAgent(event: FormEvent) {
    event.preventDefault()
    const nextQuestion = question.trim()
    if (!nextQuestion || activeRequest.current) return
    if (!advisor || !status?.configured || !project.researchSnapshot?.evidence.length) {
      setSearchMessage('请先连接 GLM，并确保当前任务已有真实公开证据。')
      return
    }
    setQuestion('')
    const id = requestId('release-plan')
    activeRequest.current = id
    setTurns((current) => [...current, { id, requestId: id, question: nextQuestion, answer: '', state: 'streaming' }])
    const evidence = project.researchSnapshot.evidence.slice(0, 12).map((item) => ({
      id: item.id, source: item.source, region: item.region, excerptZh: item.excerptZh, sentiment: item.sentiment,
      topics: item.topics, title: item.title, url: item.url,
    }))
    const request = {
      question: `你正在编辑发行方案。用户要求：${nextQuestion}\n如果需要修改，请输出一个包含完整新版方案的 markdown 代码块；不得删除证据编号和原始 HTTPS 链接。`,
      localAnswer: markdown,
      dataMode: 'live' as const,
      evidence,
    }
    try {
      if (advisor.stream && advisor.onEvent && advisor.cancel) {
        const result = await advisor.stream({ requestId: id, request })
        settle(id, result)
      } else {
        settle(id, await advisor.ask(request))
      }
    } catch (error) {
      settle(id, { ok: false, error: error instanceof Error ? error.message : '发行方案 Agent 请求失败' })
    }
  }

  function applyAgentTurn(turn: AgentTurn) {
    const next = extractMarkdown(turn.answer)
    if (!next) return
    onUpdate(applyReleasePlanMarkdown(project, next, 'agent'))
  }

  function saveManualEdit() {
    onUpdate(applyReleasePlanMarkdown(project, draft, 'user'))
    setEditing(false)
  }

  async function continueResearch() {
    if (!research || searching) {
      setSearchMessage('桌面端实时研究 Agent 尚未连接。')
      return
    }
    setSearching(true)
    setSearchMessage('AI 正在控制真实浏览器继续检索三个区域；完成前不会补造数据。')
    try {
      const result = await research.run({
        runId: requestId(`release-plan-search-${project.id}`),
        gameName: project.game,
        versionLabel: project.version,
        versionTitle: project.updateName,
        regions: project.regions,
      })
      if (!result.ok) throw new Error(result.error)
      const plan = deriveReleasePlan(project, result.preset)
      const planVersion = createPlanVersion(project.id, plan, project.planVersions)
      const refreshed: ReleaseProject = {
        ...project,
        researchSnapshot: result.preset,
        researchRunIds: [...new Set([...project.researchRunIds, result.preset.id])],
        currentPlan: plan,
        planVersions: [...project.planVersions, planVersion],
        currentPlanVersionId: planVersion.id,
        updatedAt: new Date().toISOString(),
      }
      const updated = applyReleasePlanMarkdown(refreshed, buildReleasePlanMarkdown(refreshed), 'agent')
      onUpdate(updated)
      setSearchMessage('检索完成，已生成新的方案修订。')
    } catch (error) {
      setSearchMessage(`实时检索未完成：${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setSearching(false)
    }
  }

  return <section className="release-plan-studio" aria-label="全屏发行方案工作台">
    <header className="release-plan-studio__bar">
      <div><span>FINAL RELEASE BRIEF</span><strong>{project.game} · {project.version}</strong></div>
      <div className="release-plan-studio__meta"><span>修订 R{revision || '0 · 自动生成'}</span><span>{project.researchSnapshot?.evidence.length ?? 0} 条真实证据</span></div>
      <button type="button" onClick={onShowEvidence}><Database size={17} /> 查看证据</button>
      <button type="button" onClick={() => setEditing((value) => !value)}><PencilSimple size={17} /> {editing ? '预览方案' : '直接编辑'}</button>
      {editing && <button className="is-primary" type="button" onClick={saveManualEdit}><Check size={17} /> 保存修订</button>}
    </header>

    <div className="release-plan-studio__layout">
      <article className="release-plan-document">
        {editing
          ? <textarea aria-label="发行方案 Markdown 编辑器" value={draft} onChange={(event) => setDraft(event.target.value)} />
          : <div className="release-plan-markdown"><Streamdown mode="static" skipHtml>{markdown}</Streamdown></div>}
      </article>

      <aside className="release-plan-agent" role="region" aria-label="发行方案 Agent">
        <header><div><span>REHOYO RELEASE AGENT</span><strong>搜索、解释并编辑方案</strong></div><em>{status?.configured ? `${status.model.toUpperCase()} LIVE` : '等待连接'}</em></header>
        <button className="release-plan-agent__search" type="button" disabled={searching} onClick={() => void continueResearch()} aria-label="继续实时检索并更新方案">
          <MagnifyingGlass size={19} />
          <span><strong>{searching ? '正在实时检索…' : '继续实时检索'}</strong><small>真实浏览器 · CN / JP / WEST</small></span>
          <ArrowRight size={17} />
        </button>
        {searchMessage && <p className="release-plan-agent__status" aria-live="polite">{searchMessage}</p>}
        <div className="release-plan-agent__thread" aria-live="polite">
          {!turns.length && <div className="release-plan-agent__empty"><strong>让 Agent 修改这份方案</strong><p>例如：细化 D0～D7 行动、重新对比三个区域，或先继续搜索最新玩家反馈。</p></div>}
          {turns.map((turn) => {
            const proposed = extractMarkdown(turn.answer)
            return <article key={turn.id}><small>YOU</small><h3>{turn.question}</h3><div className="release-plan-agent__answer">{turn.answer ? <Streamdown mode={turn.state === 'streaming' ? 'streaming' : 'static'} isAnimating={turn.state === 'streaming'} skipHtml>{turn.answer}</Streamdown> : '正在读取当前方案与证据…'}</div>{turn.error && <p className="release-plan-agent__error">{turn.error}</p>}{proposed && <button type="button" onClick={() => applyAgentTurn(turn)} aria-label="应用 Agent 修改"><Check size={16} /> 应用 Agent 修改</button>}</article>
          })}
        </div>
        <form onSubmit={askAgent}><textarea aria-label="编辑或追问发行方案" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="告诉 Agent 要搜索、补充或修改什么…" /><button type="submit" disabled={!question.trim()} aria-label="发送给发行方案 Agent">{activeRequest.current ? <Stop size={18} /> : <PaperPlaneTilt size={19} />}</button></form>
        <footer>Agent 只能引用当前真实证据；应用修改会创建新修订，不覆盖历史版本。</footer>
      </aside>
    </div>
  </section>
}
