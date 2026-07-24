import { ArrowRight, ChatCircleText, Database, PaperPlaneTilt, X } from '@phosphor-icons/react'
import { useMemo, useState, type FormEvent } from 'react'
import type { ReleaseProject, ReleaseRegion } from '../../domain/release-project'

interface Props {
  project: ReleaseProject
  region: ReleaseRegion
  onShowEvidence: () => void
}

const regionLabels: Record<ReleaseRegion, string> = { CN: '中国', JP: '日本', WEST: '北美及英语市场' }
const questions = ['为什么这样规划这个区域？', '当前最需要人工确认什么？', '证据还缺什么？']

export function ReleaseAssistant({ project, region, onShowEvidence }: Props) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const plan = project.currentPlan
  const regional = plan?.regionalPlans.find((item) => item.region === region)
  const actions = plan?.actions.filter((item) => item.region === region) ?? []
  const evidenceIds = useMemo(() => regional?.decisionTrace.evidenceIds ?? [], [regional])

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

  function ask(value: string) {
    const next = value.trim()
    if (!next) return
    setQuestion(next)
    setAnswer(explain(next))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    ask(question)
  }

  return <>
    <button className="release-assistant-launcher" type="button" onClick={() => setOpen(true)} aria-label="打开常驻发行助手"><ChatCircleText size={21} weight="fill" /><span>问发行助手</span></button>
    {open && <aside className="release-assistant-panel" aria-label="常驻发行助手">
      <header><div><span>REHOYO RELEASE COPILOT</span><strong>{regionLabels[region]}决策解释</strong></div><button type="button" onClick={() => setOpen(false)} aria-label="关闭发行助手"><X size={19} /></button></header>
      <section className="release-assistant-context"><Database size={18} /><div><strong>{regional?.evidenceCount ?? 0} 条区域证据</strong><span>{regional?.decisionTrace.basis === 'evidence_backed' ? '证据＋Brief' : 'Brief驱动／证据不足'}</span></div></section>
      <div className="release-assistant-questions">{questions.map((item) => <button type="button" key={item} onClick={() => ask(item)}>{item}<ArrowRight size={15} /></button>)}</div>
      {answer && <article><span>ASSISTANT</span><p>{answer}</p>{evidenceIds.length > 0 && <button type="button" onClick={onShowEvidence}>查看 {evidenceIds.length} 条判断依据 <ArrowRight size={14} /></button>}</article>}
      <form onSubmit={submit}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="询问区域差异、风险或证据缺口" aria-label="询问发行助手" /><button type="submit" aria-label="发送问题"><PaperPlaneTilt size={18} /></button></form>
      <small>回答只读取当前Brief、方案与真实证据，不补造玩家观点。</small>
    </aside>}
  </>
}
