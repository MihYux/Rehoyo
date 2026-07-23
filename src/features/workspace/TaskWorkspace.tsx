import {
  ArrowLeft,
  Broadcast,
  Check,
  CircleNotch,
  Clock,
  Database,
  GlobeHemisphereWest,
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
import { advanceToElapsedTime, deriveAgentStates } from '../../domain/engine'
import type {
  AgentId,
  AgentRuntimeState,
  AnalysisEvent,
  AnalysisPreset,
  RuntimeTask,
} from '../../domain/types'

interface TaskWorkspaceProps {
  preset: AnalysisPreset
  initialTask: RuntimeTask
  onComplete: (task: RuntimeTask) => void
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

export function TaskWorkspace({
  preset,
  initialTask,
  onComplete,
  clock = Date.now,
}: TaskWorkspaceProps) {
  const [task, setTask] = useState(initialTask)
  const [selectedAgent, setSelectedAgent] = useState<AgentId | null>(null)
  const completionSent = useRef(false)
  const clockScale = Number(import.meta.env.VITE_REHOYO_CLOCK_SCALE ?? '1') || 1

  useEffect(() => {
    const update = () => {
      setTask((current) =>
        advanceToElapsedTime(preset, current, (clock() - current.startedAt) * clockScale),
      )
    }
    update()
    const interval = window.setInterval(update, 120)
    return () => window.clearInterval(interval)
  }, [clock, clockScale, preset])

  useEffect(() => {
    if (task.status !== 'completed' || completionSent.current) return

    completionSent.current = true
    const completedTask = task
    const timeout = window.setTimeout(() => onComplete(completedTask), 1_100)
    return () => window.clearTimeout(timeout)
  }, [onComplete, task.status])

  const states = useMemo(() => deriveAgentStates(preset, task), [preset, task])
  const visibleEvents = useMemo(
    () => preset.events.filter((event) => task.visibleEventIds.includes(event.id)),
    [preset.events, task.visibleEventIds],
  )
  const visibleEvidenceIds = useMemo(
    () => [...new Set(visibleEvents.flatMap((event) => event.evidenceIds))],
    [visibleEvents],
  )
  const visibleEvidence = preset.evidence.filter((item) => visibleEvidenceIds.includes(item.id))
  const overallProgress = Math.min(100, Math.round((task.elapsedMs / preset.durationMs) * 100))
  const activeAgent = selectedAgent
    ? preset.agents.find((agent) => agent.id === selectedAgent)
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
          <strong>{preset.game.name} <i>/</i> {preset.version.label} · {preset.version.title}</strong>
        </div>
        {preset.isGeneric && <span className="generic-template-label">通用演示模板</span>}
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
            <div className="agent-stage__axis agent-stage__axis--h" aria-hidden="true" />
            <div className="agent-stage__axis agent-stage__axis--v" aria-hidden="true" />
            <div className="agent-stage__core">
              <div className="core-radar" aria-hidden="true"><i /><i /><i /></div>
              <span>GLOBAL SIGNAL</span>
              <strong>{visibleEvidenceIds.length}</strong>
              <small>EVIDENCE LOCKED</small>
            </div>

            {preset.agents.map((agent, index) => {
              const Icon = agentIcons[agent.id]
              const state = states[agent.id]
              return (
                <motion.button
                  type="button"
                  key={agent.id}
                  className={`agent-node agent-node--${index + 1} status-${state.status}`}
                  onClick={() => setSelectedAgent(agent.id)}
                  aria-label={`${agent.name} ${statusLabels[state.status]}`}
                  whileHover={{ y: -2 }}
                >
                  <span className="agent-node__number">0{index + 1}</span>
                  <span className="agent-node__icon"><Icon size={24} weight="duotone" /></span>
                  <span className="agent-node__copy">
                    <small>{agent.englishName}</small>
                    <strong>{agent.name}</strong>
                    <em>{statusLabels[state.status]}</em>
                  </span>
                  <span className="agent-node__progress">
                    <i style={{ width: `${state.progress}%` }} />
                  </span>
                  <span className="agent-node__metric">{state.progress}%</span>
                  {state.status === 'running' && <CircleNotch className="agent-spinner" size={15} />}
                  {state.status === 'completed' && <Check className="agent-check" size={15} weight="bold" />}
                </motion.button>
              )
            })}
          </div>

          <div className="stage-footer">
            <div><span>当前阶段</span><strong>{task.status === 'completed' ? 'REPORT COMPLETE' : visibleEvents.at(-1)?.phase.toUpperCase() ?? 'INITIALIZING'}</strong></div>
            <div><span>来源覆盖</span><strong>{preset.sources.length} CHANNELS</strong></div>
            <div><span>模拟样本</span><strong>{preset.report.sampleCount.toLocaleString('zh-CN')} SIGNALS</strong></div>
            <div className="stage-footer__notice"><span>透明性声明</span><strong>DEMO SNAPSHOT · NOT LIVE DATA</strong></div>
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
          <div><i /> AUTO FOLLOW <span>{visibleEvents.length}/{preset.events.length} EVENTS</span></div>
        </div>
        <div className="timeline-log" role="log" aria-live="polite">
          {visibleEvents.map((event, index) => {
            const Icon = eventIcon(event)
            const agent = preset.agents.find((item) => item.id === event.agentId)!
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
