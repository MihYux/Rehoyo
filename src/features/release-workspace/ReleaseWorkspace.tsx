import { ArrowRight, CheckCircle, Database, GlobeHemisphereWest, LockKey, Sparkle, Strategy } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BrandMark } from '../../components/BrandMark'
import {
  approveCharacterSandbox,
  createCharacterSandboxDraft,
  pauseCharacterSandbox,
  startCharacterSandbox,
  stopCharacterSandbox,
  type ReleaseProject,
  type ReleaseRegion,
} from '../../domain/release-project'
import { ReleaseAssistant } from './ReleaseAssistant'
import { ReleasePlanStudio } from './ReleasePlanStudio'

interface Props {
  project: ReleaseProject
  onUpdate: (project: ReleaseProject) => void
}

type WorkspaceView = 'regions' | 'plan' | 'character' | 'evidence'
const views: Array<{ id: WorkspaceView; label: string; icon: typeof Strategy }> = [
  { id: 'regions', label: '区域分析', icon: GlobeHemisphereWest },
  { id: 'plan', label: '发行方案', icon: Strategy },
  { id: 'character', label: 'AI角色执行', icon: Sparkle },
  { id: 'evidence', label: '查看依据', icon: Database },
]
const regionLabels: Record<ReleaseRegion, string> = { CN: '中国', JP: '日本', WEST: '北美及英语市场' }
const regionFlags: Record<ReleaseRegion, string> = { CN: 'cn', JP: 'jp', WEST: 'us' }
const basisLabels = { evidence_backed: '证据＋Brief', brief_driven: 'Brief驱动', experimental_hypothesis: '实验假设' }

export function ReleaseWorkspace({ project, onUpdate }: Props) {
  const plan = project.currentPlan
  const [params, setParams] = useSearchParams()
  const requested = params.get('view') as WorkspaceView | null
  const view: WorkspaceView = requested && views.some((item) => item.id === requested) ? requested : 'regions'
  useEffect(() => {
    if (!navigator.userAgent.toLocaleLowerCase().includes('jsdom')) window.scrollTo({ top: 0, behavior: 'auto' })
  }, [view])
  const defaultRegion = plan?.regionalPlans.find((item) => item.evidenceCount > 0)?.region ?? project.regions[0]
  const [region, setRegion] = useState<ReleaseRegion>(defaultRegion)
  const [sandboxMode, setSandboxMode] = useState<'official' | 'template' | 'bounded'>('template')
  const regionalPlan = plan?.regionalPlans.find((item) => item.region === region)
  const characterPlan = plan?.characterPlans.find((item) => item.targetRegion === region) ?? plan?.characterPlans[0]
  const characterExecution = characterPlan ? (project.characterExecutions ?? []).find((item) => item.actionId === characterPlan.actionId) : undefined
  const evidence = project.researchSnapshot?.evidence ?? []
  const pendingApprovals = plan?.actions.filter((item) => item.requiresApproval && item.status !== 'approved').length ?? 0
  const countdownDays = Math.ceil((Date.parse(project.releaseAt) - Date.now()) / 86_400_000)
  const currentVersion = project.planVersions.find((item) => item.id === project.currentPlanVersionId)?.version ?? project.planVersions.at(-1)?.version ?? 'V0.1'

  if (!plan) return <main className="release-workspace-empty"><BrandMark /><h1>发行方案尚未生成</h1><p>先完成真实区域研究。没有可核验证据时，ReHoYo不会生成区域玩家结论。</p><a href={`#/projects/${encodeURIComponent(project.id)}/analyze`}>继续区域研究 <ArrowRight size={17} /></a></main>

  return <div className="release-workspace-page">
    <header className="release-workspace-header">
      <a href="#/" aria-label="返回项目大厅"><BrandMark compact /></a>
      <div className="release-workspace-title"><span>{project.game} · {project.version}</span><strong>{project.updateName}</strong></div>
      <div className="release-workspace-axis"><span>全球主轴</span><strong>{plan.globalStrategy.axis}</strong></div>
      <div className="release-workspace-status"><span>{countdownDays >= 0 ? `距上线 D-${countdownDays}` : `已上线 D+${Math.abs(countdownDays)}`}</span><strong>{project.status === 'approved' ? `${currentVersion} 已确认` : `${currentVersion} · ${pendingApprovals} 项待确认`}</strong></div>
    </header>

    <nav className="release-workspace-nav" aria-label="发行项目路径">
      {views.map(({ id, label, icon: Icon }, index) => <button key={id} type="button" className={view === id ? 'is-active' : ''} onClick={() => setParams({ view: id })} aria-label={label}><span>{String(index + 2).padStart(2, '0')}</span><Icon size={18} /><strong>{label}</strong></button>)}
    </nav>

    <main className="release-workspace-main">
      {view !== 'evidence' && view !== 'plan' && <div className="workspace-region-switcher" aria-label="选择区域">{project.regions.map((item) => <button type="button" key={item} className={region === item ? 'is-selected' : ''} onClick={() => setRegion(item)} aria-label={regionLabels[item]}><span className={`fi fi-${regionFlags[item]}`} /><strong>{regionLabels[item]}</strong><small>{plan.regionalPlans.find((regional) => regional.region === item)?.evidenceCount ?? 0} 条真实证据</small></button>)}</div>}

      {view === 'regions' && regionalPlan && <section className="workspace-view-section release-regions-view">
        <header className="workspace-view-heading"><div><span>02 · REGIONAL ANALYSIS</span><h1>区域分析</h1><p>Agent只用当前可核验公开页面解释地区信号；没有证据的区域保持空白。</p></div><span className={`coverage-label coverage-${regionalPlan.evidenceCoverage}`}>{regionalPlan.evidenceCoverage === 'insufficient' ? '证据不足' : regionalPlan.evidenceCoverage === 'partial' ? '部分覆盖' : '覆盖充分'}</span></header>
        <article className="regional-decision-hero"><div><span>当前区域策略</span><h2>{regionalPlan.strategySummary}</h2></div><dl><div><dt>发行目标</dt><dd>{regionalPlan.objective}</dd></div><div><dt>主推卖点</dt><dd>{regionalPlan.primarySellingPoint}</dd></div><div><dt>判断依据</dt><dd>{basisLabels[regionalPlan.decisionTrace.basis]}</dd></div></dl></article>
        <div className="regional-signal-layout"><section><span>真实玩家信号</span>{regionalPlan.playerSignals.length ? <ul>{regionalPlan.playerSignals.map((signal) => <li key={signal}>{signal}</li>)}</ul> : <div className="release-empty-state"><Database size={23} /><strong>当前没有足够区域证据</strong><p>不会生成玩家比例、情绪或偏好结论。</p></div>}</section><section><span>机会与风险</span><h3>{regionalPlan.opportunitySummary}</h3><p>{regionalPlan.riskSummary}</p><small>来源：{regionalPlan.recommendedChannels.join(' · ')}</small></section></div>
        <section className="region-next-step"><div><span>下一步</span><h2>把区域信号转成可执行发行方案</h2></div><button type="button" onClick={() => setParams({ view: 'plan' })}>查看发行方案 <ArrowRight size={18} /></button></section>
      </section>}

      {view === 'plan' && <ReleasePlanStudio project={project} onUpdate={onUpdate} onShowEvidence={() => setParams({ view: 'evidence' })} />}

      {view === 'character' && <section className="workspace-view-section character-execution-view">
        <header className="workspace-view-heading"><div><span>04 · CHARACTER EXECUTION</span><h1>AI角色发行预演</h1><p>角色Agent只在受控沙盒中执行已审核方案。它不会接触、识别或向真实玩家发送消息。</p></div><span className="sandbox-badge"><LockKey size={15} /> 未连接真实玩家</span></header>
        {characterPlan ? <>
          <article className="character-plan-brief"><div className="character-avatar"><Sparkle size={31} /></div><div><span>{regionLabels[characterPlan.targetRegion]} · {characterPlan.useCase}</span><h2>{characterPlan.character}</h2><p>{characterPlan.narrativeApproach}</p></div><dl><div><dt>场景</dt><dd>{characterPlan.scenario}</dd></div><div><dt>触达限制</dt><dd>{characterPlan.frequencyLimit}</dd></div><div><dt>状态</dt><dd>{characterExecution?.status === 'awaiting_review' ? '等待人工审批' : characterExecution?.status === 'approved' ? '已审批待启动' : characterExecution?.status === 'running' ? '沙盒运行中' : characterExecution?.status === 'paused' ? '已暂停' : characterExecution?.status === 'stopped' ? '已停止' : '尚未生成草稿'}</dd></div></dl></article>
          <section className="character-message-comparison"><header><span>触达方式对比</span><h2>选择一种方式进行沙盒预演</h2></header>{([['official', '普通官方通知', '只说明版本事实，不使用角色口吻。'], ['template', '审核角色模板', '使用经过角色监修的固定模板。'], ['bounded', '有限个性化', '只在白名单字段内调整称呼与内容顺序。']] as const).map(([id, title, copy]) => <button type="button" key={id} className={sandboxMode === id ? 'is-selected' : ''} onClick={() => setSandboxMode(id)}><span>{sandboxMode === id ? <CheckCircle size={20} weight="fill" /> : <i />}</span><div><strong>{title}</strong><p>{copy}</p></div></button>)}</section>
          <article className="character-sandbox-preview"><header><span>SANDBOX PREVIEW</span><strong>{sandboxMode === 'official' ? '官方版本通知' : sandboxMode === 'template' ? '审核角色模板' : '有限个性化角色消息'}</strong></header><div><p>{characterExecution?.contentDraft?.body ?? (sandboxMode === 'official' ? `${project.game} ${project.version}「${project.updateName}」即将上线。查看版本内容与活动说明。` : `开拓者，新的旅程快开始了。这次和「${plan.globalStrategy.primarySellingPoint}」有关，我把已公开的版本线索整理好了。要一起看看吗？`)}</p><small>此内容只使用版本Brief中的已确认字段，不代表真实玩家对话；不会自动发送，外部发送渠道未接入。</small></div></article>
          <section className="character-safety-grid"><div><span>审核要求</span><ul>{characterPlan.reviewRequirements.map((item) => <li key={item}>{item}</li>)}</ul></div><div><span>禁用内容与停止条件</span><ul>{[...characterPlan.forbiddenTopics, ...characterPlan.stopConditions].map((item) => <li key={item}>{item}</li>)}</ul></div></section>
          <section className="character-execution-controls" aria-label="角色沙盒执行控制">
            <div><span>所有操作只写入本地沙盒日志</span><strong>真实发送：关闭</strong></div>
            {!characterExecution || ['draft', 'stopped', 'completed'].includes(characterExecution.status) ? <button type="button" onClick={() => onUpdate(createCharacterSandboxDraft(project, characterPlan.actionId, sandboxMode === 'template' ? 'reviewed_template' : sandboxMode === 'bounded' ? 'bounded_personalization' : 'official'))}>生成待审草稿 <ArrowRight size={18} /></button> : null}
            {characterExecution?.status === 'awaiting_review' ? <button type="button" onClick={() => onUpdate(approveCharacterSandbox(project, characterPlan.actionId))}>确认事实并批准 <CheckCircle size={18} /></button> : null}
            {characterExecution?.status === 'approved' ? <button type="button" onClick={() => onUpdate(startCharacterSandbox(project, characterPlan.actionId))}>启动沙盒执行 <ArrowRight size={18} /></button> : null}
            {characterExecution?.status === 'running' ? <><button type="button" onClick={() => onUpdate(pauseCharacterSandbox(project, characterPlan.actionId))}>暂停沙盒</button><button className="is-danger" type="button" onClick={() => onUpdate(stopCharacterSandbox(project, characterPlan.actionId))}>停止沙盒</button></> : null}
            {characterExecution?.status === 'paused' ? <><button type="button" onClick={() => onUpdate(startCharacterSandbox(project, characterPlan.actionId))}>恢复沙盒</button><button className="is-danger" type="button" onClick={() => onUpdate(stopCharacterSandbox(project, characterPlan.actionId))}>停止沙盒</button></> : null}
          </section>
          {characterExecution?.events.length ? <section className="character-execution-log"><header><span>EXECUTION LOG</span><strong>{characterExecution.events.length} 条沙盒流程事件</strong></header>{characterExecution.events.map((event) => <div key={event.id}><time>{new Date(event.occurredAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time><span>{event.message}</span><small>SANDBOX</small></div>)}</section> : null}
        </> : <div className="release-empty-state character-empty"><Sparkle size={30} /><strong>当前版本不建议使用AI角色关系发行</strong><p>缺少角色卖点、区域角色／剧情证据、审核资产或显式授权时，角色Agent不会生成执行方案。</p></div>}
      </section>}

      {view === 'evidence' && <section className="workspace-view-section evidence-workspace-view">
        <header className="workspace-view-heading"><div><span>RESEARCH DETAIL</span><h1>证据与研究</h1><p>这里保留研究可信度详情，不占用日常发行决策主界面。</p></div><span>{evidence.length}条真实公开证据</span></header>
        {project.researchSnapshot?.researchCoverage && <section className={`research-coverage-summary ${project.researchSnapshot.researchCoverage.targetReached ? 'is-complete' : 'is-partial'}`}><div><span>实际搜索站点</span><strong>{project.researchSnapshot.researchCoverage.sitesAttempted}</strong><small>目标 {project.researchSnapshot.researchCoverage.targetSites}+ · {project.researchSnapshot.researchCoverage.providers.join(' · ')}</small></div><div><span>真实玩家证据</span><strong>{project.researchSnapshot.researchCoverage.evidenceCollected}</strong><small>目标 {project.researchSnapshot.researchCoverage.targetEvidence}+ · 不含Wiki</small></div><div><span>Wiki背景资料</span><strong>{project.researchSnapshot.researchCoverage.wikiDocuments ?? 0}</strong><small>仅解释人物、地点和版本</small></div><div><span>本地RAG知识库</span><strong>{project.researchSnapshot.researchCoverage.ragDocuments ?? 0}</strong><small>{project.researchSnapshot.researchCoverage.ragChunks ?? 0} 个分块 · {project.researchSnapshot.researchCoverage.browserPagesObserved ?? 0} 页已观察</small></div></section>}
        <div className="evidence-coverage-strip">{project.regions.map((item) => <div key={item}><span className={`fi fi-${regionFlags[item]}`} /><strong>{regionLabels[item]}</strong><small>{evidence.filter((record) => record.region === item).length}条</small></div>)}</div>
        <div className="release-evidence-list">{evidence.map((item) => <article key={item.id}><span>{item.source} · {item.region}</span><h2>{item.title || item.excerptZh.slice(0, 60)}</h2><p>{item.excerptZh}</p><a href={item.url} target="_blank" rel="noreferrer">查看原始HTTPS页面 <ArrowRight size={15} /></a></article>)}</div>
      </section>}
    </main>
    {view !== 'plan' && <ReleaseAssistant project={project} region={region} onShowEvidence={() => setParams({ view: 'evidence' })} />}
  </div>
}
