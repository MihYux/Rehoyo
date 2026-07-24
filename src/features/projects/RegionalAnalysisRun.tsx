import { ArrowLeft, Browser, CircleNotch, Database, GlobeHemisphereWest, WarningCircle } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BrandMark } from '../../components/BrandMark'
import { getLiveResearchClient } from '../../desktop/bridge'
import type { AnalysisEvent, AnalysisPreset, EvidenceRecord } from '../../domain/types'
import type { ReleaseProject, ReleaseRegion } from '../../domain/release-project'

interface Props {
  project: ReleaseProject
  onComplete: (preset: AnalysisPreset) => void
}

const labels: Record<ReleaseRegion, string> = { CN: '中国', JP: '日本', WEST: '北美及英语市场' }
const flags: Record<ReleaseRegion, string> = { CN: 'cn', JP: 'jp', WEST: 'us' }

export function RegionalAnalysisRun({ project, onComplete }: Props) {
  const [events, setEvents] = useState<AnalysisEvent[]>([])
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([])
  const [error, setError] = useState('')
  const [running, setRunning] = useState(true)
  const started = useRef(false)
  const runId = useMemo(() => `${project.id}-${Date.now()}`, [project.id])

  useEffect(() => {
    if (started.current) return
    started.current = true
    const client = getLiveResearchClient()
    if (!client) {
      setError('真实研究只可在ReHoYo Electron桌面应用中运行。')
      setRunning(false)
      return
    }
    const unsubscribe = client.onEvent((payload) => {
      if (payload.runId !== runId) return
      setEvents((current) => [...current, payload.event])
      if (payload.event.evidenceRecords?.length) {
        setEvidence((current) => {
          const byId = new Map(current.map((item) => [item.id, item]))
          payload.event.evidenceRecords?.forEach((item) => byId.set(item.id, item))
          return [...byId.values()]
        })
      }
    })
    client.run({ runId, gameName: project.game, versionLabel: project.version, versionTitle: project.updateName, regions: project.regions })
      .then((result) => {
        if (!result.ok) throw new Error(result.error)
        setEvidence(result.preset.evidence)
        setRunning(false)
        onComplete(result.preset)
      })
      .catch((runError) => {
        setError(runError instanceof Error ? runError.message : '区域研究失败。')
        setRunning(false)
      })
      .finally(unsubscribe)
    return unsubscribe
  }, [onComplete, project.game, project.regions, project.updateName, project.version, runId])

  const latest = events.at(-1)
  const latestCoverage = [...events].reverse().find((event) => event.sitesAttempted !== undefined || event.evidenceCount !== undefined)
  const providers = [...new Set(events.map((event) => event.searchProvider).filter(Boolean))]
  const browserEvents = events.filter((event) => event.kind === 'browser')
  const browserCompleted = browserEvents.filter((event) => event.browserStatus === 'completed')
  const latestBrowserEvents = [...browserEvents].reverse().filter((event, index, items) => items.findIndex((candidate) => candidate.browserUrl === event.browserUrl) === index).slice(0, 3)
  const latestRag = [...events].reverse().find((event) => event.kind === 'rag')
  return <div className="regional-run-page">
    <header className="release-simple-header"><a href="#/" aria-label="返回项目大厅"><ArrowLeft size={19} /></a><BrandMark compact /><div><span>02 · REGIONAL ANALYSIS</span><strong>{project.game} · {project.version}</strong></div><p>{running ? 'Agent正在检索真实公开网页' : error ? '研究未完成' : '区域研究已完成'}</p></header>
    <main className="regional-run-main">
      <section className="regional-run-heading"><span>AGENT RESEARCH</span><h1>Agent正在理解不同区域。</h1><p>每条玩家观点都必须带HTTPS来源和原始摘录；Wiki只补充版本背景，不计入玩家情绪。没有命中就显示0，不补造评论。</p><div className="regional-run-status">{running ? <><CircleNotch className="spin" size={20} /> {latest?.message || '正在建立区域检索队列…'}</> : error ? <><WarningCircle size={20} /> {error}</> : <><Database size={20} /> 真实证据已交接</>}</div><div className="regional-run-coverage"><div><span>站点目标</span><strong>{latestCoverage?.sitesAttempted ?? 0} / 30+</strong></div><div><span>真实玩家证据</span><strong>{evidence.length} / 30+</strong></div><div><span>无头页面</span><strong>{browserCompleted.length} 已观察</strong></div><div><span>本地RAG</span><strong>{latestRag?.ragDocuments ?? 0} 文档 · {latestRag?.ragChunks ?? 0} 分块</strong></div></div></section>
      <section className="regional-browser-observer" aria-live="polite"><header><div><Browser size={19} /><span>HEADLESS BROWSER</span><strong>后台网页观察</strong></div><small>{browserCompleted.length} 个页面已提取 · Playwright后台运行</small></header><div>{latestBrowserEvents.length ? latestBrowserEvents.map((event) => <article key={`${event.id}-${event.browserUrl}`} data-status={event.browserStatus}><span>{event.browserStatus === 'completed' ? '已提取' : event.browserStatus === 'navigating' ? '访问中' : event.browserStatus === 'challenge_waiting' ? '等待验证' : '失败'}</span><strong>{event.browserTitle || event.source || '公开网页'}</strong><p>{event.browserPreview || event.browserUrl}</p><small>{event.browserUrl}</small></article>) : <article className="is-empty"><CircleNotch className={running ? 'spin' : ''} size={18} /><strong>{running ? '正在启动后台浏览器…' : '本次没有可观察页面'}</strong><p>网页正文提取后会在这里显示。</p></article>}</div></section>
      <section className="regional-run-regions">{project.regions.map((region) => { const records = evidence.filter((item) => item.region === region); const regionEvents = events.filter((event) => event.region === region); return <article key={region}><header><span className={`fi fi-${flags[region]}`} /><div><span>{region}</span><h2>{labels[region]}</h2></div><strong>{records.length}</strong></header><p>{records.length ? `已到达 ${records.length} 条可核验公开证据，来自 ${new Set(records.map((item) => item.source)).size} 个实际命中来源。` : running ? '正在搜索公开玩家讨论…' : '本次没有足够可核验证据，不生成当地玩家结论。'}</p><div className="regional-run-meter"><i style={{ width: `${Math.min(100, regionEvents.at(-1)?.progress ?? (running ? 8 : 100))}%` }} /></div></article>})}</section>
      <details className="regional-run-details"><summary><GlobeHemisphereWest size={18} /> 查看研究运行详情与Timeline</summary><div>{events.map((event) => <p key={event.id}><span>{event.agentId.toUpperCase()}</span><strong>{event.message}</strong></p>)}</div></details>
      {error && <section className="regional-run-error"><WarningCircle size={24} /><div><strong>保留版本Brief，未生成低样本方案</strong><p>{error}</p><a href={`#/projects/${encodeURIComponent(project.id)}/analyze`}>重试真实研究</a></div></section>}
    </main>
  </div>
}
