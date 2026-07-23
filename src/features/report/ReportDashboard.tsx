import {
  ArrowLeft,
  ArrowRight,
  Broadcast,
  CaretDown,
  ChartLineUp,
  ChatCircleText,
  CheckCircle,
  ClockCounterClockwise,
  Database,
  GlobeHemisphereWest,
  Quotes,
  ShieldWarning,
  Sparkle,
  Strategy,
  TrendDown,
  TrendUp,
  X,
} from '@phosphor-icons/react'
import * as Tabs from '@radix-ui/react-tabs'
import { BarChart, LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import ReactEChartsCore from 'echarts-for-react/esm/core'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { BrandMark } from '../../components/BrandMark'
import type { AnalysisPreset, RegionCode, RuntimeTask } from '../../domain/types'

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, CanvasRenderer])

export type ReportTab = 'overview' | 'regions' | 'controversies' | 'strategy'

interface ReportDashboardProps {
  preset: AnalysisPreset
  task: RuntimeTask
  initialTab?: ReportTab
  highlightEvidenceId?: string
  onOpenAdvisor: () => void
  onTabChange?: (tab: ReportTab) => void
}

const riskLabels = { low: '低风险', medium: '中风险', high: '高风险', critical: '严重风险' }
const regionMap: Record<Exclude<RegionCode, 'GLOBAL'>, string> = { CN: '中国', JP: '日本', WEST: '欧美' }

function sentimentLabel(sentiment: 'positive' | 'neutral' | 'negative') {
  return sentiment === 'positive' ? '正面' : sentiment === 'negative' ? '负面' : '中性'
}

export function ReportDashboard({
  preset,
  task,
  initialTab = 'overview',
  highlightEvidenceId,
  onOpenAdvisor,
  onTabChange,
}: ReportDashboardProps) {
  const [tab, setTab] = useState<ReportTab>(initialTab)
  const [regionFilter, setRegionFilter] = useState<'ALL' | Exclude<RegionCode, 'GLOBAL'>>('ALL')
  const [sourceFilter, setSourceFilter] = useState('ALL')
  const [timelineOpen, setTimelineOpen] = useState(false)
  const report = preset.report
  const representativeEvidence = preset.evidence.at(-1) ?? preset.evidence[0]
  const primaryControversy = report.controversies[0]
  const primaryRecommendation = report.recommendations[0]
  const filteredEvidence = preset.evidence.filter(
    (item) =>
      (regionFilter === 'ALL' || item.region === regionFilter) &&
      (sourceFilter === 'ALL' || item.source === sourceFilter),
  )

  useEffect(() => {
    if (!highlightEvidenceId || tab !== 'controversies') return
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`evidence-${highlightEvidenceId}`)?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'center',
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [highlightEvidenceId, tab])

  const trendOption = useMemo(() => ({
    animationDuration: 700,
    color: ['#3ca887', '#a49673', '#d55d72'],
    tooltip: { trigger: 'axis' },
    grid: { top: 28, right: 22, bottom: 26, left: 38 },
    xAxis: { type: 'category', data: report.trend.map((point) => point.label), axisLine: { lineStyle: { color: '#d9dde7' } }, axisLabel: { color: '#798196', fontSize: 10 } },
    yAxis: { type: 'value', min: 0, max: 100, splitLine: { lineStyle: { color: '#e9ebf1' } }, axisLabel: { color: '#8c93a4', fontSize: 9, formatter: '{value}%' } },
    series: [
      { name: '正面', type: 'line', smooth: true, symbolSize: 6, data: report.trend.map((point) => point.positive), areaStyle: { opacity: 0.08 } },
      { name: '中性', type: 'line', smooth: true, symbolSize: 5, data: report.trend.map((point) => point.neutral) },
      { name: '负面', type: 'line', smooth: true, symbolSize: 5, data: report.trend.map((point) => point.negative) },
    ],
  }), [report.trend])

  const regionOption = useMemo(() => ({
    animationDuration: 700,
    color: ['#3d91c9'],
    grid: { top: 18, right: 28, bottom: 28, left: 36 },
    xAxis: { type: 'category', data: report.regions.map((region) => region.label), axisLine: { lineStyle: { color: '#d9dde7' } }, axisLabel: { color: '#626b80' } },
    yAxis: { type: 'value', min: 0, max: 100, splitLine: { lineStyle: { color: '#e9ebf1' } }, axisLabel: { color: '#8c93a4', fontSize: 9 } },
    series: [{ type: 'bar', barWidth: 24, data: report.regions.map((region) => region.sentimentScore), itemStyle: { borderRadius: [3, 3, 0, 0] } }],
  }), [report.regions])

  const setActiveTab = (value: string) => {
    const next = value as ReportTab
    setTab(next)
    onTabChange?.(next)
  }

  return (
    <div className="report-page">
      <header className="report-header">
        <a href="#/" className="report-back" aria-label="返回任务中心"><ArrowLeft size={16} /></a>
        <BrandMark compact />
        <div className="report-mission">
          <span>INTELLIGENCE REPORT</span>
          <strong>{preset.game.name} · {preset.version.label} {preset.version.title}</strong>
        </div>
        <div className="report-header__spacer" />
        <button className="timeline-review-button" type="button" onClick={() => setTimelineOpen(true)}>
          <ClockCounterClockwise size={15} /> 查看 Agent Timeline
        </button>
        <span className="report-complete"><CheckCircle size={15} weight="fill" /> REPORT COMPLETE</span>
      </header>

      <Tabs.Root className="report-root" value={tab} onValueChange={setActiveTab}>
        <aside className="report-sidebar">
          <div className="report-sidebar__intro">
            <span>REPORT INDEX</span>
            <strong>全球玩家洞察</strong>
            <small>实时公开网页研究</small>
          </div>
          <Tabs.List aria-label="报告章节">
            <Tabs.Trigger value="overview" aria-label="全球概览"><span>01</span>全球概览</Tabs.Trigger>
            <Tabs.Trigger value="regions" aria-label="地区差异"><span>02</span>地区差异</Tabs.Trigger>
            <Tabs.Trigger value="controversies" aria-label="争议与证据"><span>03</span>争议与证据</Tabs.Trigger>
            <Tabs.Trigger value="strategy" aria-label="策略建议"><span>04</span>策略建议</Tabs.Trigger>
          </Tabs.List>
          <div className="report-sidebar__meta">
            <div><span>真实证据</span><strong>{report.sampleCount.toLocaleString('zh-CN')}</strong></div>
            <div><span>来源类型</span><strong>{preset.sources.length}</strong></div>
            <div><span>核心市场</span><strong>{preset.regions.length}</strong></div>
          </div>
          <button className="advisor-entry" type="button" onClick={onOpenAdvisor}>
            <ChatCircleText size={19} />
            <span><small>ASK THE ADVISOR</small><strong>打开 AI 游戏顾问</strong></span>
            <ArrowRight size={16} />
          </button>
          <p className="report-disclaimer">真实研究：来源为本次任务检索到的公开网页/RSS；数字仅统计当前可核验证据，不代表全部玩家。</p>
        </aside>

        <main className="report-canvas">
          <section className="report-hero">
            <div className="report-hero__copy">
              <span className="report-overline">GLOBAL PLAYER INTELLIGENCE / FINAL</span>
              <h1>全球玩家洞察报告</h1>
              <p>{report.summary}</p>
              <div className="report-context-tags">
                <span><GlobeHemisphereWest size={14} /> CN · JP · WEST</span>
                <span><Database size={14} /> {preset.sources.join(' · ')}</span>
              </div>
            </div>
            <div className="global-score">
              <span>GLOBAL SENTIMENT</span>
              <strong>{report.sentimentScore}</strong>
              <small>/ 100</small>
              <i style={{ '--score': `${report.sentimentScore * 3.6}deg` } as React.CSSProperties} />
            </div>
            <div className={`risk-signal risk-${report.riskLevel}`}>
              <ShieldWarning size={19} />
              <span>最高风险</span>
              <strong>{riskLabels[report.riskLevel]}</strong>
              <small>{primaryControversy?.title ?? '本次证据未支持明确争议'}</small>
            </div>
          </section>

          <section className="report-kpis">
            <div><span>公开证据</span><strong>{report.sampleCount.toLocaleString('zh-CN')}</strong><small>跨 {preset.sources.length} 类公开来源</small></div>
            <div className="kpi-positive"><span>正面情绪</span><strong>{report.positivePercent}%</strong><small><TrendUp size={12} /> 全球主导情绪</small></div>
            <div className="kpi-negative"><span>负面情绪</span><strong>{report.negativePercent}%</strong><small><TrendDown size={12} /> 需跟进的问题簇</small></div>
            <div><span>关键建议</span><strong>{report.recommendations.length}</strong><small>P0 / P1 / P2 优先级</small></div>
          </section>

          <Tabs.Content value="overview" className="report-tab-content">
            <div className="report-section-heading">
              <div><span>OVERVIEW</span><h2>全球情绪与信号概览</h2></div>
              <small>本次实时检索结果 · 不外推总体玩家</small>
            </div>
            <div className="overview-grid">
              <article className="report-card report-card--wide">
                <header><span><ChartLineUp size={16} /> 全球情绪趋势</span><small>POSITIVE / NEUTRAL / NEGATIVE</small></header>
                <ReactEChartsCore echarts={echarts} option={trendOption} style={{ height: 245 }} />
              </article>
              <article className="report-card">
                <header><span><GlobeHemisphereWest size={16} /> 地区情绪指数</span><small>0–100</small></header>
                <ReactEChartsCore echarts={echarts} option={regionOption} style={{ height: 245 }} />
              </article>
              <article className="report-card report-card--keywords">
                <header><span><Sparkle size={16} /> 热门讨论关键词</span><small>WEIGHTED TOPICS</small></header>
                <div className="keyword-field">
                  {report.keywords.map((keyword) => (
                    <span key={keyword.label} className={`keyword-${keyword.sentiment}`} style={{ fontSize: `${9 + keyword.weight / 9}px` }}>{keyword.label}</span>
                  ))}
                </div>
              </article>
              <article className="report-card report-card--controversy">
                <header><span><ShieldWarning size={16} /> 最大争议问题</span><small>{primaryControversy?.severity.toUpperCase() ?? 'NO CLAIM'}</small></header>
                <strong>{primaryControversy?.title ?? '当前证据不足以确认争议'}</strong>
                <p>{primaryControversy?.description ?? 'Agent 没有为了填满报告而生成争议结论。'}</p>
                <div><span>传播路径</span><em>{primaryControversy?.propagation ?? '未验证'}</em></div>
              </article>
              <article className="report-card report-card--quote">
                <Quotes size={23} />
                <blockquote>{representativeEvidence?.excerptZh ?? '当前任务没有可展示的代表证据。'}</blockquote>
                {representativeEvidence && <footer><span>{representativeEvidence.source} · {representativeEvidence.region}</span><small>代表性观点 · 实时公开网页</small></footer>}
              </article>
            </div>
          </Tabs.Content>

          <Tabs.Content value="regions" className="report-tab-content">
            <div className="report-section-heading">
              <div><span>REGIONAL LENS</span><h2>不同市场为何产生不同反应</h2></div>
              <small>文化关注点 · 情绪指数 · 代表证据</small>
            </div>
            <div className="region-cards">
              {report.regions.map((region) => {
                const evidence = preset.evidence.find((item) => item.region === region.region)
                return (
                  <article key={region.region}>
                    <header><span>{region.region}</span><h3>{region.label}玩家</h3><strong>{region.sentimentScore}</strong></header>
                    <div className="region-concerns"><span>首要关注 <b>{region.topConcern}</b></span><span>次要关注 <b>{region.secondaryConcern}</b></span></div>
                    <p>{region.insight}</p>
                    {evidence ? <blockquote>{evidence.excerptZh}</blockquote> : <blockquote>当前地区没有检索到可核验公开证据。</blockquote>}
                    <footer>{evidence ? `${evidence.source} · ${evidence.language} · 真实公开网页` : 'EVIDENCE GAP'}</footer>
                  </article>
                )
              })}
            </div>
            <article className="regional-matrix">
              <header><span>地区证据覆盖与情绪构成</span><small>全部数值直接由本次真实证据条目计算</small></header>
              <div className="matrix-row matrix-head"><span>市场</span><span>证据覆盖</span><span>正面</span><span>中性</span><span>负面</span></div>
              {report.regions.map((region) => {
                const items = preset.evidence.filter((item) => item.region === region.region)
                const count = Math.max(items.length, 1)
                const coverage = report.sampleCount ? Math.round((items.length / report.sampleCount) * 100) : 0
                const positive = Math.round((items.filter((item) => item.sentiment === 'positive').length / count) * 100)
                const negative = Math.round((items.filter((item) => item.sentiment === 'negative').length / count) * 100)
                const neutral = items.length ? 100 - positive - negative : 0
                return <div className="matrix-row" key={region.region}><strong>{region.label}</strong><i title={`${coverage}%`} style={{ width: `${coverage}%` }} /><i title={`${positive}%`} style={{ width: `${positive}%` }} /><i title={`${neutral}%`} style={{ width: `${neutral}%` }} /><i title={`${negative}%`} style={{ width: `${negative}%` }} /></div>
              })}
            </article>
          </Tabs.Content>

          <Tabs.Content value="controversies" className="report-tab-content">
            <div className="report-section-heading evidence-heading">
              <div><span>EVIDENCE TRACE</span><h2>争议问题与公开证据</h2></div>
              <div className="evidence-filters">
                <label>地区筛选<select aria-label="地区筛选" value={regionFilter} onChange={(event) => setRegionFilter(event.target.value as typeof regionFilter)}><option value="ALL">全部地区</option><option value="CN">中国</option><option value="JP">日本</option><option value="WEST">欧美</option></select><CaretDown size={10} /></label>
                <label>来源筛选<select aria-label="来源筛选" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="ALL">全部来源</option>{preset.sources.map((source) => <option key={source} value={source}>{source}</option>)}</select><CaretDown size={10} /></label>
              </div>
            </div>
            <div className="controversy-list">
              {report.controversies.filter((item) => regionFilter === 'ALL' || item.region === 'GLOBAL' || item.region === regionFilter).map((item, index) => (
                <article key={item.id}>
                  <span className={`controversy-severity risk-${item.severity}`}>{item.severity.toUpperCase()}</span>
                  <div><small>ISSUE {String(index + 1).padStart(2, '0')}</small><h3>{item.title}</h3><p>{item.description}</p></div>
                  <div className="propagation-route"><span>传播路径</span><strong>{item.propagation}</strong><small>{item.evidenceIds.length} 条核心证据</small></div>
                </article>
              ))}
              {!report.controversies.length && <p className="evidence-gap-message">本次真实证据不足以确认争议，Agent 未生成替代结论。</p>}
            </div>
            <div className="evidence-explorer">
              <header><span><Database size={15} /> 证据浏览器</span><small>{filteredEvidence.length} 条代表性观点 · 实时公开网页证据</small></header>
              <div className="evidence-grid">
                {filteredEvidence.map((item) => (
                  <article key={item.id} className={highlightEvidenceId === item.id ? 'is-highlighted' : ''} id={`evidence-${item.id}`}>
                    <header><span>{item.source}</span><i>{regionMap[item.region]} · {item.language}</i><small>实时公开网页</small></header>
                    {item.title && <strong className="evidence-source-title">{item.title}</strong>}
                    <blockquote lang={item.language}>{item.excerptOriginal}</blockquote>
                    {item.language !== 'zh-CN' && <p>{item.excerptZh}</p>}
                    <code className="evidence-source-url">{item.url}</code>
                    <footer><span className={`sentiment-${item.sentiment}`}>{sentimentLabel(item.sentiment)}</span>{item.topics.map((topic) => <i key={topic}>#{topic}</i>)}<small>{item.id}</small></footer>
                  </article>
                ))}
              </div>
            </div>
          </Tabs.Content>

          <Tabs.Content value="strategy" className="report-tab-content">
            <div className="report-section-heading">
              <div><span>DECISION SUPPORT</span><h2>未来版本策略建议</h2></div>
              <small>按风险、影响范围与可执行性排序</small>
            </div>
            <div className="strategy-layout">
              <div className="strategy-list">
                {report.recommendations.map((item, index) => (
                  <article key={item.id}>
                    <span className={`priority priority-${item.priority.toLowerCase()}`}>{item.priority}</span>
                    <div><small>RECOMMENDATION {String(index + 1).padStart(2, '0')} · {item.region}</small><h3>{item.title}</h3><p>{item.action}</p><blockquote>{item.rationale}</blockquote></div>
                    <span className="strategy-evidence">{item.evidenceIds.length} EVIDENCE</span>
                  </article>
                ))}
                {!report.recommendations.length && <p className="evidence-gap-message">当前证据不足以支持具体策略建议。请扩大真实来源覆盖后重新研究。</p>}
              </div>
              <aside className="decision-brief">
                <Strategy size={23} weight="duotone" />
                <span>NEXT VERSION BRIEF</span>
                <h3>{primaryRecommendation?.title ?? '当前不生成无证据决策简报'}</h3>
                <p>{primaryRecommendation?.action ?? '没有足够证据时，ReHoYo 会保留空白，而不是补造下一版本建议。'}</p>
                {primaryRecommendation && <div><span>依据</span><strong>{primaryRecommendation.evidenceIds.length} 条真实证据</strong></div>}
                {primaryRecommendation && <div><span>地区</span><strong>{primaryRecommendation.region}</strong></div>}
                {primaryRecommendation && <div><span>优先级</span><strong>{primaryRecommendation.priority}</strong></div>}
                <button type="button" onClick={onOpenAdvisor}>继续询问 AI 顾问 <ArrowRight size={15} /></button>
              </aside>
            </div>
          </Tabs.Content>
        </main>
      </Tabs.Root>

      {timelineOpen && (
        <div className="report-timeline-overlay" role="dialog" aria-modal="true" aria-label="Agent Timeline 回顾">
          <button className="timeline-backdrop" type="button" aria-label="关闭 Timeline" onClick={() => setTimelineOpen(false)} />
          <motion.aside initial={{ x: 460 }} animate={{ x: 0 }}>
            <header><div><span>MISSION REPLAY</span><h2>Agent Timeline 回顾</h2></div><button type="button" onClick={() => setTimelineOpen(false)} aria-label="关闭 Timeline"><X size={18} /></button></header>
            <p>任务过程只读回顾 · 事件来自真实检索与模型请求</p>
            <div>{preset.events.map((event) => <article key={event.id}><time>+{String(Math.floor(event.offsetMs / 1000)).padStart(2, '0')}s</time><i /><div><span>{preset.agents.find((agent) => agent.id === event.agentId)?.name}</span><strong>{event.message}</strong></div></article>)}</div>
          </motion.aside>
        </div>
      )}
    </div>
  )
}
