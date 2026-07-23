import {
  ArrowLeft,
  Browser,
  Broadcast,
  Check,
  CircleNotch,
  Clock,
  Database,
  DotsThree,
  GlobeHemisphereWest,
  LockSimple,
  MagnifyingGlass,
  Pulse,
  Strategy,
  Translate,
  TrendUp,
  Warning,
  X,
} from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BrandMark } from '../../components/BrandMark'
import { getLiveResearchClient } from '../../desktop/bridge'
import { isGroundedEvidence, isGroundedLivePreset } from '../../domain/grounding'
import type {
  AgentDefinition,
  AgentId,
  AgentRuntimeState,
  AnalysisEvent,
  AnalysisPreset,
  EvidenceRecord,
  RuntimeTask,
} from '../../domain/types'

interface TaskWorkspaceProps {
  preset: AnalysisPreset
  initialTask: RuntimeTask
  onComplete: (task: RuntimeTask, preset?: AnalysisPreset) => void
  clock?: () => number
}

const agentIcons = {
  research: MagnifyingGlass,
  sentiment: TrendUp,
  regional: Translate,
  strategy: Strategy,
}

const statusLabels: Record<AgentRuntimeState['status'], string> = {
  locked: '等待依赖',
  queued: '已排队',
  running: '运行中',
  handoff: '交接中',
  completed: '已完成',
  failed: '异常',
}

const severityLabels = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '严重',
}

function formatElapsed(ms: number) {
  const seconds = Math.floor(ms / 1_000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function formatEventTime(startedAt: number, offsetMs: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(startedAt + offsetMs))
}

function eventIcon(event: AnalysisEvent) {
  if (event.kind === 'complete') return Check
  if (event.kind === 'risk') return Warning
  if (event.kind === 'source') return Database
  if (event.kind === 'finding') return Pulse
  return Broadcast
}

const liveAgentOrder: AgentId[] = ['research', 'sentiment', 'regional', 'strategy']

const agentWorkspaceLabels: Record<AgentId, string> = {
  research: '公开社区检索',
  sentiment: '反馈语义分类',
  regional: '跨地区语义比对',
  strategy: '策略综合文档',
}

const agentIdleSummaries: Record<AgentId, string> = {
  research: '正在初始化全球公开来源检索队列。',
  sentiment: '等待首批公开证据后开始情绪与原因分类。',
  regional: '等待可比对的中、日、英证据簇。',
  strategy: '等待上游 Agent 完成证据交接。',
}

interface AgentBrowserPreview {
  address: string
  badge: '真实网页' | '等待真实来源' | 'Agent 进程'
  evidence?: EvidenceRecord
  source: string
  summary: string
  title: string
}

function deriveAgentBrowserPreview(
  agent: AgentDefinition,
  events: AnalysisEvent[],
  evidence: EvidenceRecord[],
): AgentBrowserPreview {
  const agentEvents = events.filter((event) => event.agentId === agent.id)
  const latestEvent = agentEvents.at(-1)
  const evidenceId = agentEvents.flatMap((event) => event.evidenceIds).at(-1)
  const activeEvidence = evidence.find((item) => item.id === evidenceId)
  const source = latestEvent?.source ?? activeEvidence?.source ?? agent.sources[0] ?? 'ReHoYo Workspace'
  const hasLivePage = Boolean(activeEvidence?.url)
  const address = hasLivePage
    ? activeEvidence!.url!
    : `agent://${agent.id}/${activeEvidence?.id ?? 'awaiting-real-source'}`

  return {
    address,
    badge: hasLivePage ? '真实网页' : agent.id === 'research' ? '等待真实来源' : 'Agent 进程',
    evidence: activeEvidence,
    source,
    summary: latestEvent?.message ?? agentIdleSummaries[agent.id],
    title: activeEvidence?.title ?? latestEvent?.message ?? agentWorkspaceLabels[agent.id],
  }
}

function deriveLiveAgentStates(events: AnalysisEvent[]) {
  return Object.fromEntries(liveAgentOrder.map((id) => {
    const agentEvents = events.filter((event) => event.agentId === id)
    const latest = agentEvents.at(-1)
    const finished = agentEvents.some((event) => event.kind === 'handoff' || event.kind === 'complete')
    let status: AgentRuntimeState['status'] = id === 'strategy' ? 'locked' : 'queued'
    if (latest) status = finished ? 'completed' : 'running'
    return [id, {
      id,
      status,
      progress: latest?.progress ?? 0,
      evidenceIds: [...new Set(agentEvents.flatMap((event) => event.evidenceIds))],
      findingIds: agentEvents.filter((event) => ['finding', 'risk'].includes(event.kind)).map((event) => event.id),
    }]
  })) as Record<AgentId, AgentRuntimeState>
}

export function TaskWorkspace({
  preset,
  initialTask,
  onComplete,
  clock = Date.now,
}: TaskWorkspaceProps) {
  const [task, setTask] = useState(initialTask)
  const [runtimePreset, setRuntimePreset] = useState(preset)
  const [liveEvents, setLiveEvents] = useState<AnalysisEvent[]>([])
  const [liveEvidence, setLiveEvidence] = useState<EvidenceRecord[]>([])
  const [liveError, setLiveError] = useState('')
  const [selectedAgent, setSelectedAgent] = useState<AgentId | null>(null)
  const completionSent = useRef(false)
  const liveRunStarted = useRef(false)
  const integrityFailure = useRef('')

  useEffect(() => {
    if (liveRunStarted.current) return
    const client = getLiveResearchClient()
    if (!client) {
      setLiveError('真实研究仅可在已配置 GLM 的 ReHoYo Electron 桌面端运行。')
      setTask((current) => ({ ...current, status: 'failed' }))
      return
    }
    let cancelled = false
    const unsubscribe = client.onEvent(({ runId, event }) => {
      if (cancelled || runId !== initialTask.id) return
      const evidenceRecords = event.evidenceRecords ?? []
      if (evidenceRecords.some((item) => !isGroundedEvidence(item))) {
        const message = '研究服务返回了缺少 HTTPS URL、检索时间或原始摘录的数据；任务已停止。'
        integrityFailure.current = message
        setLiveError(message)
        setTask((current) => ({ ...current, status: 'failed' }))
        return
      }
      setLiveEvents((current) => current.some((item) => item.id === event.id) ? current : [...current, event])
      if (evidenceRecords.length) {
        setLiveEvidence((current) => {
          const byId = new Map(current.map((item) => [item.id, item]))
          evidenceRecords.forEach((item) => byId.set(item.id, item))
          return [...byId.values()]
        })
      }
    })
    const interval = window.setInterval(() => {
      setTask((current) => current.status === 'running'
        ? { ...current, elapsedMs: Math.max(0, clock() - current.startedAt) }
        : current)
    }, 250)

    const startTimer = window.setTimeout(() => {
      if (cancelled || liveRunStarted.current) return
      liveRunStarted.current = true
      client.run({
        runId: initialTask.id,
        gameName: preset.game.name,
        versionLabel: preset.version.label,
        versionTitle: preset.version.title,
        regions: preset.regions,
      }).then((result) => {
        if (cancelled) return
        if (!result.ok) {
          setLiveError(result.error)
          setTask((current) => ({ ...current, status: 'failed' }))
          return
        }
        if (integrityFailure.current || !isGroundedLivePreset(result.preset)) {
          const message = integrityFailure.current || '研究结果未通过真实证据校验；任务已停止且不会生成报告。'
          setLiveError(message)
          setTask((current) => ({ ...current, status: 'failed' }))
          return
        }
        const completedAt = clock()
        setRuntimePreset(result.preset)
        setLiveEvents(result.preset.events)
        setLiveEvidence(result.preset.evidence)
        setTask((current) => ({
          ...current,
          presetId: result.preset.id,
          status: 'completed',
          elapsedMs: result.preset.durationMs,
          visibleEventIds: result.preset.events.map((event) => event.id),
          completedAt,
          dataMode: 'live',
          presetSnapshot: result.preset,
        }))
      }).catch((error) => {
        if (cancelled) return
        setLiveError(error instanceof Error ? error.message : '真实研究请求失败。')
        setTask((current) => ({ ...current, status: 'failed' }))
      })
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(startTimer)
      unsubscribe()
      window.clearInterval(interval)
    }
  }, [clock, initialTask.id, preset.game.name, preset.regions, preset.version.label, preset.version.title])

  useEffect(() => {
    if (task.status !== 'completed' || completionSent.current) return

    completionSent.current = true
    const completedTask = task
    const timeout = window.setTimeout(() => onComplete(completedTask, runtimePreset), 1_100)
    return () => window.clearTimeout(timeout)
  }, [onComplete, runtimePreset, task.status])

  const displayPreset = useMemo(() => task.status !== 'completed'
    ? {
      ...preset,
      dataMode: 'live' as const,
      durationMs: Math.max(task.elapsedMs + 30_000, 120_000),
      events: liveEvents,
      evidence: liveEvidence,
      sources: [...new Set(liveEvidence.map((item) => item.source))],
    }
    : runtimePreset, [liveEvents, liveEvidence, preset, runtimePreset, task.elapsedMs, task.status])
  const states = useMemo(
    () => deriveLiveAgentStates(displayPreset.events),
    [displayPreset.events],
  )
  const visibleEvents = useMemo(
    () => displayPreset.events,
    [displayPreset.events],
  )
  const visibleEvidenceIds = useMemo(
    () => [...new Set(visibleEvents.flatMap((event) => event.evidenceIds))],
    [visibleEvents],
  )
  const visibleEvidence = displayPreset.evidence.filter((item) => visibleEvidenceIds.includes(item.id))
  const overallProgress = Math.round(states.research.progress * 0.35 + states.sentiment.progress * 0.2 + states.regional.progress * 0.2 + states.strategy.progress * 0.25)
  const activeAgent = selectedAgent
    ? displayPreset.agents.find((agent) => agent.id === selectedAgent)
    : undefined
  const activeState = selectedAgent ? states[selectedAgent] : undefined

  return (
    <div className="workspace-page">
      <div className="workspace-grid-bg" aria-hidden="true" />
      <header className="workspace-header">
        <a href="#/" className="workspace-back" aria-label="返回任务中心"><ArrowLeft size={17} /></a>
        <BrandMark compact />
        <div className="workspace-breadcrumb">
          <span>ACTIVE MISSION</span>
          <strong>{displayPreset.game.name} <i>/</i> {displayPreset.version.label} · {displayPreset.version.title}</strong>
        </div>
        {displayPreset.isGeneric && <span className="generic-template-label">自定义研究目标</span>}
        <div className="workspace-clock">
          <span>ELAPSED</span>
          <strong>{formatElapsed(task.elapsedMs)}</strong>
        </div>
        <div className="workspace-overall-progress">
          <div><span>任务总进度</span><strong>{overallProgress}%</strong></div>
          <div className="progress-track"><i style={{ width: `${overallProgress}%` }} /></div>
        </div>
        <span className="workspace-live"><i /> LIVE ANALYSIS</span>
      </header>

      <main className="workspace-main">
        <section className="workspace-command">
          <div className="workspace-title-row">
            <div>
              <span className="workspace-section-code">ORCHESTRATION / 01</span>
              <h1>Agent 协作空间</h1>
            </div>
            <div className="workspace-coverage">
              <span><GlobeHemisphereWest size={14} /> CN · JP · WEST</span>
              <span><Database size={14} /> {visibleEvidenceIds.length} 条关键证据到达</span>
            </div>
          </div>

          <div className="agent-stage">
            <div className="agent-stage__toolbar">
              <span><Browser size={14} /> LIVE AGENT BROWSERS</span>
              <small>当前思路仅展示可审计工作摘要，不包含隐藏思维链</small>
              <strong>{visibleEvidenceIds.length.toString().padStart(2, '0')} SIGNALS</strong>
            </div>

            <div className="agent-browser-grid">
              {displayPreset.agents.map((agent, index) => {
                const Icon = agentIcons[agent.id]
                const state = states[agent.id]
                const preview = deriveAgentBrowserPreview(agent, visibleEvents, visibleEvidence)
                return (
                  <motion.button
                    type="button"
                    key={agent.id}
                    className={`agent-node agent-browser-card agent-node--${index + 1} status-${state.status}`}
                    onClick={() => setSelectedAgent(agent.id)}
                    aria-label={`${agent.name} 迷你浏览器，${statusLabels[state.status]}`}
                    aria-pressed={selectedAgent === agent.id}
                    whileHover={{ y: -2 }}
                  >
                    <span className="agent-browser-card__head">
                      <span className="agent-node__number">0{index + 1}</span>
                      <span className="agent-node__icon"><Icon size={18} weight="duotone" /></span>
                      <span className="agent-node__copy">
                        <small>{agentWorkspaceLabels[agent.id]}</small>
                        <strong>{agent.name}</strong>
                      </span>
                      <span className={`agent-browser-status status-${state.status}`}><i />{statusLabels[state.status]}</span>
                      <span className="agent-node__metric">{state.progress}%</span>
                    </span>

                    <span className="agent-browser-window">
                      <span className="agent-browser-chrome">
                        <span className="agent-browser-controls" aria-hidden="true"><i /><i /><i /></span>
                        <span className="agent-browser-address">
                          <LockSimple size={9} />
                          <span title={preview.address}>{preview.address}</span>
                        </span>
                        <DotsThree size={14} weight="bold" aria-hidden="true" />
                      </span>
                      <span className="agent-browser-document">
                        <span className="agent-browser-document__meta">
                          <i>{preview.badge}</i>
                          <em>{preview.evidence ? `${preview.source} · ${preview.evidence.region} · ${preview.evidence.language}` : preview.source}</em>
                        </span>
                        <strong>{preview.title}</strong>
                        <small>{preview.evidence?.excerptZh ?? preview.source}</small>
                      </span>
                    </span>

                    <span className="agent-browser-trace">
                      <span><i /> 当前思路（可审计摘要）</span>
                      <strong>{preview.summary}</strong>
                    </span>
                    <span className="agent-node__progress" aria-label={`进度 ${state.progress}%`}>
                      <i style={{ width: `${state.progress}%` }} />
                    </span>
                    {state.status === 'running' && <CircleNotch className="agent-spinner" size={13} />}
                    {state.status === 'completed' && <Check className="agent-check" size={13} weight="bold" />}
                  </motion.button>
                )
              })}
            </div>
          </div>

          <div className="stage-footer">
            <div><span>当前阶段</span><strong>{task.status === 'completed' ? 'REPORT COMPLETE' : visibleEvents.at(-1)?.phase.toUpperCase() ?? 'INITIALIZING'}</strong></div>
            <div><span>来源覆盖</span><strong>{displayPreset.sources.length} CHANNELS</strong></div>
            <div><span>真实证据</span><strong>{visibleEvidence.length} SIGNALS</strong></div>
            <div className="stage-footer__notice"><span>透明性声明</span><strong>REAL WEB DATA · NO SYNTHETIC FALLBACK</strong></div>
          </div>
        </section>

        <aside className="workspace-intelligence-rail">
          <AnimatePresence mode="wait">
            {activeAgent && activeState ? (
              <motion.div
                className="agent-inspector"
                key={activeAgent.id}
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 18 }}
              >
                <div className="rail-heading">
                  <div><span>AGENT INSPECTOR</span><h2>Agent 任务检查器</h2></div>
                  <button type="button" onClick={() => setSelectedAgent(null)} aria-label="关闭 Agent 检查器"><X size={17} /></button>
                </div>
                <div className="inspector-identity">
                  <span className={`inspector-icon status-${activeState.status}`}>
                    {(() => { const Icon = agentIcons[activeAgent.id]; return <Icon size={25} weight="duotone" /> })()}
                  </span>
                  <div><small>{activeAgent.englishName}</small><strong>{activeAgent.name}</strong></div>
                  <span className={`inspector-status status-${activeState.status}`}>{statusLabels[activeState.status]}</span>
                </div>
                <section className="inspector-section">
                  <span>任务目标</span>
                  <p>{activeAgent.objective}</p>
                </section>
                <section className="inspector-section">
                  <span>数据来源</span>
                  <div className="source-tags">{activeAgent.sources.map((source) => <i key={source}>{source}</i>)}</div>
                </section>
                <section className="inspector-metrics">
                  <div><span>进度</span><strong>{activeState.progress}%</strong></div>
                  <div><span>证据</span><strong>{activeState.evidenceIds.length}</strong></div>
                  <div><span>发现</span><strong>{activeState.findingIds.length}</strong></div>
                </section>
                <section className="inspector-section inspector-outputs">
                  <span>计划输出</span>
                  {activeAgent.outputs.map((output) => <p key={output}><Check size={12} /> {output}</p>)}
                </section>
                <section className="inspector-section inspector-findings">
                  <span>中间结论</span>
                  {visibleEvents.filter((event) => event.agentId === activeAgent.id && ['finding', 'risk', 'handoff'].includes(event.kind)).map((event) => (
                    <p key={event.id}><i /> {event.message}</p>
                  ))}
                  {!activeState.findingIds.length && <small>Agent 尚未产生可展示的中间结论。</small>}
                </section>
              </motion.div>
            ) : (
              <motion.div
                className="evidence-stream"
                key="stream"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="rail-heading">
                  <div><span>LIVE EVIDENCE</span><h2>实时证据流</h2></div>
                  <span className="rail-count">{visibleEvidence.length.toString().padStart(2, '0')}</span>
                </div>
                <div className="stream-summary">
                  <span><i /> 正在接收</span>
                  <small>点击任意 Agent 查看任务目标和中间结论</small>
                </div>
                <div className="evidence-list">
                  <AnimatePresence initial={false}>
                    {[...visibleEvidence].reverse().map((item) => (
                      <motion.article
                        key={item.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        layout
                      >
                        <header>
                          <span>{item.source}</span>
                          <i>{item.region} · {item.language}</i>
                          <small>{Math.round(item.confidence * 100)}% CONF.</small>
                        </header>
                        <p>{item.excerptZh}</p>
                        <footer>
                          <span className={`sentiment-${item.sentiment}`}>{item.sentiment.toUpperCase()}</span>
                          {item.topics.slice(0, 2).map((topic) => <i key={topic}>#{topic}</i>)}
                        </footer>
                      </motion.article>
                    ))}
                  </AnimatePresence>
                  {!visibleEvidence.length && (
                    <div className="stream-empty"><CircleNotch size={22} /> 等待第一批公开讨论样本…</div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </main>

      <section className="timeline-console">
        <div className="timeline-console__head">
          <div><Broadcast size={14} /><strong>AGENT TIMELINE</strong><span>实时执行日志</span></div>
          <div><i /> AUTO FOLLOW <span>{visibleEvents.length}/{displayPreset.events.length} EVENTS</span></div>
        </div>
        <div className="timeline-log" role="log" aria-live="polite">
          {visibleEvents.map((event, index) => {
            const Icon = eventIcon(event)
            const agent = displayPreset.agents.find((item) => item.id === event.agentId)!
            return (
              <div className={`timeline-entry timeline-entry--${event.kind}`} key={event.id}>
                <time>{formatEventTime(task.startedAt, event.offsetMs)}</time>
                <span className="timeline-entry__rail"><i />{index < visibleEvents.length - 1 && <em />}</span>
                <span className="timeline-entry__icon"><Icon size={13} /></span>
                <strong>{agent.name}</strong>
                <p>{event.message}</p>
                {event.region && <span className="timeline-tag">{event.region}</span>}
                {event.source && <span className="timeline-source">{event.source}</span>}
                {event.severity && <span className={`timeline-risk risk-${event.severity}`}>风险 {severityLabels[event.severity]}</span>}
              </div>
            )
          })}
        </div>
      </section>

      <AnimatePresence>
        {task.status === 'failed' && (
          <motion.div className="report-ready-overlay research-failed-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <motion.div initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <Warning size={30} weight="fill" />
              <span>LIVE RESEARCH STOPPED</span>
              <strong>真实研究任务未完成</strong>
              <small>{liveError || '公开来源或模型服务返回错误；系统没有生成替代评论或推测数据。'}</small>
              <a href="#/">返回任务中心</a>
            </motion.div>
          </motion.div>
        )}
        {task.status === 'completed' && (
          <motion.div className="report-ready-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <motion.div initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <Check size={30} weight="bold" />
              <span>MISSION COMPLETE</span>
              <strong>全球玩家洞察报告已生成</strong>
              <small>正在进入决策报告…</small>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
