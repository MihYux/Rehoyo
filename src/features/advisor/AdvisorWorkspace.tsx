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
} from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { BrandMark } from '../../components/BrandMark'
import { getLiveAdvisorClient, type LiveAdvisorClient, type LiveAdvisorStatus } from '../../desktop/bridge'
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
  answerMode: 'live' | 'local'
  model?: string
  liveError?: string
}

export function AdvisorWorkspace({ preset, onBackToReport, onOpenEvidence, liveAdvisor }: AdvisorWorkspaceProps) {
  const [input, setInput] = useState('')
  const [turns, setTurns] = useState<ConversationTurn[]>([])
  const [isAsking, setIsAsking] = useState(false)
  const [liveStatus, setLiveStatus] = useState<LiveAdvisorStatus>()
  const advisorClient = useMemo(() => liveAdvisor ?? getLiveAdvisorClient(), [liveAdvisor])
  const isLiveResearch = preset.dataMode === 'live'
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

  const appendLocalTurn = (question: string, response: GroundedAdvisorResponse, liveError?: string) => {
    setTurns((current) => [...current, {
      ...response,
      id: `turn-${current.length + 1}`,
      question,
      answerMode: 'local',
      liveError,
    }])
  }

  const ask = async (question: string) => {
    const trimmed = question.trim()
    if (!trimmed || isAsking) return
    const response = getAdvisorResponse(preset, trimmed)
    setInput('')

    if (!advisorClient || !liveStatus?.configured) {
      appendLocalTurn(trimmed, response)
      return
    }

    setIsAsking(true)
    try {
      const evidence = preset.evidence
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
        }))
      const result = await advisorClient.ask({
        question: trimmed,
        localAnswer: response.answer,
        dataMode: isLiveResearch ? 'live' : 'demo',
        evidence,
      })

      if (!result.ok) {
        appendLocalTurn(trimmed, response, result.error)
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
    } catch {
      appendLocalTurn(trimmed, response, '实时模型请求失败')
    } finally {
      setIsAsking(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
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
              {liveStatus?.configured ? `${liveStatus.model.toLocaleUpperCase()} 实时连接` : `本地证据模式 · ${isLiveResearch ? '实时公开网页' : '演示数据快照'}`}
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
                    <small className={turn.answerMode === 'live' ? 'is-live' : ''}>{turn.answerMode === 'live' ? `${turn.model?.toLocaleUpperCase()} · LIVE` : 'LOCAL SNAPSHOT'}</small>
                  </header>
                  <p>{turn.answer}</p>
                  {turn.liveError && <div className="advisor-live-error">实时模型不可用，已回退本地证据：{turn.liveError}</div>}
                  {!!turn.evidenceIds.length && (
                    <footer>
                      <span><Database size={12} /> 引用证据</span>
                      {turn.evidenceIds.map((id) => <button type="button" key={id} aria-label={`查看证据 ${id}`} onClick={() => onOpenEvidence(id, 'controversies')}>{id}</button>)}
                    </footer>
                  )}
                </div>
              </motion.div>
            ))}
            {isAsking && <div className="advisor-pending"><Brain size={15} weight="duotone" /><span>GLM 正在综合当前证据链…</span></div>}
          </div>
          <form className="advisor-composer" onSubmit={submit}>
            <MagnifyingGlass size={18} />
            <input aria-label="向 AI 游戏顾问提问" value={input} disabled={isAsking} onChange={(event) => setInput(event.target.value)} placeholder="询问地区差异、版本风险或下一步策略…" />
            <button type="submit" disabled={!input.trim() || isAsking}><span>{isAsking ? '分析中' : '发送问题'}</span><PaperPlaneTilt size={16} weight="fill" /></button>
          </form>
          <p className="advisor-composer-note">AI 回答仅基于当前{isLiveResearch ? '任务检索到的公开网页证据；不代表全部玩家总体' : '演示数据快照，不代表实时市场研究结论'}。</p>
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
                    {isLiveResearch && item.url && <code className="evidence-source-url">{item.url}</code>}
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
