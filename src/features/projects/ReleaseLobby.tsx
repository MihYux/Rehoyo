import { ArrowDown, ArrowRight, Broadcast, CalendarBlank, GlobeHemisphereWest, Sparkle, Strategy } from '@phosphor-icons/react'
import { BrandMark } from '../../components/BrandMark'
import type { ReleaseProject } from '../../domain/release-project'

interface Props {
  projects: ReleaseProject[]
  onCreate: () => void
  onOpen: (project: ReleaseProject) => void
}

const stages = [
  { id: 'version', number: '01', icon: CalendarBlank, title: '输入新版本内容', copy: '提交发行目标、核心卖点、可用资产和执行边界。业务输入始终与玩家证据分开。', detail: '版本Brief' },
  { id: 'regions', number: '02', icon: GlobeHemisphereWest, title: 'Agent针对区域进行分析', copy: '研究中国、日本和北美公开讨论。没有真实证据的区域不生成玩家偏好。', detail: '真实公开研究' },
  { id: 'plan', number: '03', icon: Strategy, title: 'Agent给出发行方案', copy: '生成全球主轴、区域动作和42天节奏。每项动作说明证据、Brief和不确定性。', detail: '可执行方案' },
  { id: 'character', number: '04', icon: Sparkle, title: 'AI角色执行自己的方案', copy: '在受控沙盒中预演已审核的角色触达方案。它不连接真实玩家，也不会自动发送。', detail: '安全预演' },
]

export function ReleaseLobby({ projects, onCreate, onOpen }: Props) {
  return <div className="release-lobby-page">
    <header className="release-lobby-header"><BrandMark /><nav aria-label="项目大厅导航"><a href="#release-flow">产品路径</a><a href="#release-projects">发行项目</a></nav><span><i /> REAL EVIDENCE ONLY</span></header>
    <main>
      <section className="release-lobby-hero">
        <div><span>REHOYO · GLOBAL RELEASE DECISION</span><h1>从看见全球玩家，<br />到决定版本怎么发行。</h1><p>输入新版本内容，Agent完成区域研究与发行规划，最后由AI角色在受控沙盒中预演自己的发行方案。</p><div className="release-hero-actions"><button type="button" onClick={onCreate}>创建版本发行项目 <ArrowRight size={20} /></button>{projects[0] && <button type="button" onClick={() => onOpen(projects[0])}>继续最近项目</button>}</div></div>
        <aside><span>当前工作方式</span><strong>流程属于Agent</strong><strong>决策属于人</strong><strong>证据贯穿始终</strong><small>公开网页事实、团队Brief和Agent判断分别标记</small></aside>
        <a className="release-scroll-cue" href="#release-flow">向下查看产品路径 <ArrowDown size={17} /></a>
      </section>

      <section className="release-flow" id="release-flow" aria-label="产品路径">
        {stages.map(({ id, number, icon: Icon, title, copy, detail }, index) => <article key={id} id={`release-stage-${id}`}><div className="release-stage-number">{number}</div><div className="release-stage-icon"><Icon size={31} weight="duotone" /></div><div><span>{detail}</span><h2>{title}</h2><p>{copy}</p>{index < stages.length - 1 && <a href={`#release-stage-${stages[index + 1].id}`}>继续了解下一阶段 <ArrowDown size={16} /></a>}</div></article>)}
      </section>

      <section className="release-project-list" id="release-projects"><header><div><span>RELEASE PROJECTS</span><h2>版本发行项目</h2></div><button type="button" onClick={onCreate}>新建项目 <ArrowRight size={18} /></button></header>{projects.length ? <div>{projects.slice(0, 3).map((project) => <button type="button" key={project.id} onClick={() => onOpen(project)}><span>{project.game} · {project.version}</span><strong>{project.updateName}</strong><dl><div><dt>状态</dt><dd>{project.status === 'brief_draft' ? 'Brief待研究' : project.status === 'researching' ? '区域研究中' : project.status === 'approved' ? 'V1.0已确认' : '方案待审阅'}</dd></div><div><dt>区域</dt><dd>{project.regions.join(' · ')}</dd></div><div><dt>更新</dt><dd>{new Date(project.updatedAt).toLocaleDateString('zh-CN')}</dd></div></dl><ArrowRight size={20} /></button>)}</div> : <div className="release-project-empty"><Broadcast size={27} /><strong>还没有版本发行项目</strong><p>创建项目后，Brief、真实研究、区域方案和人工确认会保存在此设备。</p></div>}</section>
    </main>
    <footer className="release-lobby-footer"><BrandMark compact /><p>概念演示，非官方产品。只研究公开网页；不接入真实玩家账号，不自动执行发行。</p></footer>
  </div>
}
