import {
  ArrowRight,
  Broadcast,
  ClockCounterClockwise,
  Database,
  GlobeHemisphereWest,
  MagnifyingGlass,
  Sparkle,
  Strategy,
  Translate,
  TrendUp,
} from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { BrandMark } from '../../components/BrandMark'
import { analysisPresets, createCustomPreset } from '../../data/presets'
import { getLiveResearchClient, type LiveResearchStatus } from '../../desktop/bridge'
import type { AgentId, AnalysisPreset, RuntimeTask } from '../../domain/types'

interface TaskLobbyProps {
  recentTasks: RuntimeTask[]
  onStart: (preset: AnalysisPreset) => void
  onOpenReport: (task: RuntimeTask) => void
}

const agentIcons = {
  research: MagnifyingGlass,
  sentiment: TrendUp,
  regional: Translate,
  strategy: Strategy,
}

const agentPositions: AgentId[] = ['research', 'sentiment', 'regional', 'strategy']

export function TaskLobby({ recentTasks, onStart, onOpenReport }: TaskLobbyProps) {
  const [selection, setSelection] = useState(analysisPresets[0].id)
  const [customGame, setCustomGame] = useState('')
  const [customUpdate, setCustomUpdate] = useState('')
  const [researchStatus, setResearchStatus] = useState<LiveResearchStatus | null>(null)
  const isCustom = selection === 'custom'
  const selectedPreset = useMemo(
    () => analysisPresets.find((preset) => preset.id === selection) ?? analysisPresets[0],
    [selection],
  )
  const displayedPreset = isCustom
    ? createCustomPreset(customGame || '自定义游戏', customUpdate || '自定义版本更新')
    : selectedPreset

  useEffect(() => {
    const client = getLiveResearchClient()
    if (!client) return
    let cancelled = false
    client.getStatus().then((status) => {
      if (cancelled) return
      setResearchStatus(status)
    }).catch(() => {
      if (!cancelled) setResearchStatus({ configured: false, model: '', retrieval: '', searchEndpoint: '' })
    })
    return () => { cancelled = true }
  }, [])

  const handleStart = () => {
    if (!researchStatus?.configured) return
    if (isCustom) {
      if (!customGame.trim() || !customUpdate.trim()) return
      onStart(createCustomPreset(customGame, customUpdate))
      return
    }
    onStart(selectedPreset)
  }

  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView?.({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  return (
    <div className="lobby-page">
      <div className="cosmic-grid" aria-hidden="true" />
      <header className="global-header">
        <BrandMark />
        <nav className="global-nav" aria-label="全局导航">
          <button className="is-active" type="button" onClick={() => scrollToSection('task-launcher')}>任务中心</button>
          <button type="button" onClick={() => scrollToSection('agent-team')}>Agent 团队</button>
          <button type="button" onClick={() => scrollToSection('recent-tasks')}>分析档案</button>
        </nav>
        <div className="header-status">
          <span className="live-indicator"><i /> {researchStatus?.configured ? 'LIVE READY' : 'CONFIG REQUIRED'}</span>
          <span className="product-label">公开网络研究工具 · 非官方产品</span>
        </div>
      </header>

      <main className="lobby-main" id="task-launcher">
        <motion.section
          className="lobby-intro"
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="section-kicker">
            <span>01</span>
            <span>PLAYER SIGNAL COMMAND</span>
          </div>
          <h1>
            在下一次更新前，
            <em>听见全球玩家。</em>
          </h1>
          <p className="lobby-lede">
            组建由四名专业 AI Agent 构成的全球研究团队，让公开讨论、文化差异与版本风险沿同一条证据链汇合。
          </p>

          <div className="mission-meta">
            <div><GlobeHemisphereWest size={19} /><span>3 个核心市场</span></div>
            <div><Database size={19} /><span>3 个真实检索通道</span></div>
            <div><Broadcast size={19} /><span>实时协作过程</span></div>
          </div>

          <section className="task-config-panel" aria-labelledby="task-config-title">
            <div className="panel-heading">
              <div>
                <span className="panel-index">MISSION CONFIGURATION</span>
                <h2 id="task-config-title">配置全球分析任务</h2>
              </div>
              <span className="snapshot-badge is-live">REAL SOURCES ONLY</span>
            </div>

            <div className="research-mode-selector real-only-selector" aria-label="真实研究连接状态">
              <div className={`research-mode-card ${researchStatus?.configured ? 'is-active' : 'is-unavailable'}`}>
                <Broadcast size={17} />
                <span><strong>真实公开网络研究</strong><small>{researchStatus?.configured ? `${researchStatus.model.toUpperCase()} · ${researchStatus.retrieval}` : '未检测到桌面端 GLM 配置，任务已锁定'}</small></span>
              </div>
              <div className="research-mode-card evidence-only-policy">
                <Database size={17} />
                <span><strong>无模拟数据回退</strong><small>没有 HTTPS 来源与原始摘录时，任务直接停止</small></span>
              </div>
            </div>

            <fieldset className="game-selector">
              <legend>选择研究对象</legend>
              <div className="game-selector__grid">
                {analysisPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={selection === preset.id ? 'is-selected' : ''}
                    onClick={() => setSelection(preset.id)}
                    aria-pressed={selection === preset.id}
                  >
                    <span className="game-code" style={{ color: preset.game.accent }}>{preset.game.shortName}</span>
                    <span>{preset.game.name}</span>
                    <small>{preset.version.label}</small>
                  </button>
                ))}
                <button
                  type="button"
                  className={`custom-game-option ${isCustom ? 'is-selected' : ''}`}
                  onClick={() => setSelection('custom')}
                  aria-pressed={isCustom}
                >
                  <span className="game-code">+</span>
                  <span>自定义游戏</span>
                  <small>INPUT</small>
                </button>
              </div>
            </fieldset>

            {isCustom ? (
              <div className="custom-fields">
                <label>
                  <span>游戏名称</span>
                  <input value={customGame} onChange={(event) => setCustomGame(event.target.value)} placeholder="输入游戏名称" />
                </label>
                <label>
                  <span>版本或更新内容</span>
                  <input value={customUpdate} onChange={(event) => setCustomUpdate(event.target.value)} placeholder="例如：2.4 夏季活动" />
                </label>
                <p><Sparkle size={14} /> 将按你输入的游戏与更新实时检索公开网页；不会生成通用评论或填充缺失数据。</p>
              </div>
            ) : (
              <div className="version-readout">
                <span>历史版本 / 更新内容</span>
                <strong>{selectedPreset.version.label} · {selectedPreset.version.title}</strong>
                <small>启动后实时检索 · 结果数量只取决于本次可访问的公开来源</small>
              </div>
            )}

            <div className="launch-row">
              <div className="coverage-strip" aria-label="分析范围">
                <span>CN 中国</span><span>JP 日本</span><span>WEST 欧美</span>
              </div>
              <button
                className="primary-launch"
                type="button"
                onClick={handleStart}
                disabled={!researchStatus?.configured || (isCustom && (!customGame.trim() || !customUpdate.trim()))}
              >
                <span>{researchStatus?.configured ? '启动真实研究' : '真实研究未配置'}</span>
                <ArrowRight size={20} weight="bold" />
              </button>
            </div>
          </section>
        </motion.section>

        <motion.aside
          className="agent-orbit-panel"
          id="agent-team"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.12 }}
        >
          <div className="orbit-panel__header">
            <div>
              <span>AGENT ORCHESTRATION</span>
              <strong>全球研究团队</strong>
            </div>
            <span className="team-status"><i /> 4 AGENTS STANDBY</span>
          </div>

          <div className="agent-orbit" aria-label="四个 Agent 的协作关系">
            <div className="orbit-ring orbit-ring--outer" aria-hidden="true" />
            <div className="orbit-ring orbit-ring--inner" aria-hidden="true" />
            <div className="orbit-route" aria-hidden="true" />
            <div className="orbit-core">
              <span>{displayedPreset.game.shortName}</span>
              <strong>GLOBAL<br />SIGNAL</strong>
              <small>{displayedPreset.version.label}</small>
            </div>
            {agentPositions.map((id, index) => {
              const agent = displayedPreset.agents.find((item) => item.id === id)!
              const Icon = agentIcons[id]
              return (
                <div className={`orbit-agent orbit-agent--${index + 1}`} key={id}>
                  <div className="orbit-agent__icon"><Icon size={22} weight="duotone" /></div>
                  <div>
                    <span>{agent.englishName}</span>
                    <strong>{agent.name.replace(' Agent', '')}</strong>
                  </div>
                  <i>{String(index + 1).padStart(2, '0')}</i>
                </div>
              )
            })}
          </div>

          <div className="orbit-panel__footer">
            <div><span>预计运行</span><strong>NETWORK DEPENDENT</strong></div>
            <div><span>协作模式</span><strong>SEQUENTIAL + OVERLAP</strong></div>
            <div><span>输出</span><strong>DECISION REPORT</strong></div>
          </div>
        </motion.aside>
      </main>

      <section className="recent-section" id="recent-tasks">
        <div className="recent-title">
          <ClockCounterClockwise size={18} />
          <span>RECENT INTELLIGENCE</span>
        </div>
        {recentTasks.length ? (
          <div className="recent-list">
            {recentTasks.slice(0, 3).map((task) => (
              <button type="button" key={task.id} onClick={() => onOpenReport(task)}>
                <span>{task.gameName}</span>
                <strong>{task.versionTitle}</strong>
                <small>报告已完成 <ArrowRight size={14} /></small>
              </button>
            ))}
          </div>
        ) : (
          <p>尚无已完成任务。启动第一次全球玩家分析，报告将保存在此浏览器中。</p>
        )}
      </section>
    </div>
  )
}
