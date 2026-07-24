import type { EvidenceRecord } from './types'
import type { ReleaseAction, ReleaseProject, ReleaseRegion } from './release-project'

const regionMeta: Record<ReleaseRegion, { flag: string; label: string }> = {
  CN: { flag: '🇨🇳', label: '中国' },
  JP: { flag: '🇯🇵', label: '日本' },
  WEST: { flag: '🌐', label: '北美及英语市场' },
}

const stageLabels: Record<ReleaseAction['stage'], string> = {
  preheat: '预热期',
  launch: '上线爆发期',
  sustain: '持续运营期',
  long_tail: '长尾运营期',
}

const objectiveLabels = {
  acquisition: '新增玩家获取',
  activity: '活跃提升',
  recall: '玩家召回',
  revenue: '商业化目标',
}

function evidenceLine(item: EvidenceRecord) {
  const summary = (item.excerptZh || item.excerptOriginal).replace(/\s+/g, ' ').trim().slice(0, 180)
  return `- [${item.id}] **${item.source} · ${item.region}**：${summary}（[原始页面](${item.url})）`
}

function actionTable(actions: ReleaseAction[]) {
  if (!actions.length) return '_当前没有可执行动作。_'
  return [
    '| 阶段 | 动作 | 时间 | 渠道 | 风险 | 审批 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...actions.map((action) => `| ${stageLabels[action.stage]} | ${action.title} | D${action.startDay >= 0 ? '+' : ''}${action.startDay}～D${action.endDay >= 0 ? '+' : ''}${action.endDay} | ${action.channels.join('、')} | ${action.riskLevel} | ${action.requiresApproval ? '需要' : '不需要'} |`),
  ].join('\n')
}

export function buildReleasePlanMarkdown(project: ReleaseProject) {
  const plan = project.currentPlan
  if (!plan) throw new Error('发行方案尚未生成。')
  const evidence = (project.researchSnapshot?.evidence ?? []).filter((item) => item.synthetic === false && item.url.startsWith('https://'))
  if (!evidence.length) throw new Error('没有真实公开证据，不能生成发行方案文档。')

  const regionalSections = project.regions.map((region) => {
    const meta = regionMeta[region]
    const regional = plan.regionalPlans.find((item) => item.region === region)
    const records = evidence.filter((item) => item.region === region)
    const actions = plan.actions.filter((item) => item.region === region)
    const citations = records.slice(0, 6).map((item) => `[${item.id}]`).join(' ')
    return [
      `### ${meta.flag} ${meta.label}`,
      '',
      `- **证据覆盖：** ${records.length} 条真实公开证据；${regional?.evidenceCoverage ?? 'insufficient'}`,
      `- **主推卖点：** ${regional?.primarySellingPoint ?? plan.globalStrategy.primarySellingPoint}`,
      `- **玩家信号：** ${regional?.playerSignals.join('、') || '当前证据不足，不推断玩家偏好'}`,
      `- **策略：** ${regional?.strategySummary ?? '保持全球统一表达，等待更多真实证据。'} ${citations}`,
      `- **机会：** ${regional?.opportunitySummary ?? '暂无可靠判断。'}`,
      `- **风险：** ${regional?.riskSummary ?? '不得把 Brief 假设写成玩家事实。'}`,
      '',
      actionTable(actions),
    ].join('\n')
  }).join('\n\n')

  const metricSet = [...new Set(plan.actions.flatMap((item) => item.metrics))]
  const approvalActions = plan.actions.filter((item) => item.requiresApproval)
  return [
    `# ${project.game} ${project.version}「${project.updateName}」全球发行方案`,
    '',
    `> 文档由 ReHoYo Agent 基于本次实时检索的 ${evidence.length} 条可核验公开证据生成。证据仅代表已访问页面，不代表全部玩家。`,
    '',
    '## 执行摘要',
    '',
    `本次发行以**${objectiveLabels[plan.globalStrategy.primaryObjective]}**为首要目标，以“${plan.globalStrategy.axis}”为全球统一主轴。所有区域共享已确认版本事实与核心资产；素材切入、内容语气、渠道组合和发布节奏仅在真实证据支持时差异化。`,
    '',
    '## 全球策略主轴',
    '',
    `- **统一表达：** ${plan.globalStrategy.unifiedExpression}`,
    `- **核心卖点：** ${plan.globalStrategy.primarySellingPoint}`,
    `- **目标受众：** ${plan.globalStrategy.targetAudience.join('、')}`,
    `- **可用资产：** ${plan.globalStrategy.globalAssets.join('、') || '未提供'}`,
    `- **可差异化部分：** ${plan.globalStrategy.differentiableParts.join('、')}`,
    '',
    '## 区域发行策略',
    '',
    regionalSections,
    '',
    '## 42 天发行节奏',
    '',
    actionTable(plan.actions),
    '',
    '## 风险、审批与停止条件',
    '',
    ...plan.globalStrategy.risks.map((risk) => `- ${risk}`),
    ...approvalActions.slice(0, 12).map((action) => `- **${regionMeta[action.region].label}｜${action.title}：** 执行前人工审批；${action.evaluation.optimization}`),
    '- 若发现证据来源不可验证、地区归因错误、未公开信息或负面反馈快速上升，立即停止相关差异化动作并回到统一版本事实。',
    '',
    '## 衡量指标',
    '',
    ...metricSet.map((metric) => `- ${metric}`),
    '- 所有指标先建立上线前基线，再按区域、渠道和素材版本分层观察；没有真实执行数据时不预测转化率或收入。',
    '',
    '## 公开证据索引',
    '',
    ...evidence.map(evidenceLine),
  ].join('\n')
}

export function applyReleasePlanMarkdown(
  project: ReleaseProject,
  markdown: string,
  updatedBy: 'agent' | 'user',
  now: () => Date = () => new Date(),
): ReleaseProject {
  const clean = markdown.trim()
  if (!clean.startsWith('# ')) throw new Error('发行方案 Markdown 必须以一级标题开始。')
  const createdAt = now().toISOString()
  const previous = project.releasePlanDocument
  const revision = (previous?.revision ?? 0) + 1
  const entry = {
    id: `${project.id}-document-r${revision}-${Date.parse(createdAt)}`,
    revision,
    markdown: clean,
    updatedBy,
    createdAt,
  }
  return {
    ...project,
    releasePlanDocument: {
      markdown: clean,
      revision,
      updatedBy,
      updatedAt: createdAt,
      revisions: [...(previous?.revisions ?? []), entry],
    },
    updatedAt: createdAt,
  }
}
