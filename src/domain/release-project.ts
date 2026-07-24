import type { AnalysisPreset, EvidenceRecord, RegionCode } from './types'

export const RELEASE_STORAGE_KEY = 'rehoyo.release.v1'

export type ReleaseRegion = Exclude<RegionCode, 'GLOBAL'>
export type Objective = 'acquisition' | 'activity' | 'recall' | 'revenue'
export type Level = 'low' | 'medium' | 'high'
export type DecisionBasis = 'evidence_backed' | 'brief_driven' | 'experimental_hypothesis'
export type ReleaseActionType = 'material' | 'social' | 'kol' | 'paid_media' | 'partnership' | 'community' | 'character_relationship'
export type ReleaseStage = 'preheat' | 'launch' | 'sustain' | 'long_tail'
export type ActionRating = 'recommended' | 'adjust_before_execution' | 'limited_pilot' | 'manual_review' | 'not_recommended'
export type CharacterCampaignStatus = 'draft' | 'awaiting_review' | 'approved' | 'running' | 'paused' | 'completed' | 'stopped'

export interface SellingPoint {
  id: string
  type: 'character' | 'map' | 'story' | 'gameplay' | 'event' | 'partnership' | 'quality' | 'other'
  name: string
  description: string
  priority: 'primary' | 'secondary' | 'supporting'
  regionalAdjustmentAllowed: boolean
  regions: readonly ReleaseRegion[]
  assetIds: string[]
}

export interface VersionReleaseBrief {
  primaryObjective: Objective
  secondaryObjectives: string[]
  activityExpectation: Level
  revenueExpectation: Level
  sellingPoints: SellingPoint[]
  availableAssets: string[]
  budgetLevel: Level
  teamCapacity: string[]
  mandatoryActions: string[]
  prohibitedActions: string[]
  riskPreference: 'conservative' | 'balanced' | 'experimental'
  allowCharacterRelationshipPilot: boolean
}

export interface BriefFact {
  id: string
  field: string
  value: unknown
  source: 'user_input' | 'imported_internal_brief'
  createdAt: string
  updatedAt: string
}

export interface DecisionTrace {
  briefFactIds: string[]
  evidenceIds: string[]
  basis: DecisionBasis
  reasoningSummary: string
  confidence: Level
  limitations: string[]
  createdAt: string
}

export interface ActionEvaluation {
  rating: ActionRating
  score: number
  dimensions: Record<'objectiveFit' | 'sellingPointFit' | 'regionalFit' | 'evidenceStrength' | 'resourceFeasibility' | 'channelFit' | 'timingFit' | 'riskControl' | 'verifiability', number>
  rationale: string
  issues: string[]
  conflicts: string[]
  metrics: string[]
  optimization: string
  requiresApproval: boolean
}

export interface ReleaseAction {
  id: string
  projectId: string
  region: ReleaseRegion
  type: ReleaseActionType
  title: string
  objective: string
  sellingPointId: string
  audience: string[]
  channels: string[]
  stage: ReleaseStage
  startDay: number
  endDay: number
  description: string
  dependencies: string[]
  costLevel: Level
  riskLevel: Level
  metrics: string[]
  decisionTrace: DecisionTrace
  evaluation: ActionEvaluation
  status: 'draft' | 'needs_review' | 'approved' | 'rejected'
  locked: boolean
  requiresApproval: boolean
}

export interface RegionalReleasePlan {
  id: string
  projectId: string
  region: ReleaseRegion
  objective: string
  audience: string[]
  primarySellingPoint: string
  strategySummary: string
  opportunitySummary: string
  riskSummary: string
  recommendedChannels: string[]
  evidenceCoverage: 'insufficient' | 'partial' | 'sufficient'
  playerSignals: string[]
  evidenceCount: number
  actionIds: string[]
  decisionTrace: DecisionTrace
}

export interface CharacterRelationshipPlan {
  actionId: string
  character: string
  targetRegion: ReleaseRegion
  targetSegment: string[]
  useCase: 'recall' | 'preheat' | 'retention'
  channel: string
  timing: string
  narrativeApproach: string
  objective: string
  sellingPoint: string
  scenario: string
  templateMode: 'reviewed_template' | 'bounded_personalization'
  pilotPercentage: number
  consentRequired: true
  optOutEnabled: true
  reviewRequirements: string[]
  risks: string[]
  metrics: string[]
  expandConditions: string[]
  throttleConditions: string[]
  stopConditions: string[]
  contentRules: string[]
  forbiddenTopics: string[]
  frequencyLimit: string
  status: CharacterCampaignStatus
}

export interface CharacterContentDraft {
  id: string
  actionId: string
  mode: 'official' | 'reviewed_template' | 'bounded_personalization'
  body: string
  fixedFacts: string[]
  controllableFields: string[]
  status: 'draft' | 'approved'
  createdAt: string
  approvedAt?: string
}

export interface CharacterExecutionEvent {
  id: string
  actionId: string
  kind: 'content_generated' | 'approved' | 'started' | 'resumed' | 'paused' | 'completed' | 'stopped'
  message: string
  sandbox: true
  occurredAt: string
}

export interface CharacterExecutionState {
  actionId: string
  status: CharacterCampaignStatus
  contentDraft?: CharacterContentDraft
  events: CharacterExecutionEvent[]
}

export interface ReleasePlan {
  id: string
  projectId: string
  globalStrategy: {
    primaryObjective: Objective
    axis: string
    unifiedExpression: string
    primarySellingPoint: string
    targetAudience: string[]
    globalAssets: string[]
    differentiableParts: string[]
    risks: string[]
    decisionTrace: DecisionTrace
  }
  regionalPlans: RegionalReleasePlan[]
  actions: ReleaseAction[]
  characterPlans: CharacterRelationshipPlan[]
  generatedAt: string
}

export interface StrategyPatch {
  id: string
  projectId: string
  targetIds: string[]
  reason: string
  before: Record<string, unknown>
  after: Record<string, unknown>
  affectedRegions: string[]
  affectedActions: string[]
  riskChange: string
  requiresApproval: boolean
}

export interface PlanVersion {
  id: string
  projectId: string
  version: string
  plan: ReleasePlan
  changeSummary: string
  status: 'draft' | 'approved' | 'superseded'
  createdAt: string
}

export interface ReleasePlanDocumentRevision {
  id: string
  revision: number
  markdown: string
  updatedBy: 'agent' | 'user'
  createdAt: string
}

export interface ReleasePlanDocument {
  markdown: string
  revision: number
  updatedBy: 'agent' | 'user'
  updatedAt: string
  revisions: ReleasePlanDocumentRevision[]
}

export interface ReleaseProject {
  id: string
  game: string
  version: string
  updateName: string
  releaseAt: string
  cycleDays: number
  regions: ReleaseRegion[]
  brief: VersionReleaseBrief
  briefFacts: BriefFact[]
  researchRunIds: string[]
  researchSnapshot?: AnalysisPreset
  currentPlan?: ReleasePlan
  planVersions: PlanVersion[]
  currentPlanVersionId?: string
  releasePlanDocument?: ReleasePlanDocument
  characterExecutions: CharacterExecutionState[]
  status: 'brief_draft' | 'researching' | 'strategy_draft' | 'review_required' | 'approved'
  createdAt: string
  updatedAt: string
}

export interface ReleaseProjectInput {
  game: string
  version: string
  updateName: string
  releaseAt: string
  regions: readonly ReleaseRegion[]
  brief: VersionReleaseBrief
  cycleDays?: number
}

type Now = () => Date

const objectiveLabels: Record<Objective, string> = {
  acquisition: '新增玩家',
  activity: '活跃提升',
  recall: '玩家召回',
  revenue: '商业化目标',
}

const regionLabels: Record<ReleaseRegion, string> = { CN: '中国', JP: '日本', WEST: '北美及英语市场' }
const regionChannels: Record<ReleaseRegion, string[]> = {
  CN: ['官方社区', '视频平台', '游戏社区'],
  JP: ['官方社媒', '视频平台', '创作者内容'],
  WEST: ['官方社媒', '视频平台', '社区论坛'],
}

function text(value: unknown, label: string, max = 180) {
  const result = String(value ?? '').trim().slice(0, max)
  if (!result) throw new Error(`${label}不能为空。`)
  return result
}

function unique<T>(values: T[]) {
  return [...new Set(values)]
}

function timestamp(now: Now) {
  return now().toISOString()
}

function slug(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 42) || 'project'
}

function briefFacts(brief: VersionReleaseBrief, createdAt: string): BriefFact[] {
  const entries: Array<[string, unknown]> = [
    ['primaryObjective', brief.primaryObjective],
    ['secondaryObjectives', brief.secondaryObjectives],
    ['sellingPoints', brief.sellingPoints],
    ['availableAssets', brief.availableAssets],
    ['budgetLevel', brief.budgetLevel],
    ['teamCapacity', brief.teamCapacity],
    ['mandatoryActions', brief.mandatoryActions],
    ['prohibitedActions', brief.prohibitedActions],
    ['riskPreference', brief.riskPreference],
    ['allowCharacterRelationshipPilot', brief.allowCharacterRelationshipPilot],
  ]
  return entries.map(([field, value], index) => ({
    id: `brief-${String(index + 1).padStart(2, '0')}`,
    field,
    value,
    source: 'user_input',
    createdAt,
    updatedAt: createdAt,
  }))
}

function validateBrief(brief: VersionReleaseBrief) {
  if (!brief || !['acquisition', 'activity', 'recall', 'revenue'].includes(brief.primaryObjective)) {
    throw new Error('请选择首要发行目标。')
  }
  if (!Array.isArray(brief.sellingPoints) || !brief.sellingPoints.length) throw new Error('至少填写一个版本卖点。')
  if (!brief.sellingPoints.some((point) => point.priority === 'primary')) throw new Error('至少设置一个首要卖点。')
  if (!Array.isArray(brief.availableAssets)) throw new Error('可用发行资产格式无效。')
}

export function createReleaseProject(input: ReleaseProjectInput, now: Now = () => new Date()): ReleaseProject {
  validateBrief(input.brief)
  const createdAt = timestamp(now)
  const regions = unique(input.regions.filter((region): region is ReleaseRegion => ['CN', 'JP', 'WEST'].includes(region)))
  if (!regions.length) throw new Error('至少选择一个目标区域。')
  const game = text(input.game, '游戏名称', 120)
  const version = text(input.version, '版本号', 40)
  const updateName = text(input.updateName, '更新名称', 160)
  if (!Number.isFinite(Date.parse(input.releaseAt))) throw new Error('预计上线时间无效。')
  return {
    id: `release-${slug(game)}-${slug(version)}-${Date.parse(createdAt)}`,
    game,
    version,
    updateName,
    releaseAt: new Date(input.releaseAt).toISOString(),
    cycleDays: Math.max(1, Math.min(90, Math.floor(input.cycleDays ?? 42))),
    regions,
    brief: { ...input.brief, sellingPoints: input.brief.sellingPoints.map((point) => ({ ...point, regions: [...point.regions] })) },
    briefFacts: briefFacts(input.brief, createdAt),
    researchRunIds: [],
    planVersions: [],
    characterExecutions: [],
    status: 'brief_draft',
    createdAt,
    updatedAt: createdAt,
  }
}

function isGroundedEvidence(item: EvidenceRecord) {
  try {
    return item.synthetic === false && new URL(item.url).protocol === 'https:' && Boolean(item.excerptOriginal.trim())
  } catch {
    return false
  }
}

function topSignals(records: EvidenceRecord[]) {
  const counts = new Map<string, number>()
  records.forEach((record) => record.topics.forEach((topic) => counts.set(topic, (counts.get(topic) ?? 0) + 1)))
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4).map(([topic]) => topic)
}

function evidenceCoverage(count: number): RegionalReleasePlan['evidenceCoverage'] {
  if (count === 0) return 'insufficient'
  if (count < 5) return 'partial'
  return 'sufficient'
}

function decisionTrace(project: ReleaseProject, records: EvidenceRecord[], now: string, summary: string, experimental = false): DecisionTrace {
  const coverage = evidenceCoverage(records.length)
  const basis: DecisionBasis = experimental ? 'experimental_hypothesis' : records.length ? 'evidence_backed' : 'brief_driven'
  return {
    briefFactIds: project.briefFacts.map((fact) => fact.id),
    evidenceIds: records.map((record) => record.id),
    basis,
    reasoningSummary: summary,
    confidence: coverage === 'sufficient' ? 'high' : coverage === 'partial' ? 'medium' : 'low',
    limitations: coverage === 'insufficient'
      ? ['当前区域没有可核验玩家证据；不得推断当地玩家偏好。', '差异化动作需要小范围验证。']
      : coverage === 'partial' ? ['样本覆盖有限，结论仅代表当前公开页面。'] : [],
    createdAt: now,
  }
}

function metricsFor(type: ReleaseActionType) {
  const map: Record<ReleaseActionType, string[]> = {
    material: ['素材完播率', '核心卖点识别率'],
    social: ['互动率', '负面反馈变化', '内容收藏率'],
    kol: ['有效观看', '评论主题匹配度', '争议反馈'],
    paid_media: ['素材点击趋势', '转化漏斗变化', '停止条件触发率'],
    partnership: ['合作内容参与度', '自然讨论量', '品牌风险反馈'],
    community: ['有效参与人数', 'UGC产出量', '反馈回收率'],
    character_relationship: ['主动订阅率', '退出率', '负面反馈', '人设审核通过率'],
  }
  return map[type]
}

function actionEvaluation(action: Omit<ReleaseAction, 'evaluation'>, coverage: RegionalReleasePlan['evidenceCoverage']): ActionEvaluation {
  const evidenceScore = coverage === 'sufficient' ? 86 : coverage === 'partial' ? 64 : 28
  const resourceScore = action.costLevel === 'high' ? 52 : action.costLevel === 'medium' ? 72 : 88
  const riskScore = action.riskLevel === 'high' ? 45 : action.riskLevel === 'medium' ? 68 : 86
  const dimensions = {
    objectiveFit: 84,
    sellingPointFit: 88,
    regionalFit: coverage === 'insufficient' ? 48 : 78,
    evidenceStrength: evidenceScore,
    resourceFeasibility: resourceScore,
    channelFit: coverage === 'insufficient' ? 54 : 76,
    timingFit: 82,
    riskControl: riskScore,
    verifiability: 86,
  }
  const score = Math.round(Object.values(dimensions).reduce((sum, value) => sum + value, 0) / Object.keys(dimensions).length)
  const requiresApproval = action.requiresApproval || coverage === 'insufficient' || action.costLevel === 'high'
  const rating: ActionRating = action.riskLevel === 'high'
    ? 'manual_review'
    : coverage === 'insufficient' ? (action.type === 'paid_media' || action.type === 'kol' ? 'limited_pilot' : 'manual_review')
      : score >= 78 ? 'recommended' : 'adjust_before_execution'
  const issues = [
    ...(coverage === 'insufficient' ? ['区域公开证据不足'] : []),
    ...(action.costLevel === 'high' ? ['成本等级较高'] : []),
    ...(action.riskLevel === 'high' ? ['需要确认停止条件'] : []),
  ]
  return {
    rating,
    score,
    dimensions,
    rationale: coverage === 'insufficient' ? '当前仅能确认动作与版本Brief一致，区域适配性仍需验证。' : '动作同时响应版本目标、卖点与当前区域公开证据。',
    issues,
    conflicts: [],
    metrics: action.metrics,
    optimization: coverage === 'insufficient' ? '先以小范围或低成本形式验证，再决定是否扩大。' : '执行前复核素材、时间与停止条件。',
    requiresApproval,
  }
}

interface ActionTemplate {
  type: ReleaseActionType
  title: string
  stage: ReleaseStage
  startDay: number
  endDay: number
  cost: Level
  risk: Level
  description: string
}

const actionTemplates: ActionTemplate[] = [
  { type: 'material', title: '区域主叙事素材适配', stage: 'preheat', startDay: -14, endDay: -5, cost: 'medium', risk: 'low', description: '使用已审核资产制作区域版本，不改变事实信息和角色设定。' },
  { type: 'social', title: '上线期社媒内容节奏', stage: 'launch', startDay: -3, endDay: 7, cost: 'low', risk: 'medium', description: '围绕首要卖点安排预热、上线与互动回收，按公开反馈调整表达。' },
  { type: 'kol', title: '创作者内容组合测试', stage: 'launch', startDay: 0, endDay: 10, cost: 'medium', risk: 'medium', description: '只定义创作者类型、受众与内容Brief；不提供未经验证的姓名或报价。' },
  { type: 'paid_media', title: '买量素材小规模测试', stage: 'launch', startDay: 0, endDay: 14, cost: 'high', risk: 'medium', description: '使用低／中／高预算档位和素材矩阵；需要投放数据验证，不预测CPA、LTV或收入。' },
  { type: 'partnership', title: '联动方向可行性验证', stage: 'sustain', startDay: 8, endDay: 28, cost: 'high', risk: 'high', description: '仅定义联动类型、节点和资源需求；不声称任何具体品牌已有合作意向。' },
  { type: 'community', title: '社区共创与反馈回收', stage: 'long_tail', startDay: 21, endDay: 42, cost: 'low', risk: 'low', description: '发起与首要卖点相关的共创主题，并公开回收问题与争议信号。' },
]

export function isCharacterRelationshipEligible(brief: VersionReleaseBrief, evidence: EvidenceRecord[], region: ReleaseRegion) {
  const characterPoint = brief.sellingPoints.find((point) => point.type === 'character' && point.regions.includes(region))
  const regionalEvidence = evidence.filter((item) => item.region === region && isGroundedEvidence(item))
  const hasCharacterSignal = regionalEvidence.some((item) => item.topics.some((topic) => /角色|剧情|关系|character|story/i.test(topic)))
  const hasReviewAssets = brief.availableAssets.some((asset) => /角色设定|审核模板|监修|character.*guide/i.test(asset))
  const reasons = [
    ...(!brief.allowCharacterRelationshipPilot ? ['团队未允许角色关系发行测试'] : []),
    ...(!characterPoint ? ['版本缺少可用于该区域的角色卖点'] : []),
    ...(!hasCharacterSignal ? ['该区域缺少支持角色或剧情内容的真实玩家证据'] : []),
    ...(!hasReviewAssets ? ['缺少角色设定与审核资源'] : []),
    ...(brief.riskPreference === 'conservative' ? ['风险偏好不允许创新灰度'] : []),
  ]
  return { eligible: reasons.length === 0, reasons, characterPoint, evidence: regionalEvidence }
}

export function deriveReleasePlan(project: ReleaseProject, research: AnalysisPreset, now: Now = () => new Date()): ReleasePlan {
  const records = research.evidence.filter(isGroundedEvidence)
  if (!records.length) throw new Error('没有可核验公开证据，不能生成区域玩家结论。')
  const createdAt = timestamp(now)
  const primaryPoint = project.brief.sellingPoints.find((point) => point.priority === 'primary') ?? project.brief.sellingPoints[0]
  const regionalPlans: RegionalReleasePlan[] = []
  const actions: ReleaseAction[] = []
  const characterPlans: CharacterRelationshipPlan[] = []

  for (const region of project.regions) {
    const regionalEvidence = records.filter((record) => record.region === region)
    const coverage = evidenceCoverage(regionalEvidence.length)
    const signals = topSignals(regionalEvidence)
    const trace = decisionTrace(
      project,
      regionalEvidence,
      createdAt,
      regionalEvidence.length
        ? `以版本首要卖点「${primaryPoint.name}」为业务输入，并使用该区域 ${regionalEvidence.length} 条真实公开证据校准表达。`
        : `仅依据版本Brief生成基础发行框架；${regionLabels[region]}公开证据不足，不能推断玩家偏好。`,
    )
    const channelsFromEvidence = unique(regionalEvidence.map((record) => record.source)).slice(0, 3)
    const plan: RegionalReleasePlan = {
      id: `${project.id}-${region.toLocaleLowerCase()}-plan`,
      projectId: project.id,
      region,
      objective: objectiveLabels[project.brief.primaryObjective],
      audience: ['当前版本目标玩家', ...(project.brief.primaryObjective === 'recall' ? ['主动选择接收召回信息的流失玩家'] : [])],
      primarySellingPoint: primaryPoint.name,
      strategySummary: regionalEvidence.length
        ? `围绕「${primaryPoint.name}」建立${regionLabels[region]}发行表达，并用当前公开证据中的${signals.slice(0, 2).join('、') || '版本体验'}信号校准素材与节奏。`
        : `证据不足：仅执行与版本Brief一致的基础发行必做项，区域差异化动作需先验证。`,
      opportunitySummary: regionalEvidence.length ? `当前公开页面出现 ${signals.join('、') || '可继续观察的版本反馈'}。` : '当前没有足够公开玩家证据支持区域机会判断。',
      riskSummary: coverage === 'insufficient' ? '不得将Brief驱动动作描述为当地玩家偏好；高成本动作必须人工确认。' : '公开证据只代表本次检索到的页面，不代表全部玩家。',
      recommendedChannels: channelsFromEvidence.length ? channelsFromEvidence : regionChannels[region],
      evidenceCoverage: coverage,
      playerSignals: signals,
      evidenceCount: regionalEvidence.length,
      actionIds: [],
      decisionTrace: trace,
    }

    for (const [index, template] of actionTemplates.entries()) {
      const actionTrace = decisionTrace(project, regionalEvidence.slice(0, 4), createdAt, `${template.title}服务于${objectiveLabels[project.brief.primaryObjective]}并使用首要卖点「${primaryPoint.name}」。`)
      const base: Omit<ReleaseAction, 'evaluation'> = {
        id: `${project.id}-${region.toLocaleLowerCase()}-${template.type}-${index + 1}`,
        projectId: project.id,
        region,
        type: template.type,
        title: template.title,
        objective: objectiveLabels[project.brief.primaryObjective],
        sellingPointId: primaryPoint.id,
        audience: plan.audience,
        channels: template.type === 'material' ? ['已审核素材库'] : plan.recommendedChannels,
        stage: template.stage,
        startDay: template.startDay,
        endDay: template.endDay,
        description: template.description,
        dependencies: template.type === 'material' ? primaryPoint.assetIds : template.type === 'paid_media' ? ['区域主叙事素材适配'] : [],
        costLevel: template.cost,
        riskLevel: coverage === 'insufficient' && template.risk === 'low' ? 'medium' : template.risk,
        metrics: metricsFor(template.type),
        decisionTrace: actionTrace,
        status: coverage === 'insufficient' || template.cost === 'high' || template.risk === 'high' ? 'needs_review' : 'draft',
        locked: false,
        requiresApproval: coverage === 'insufficient' || template.cost === 'high' || template.risk === 'high',
      }
      const action = { ...base, evaluation: actionEvaluation(base, coverage) }
      actions.push(action)
      plan.actionIds.push(action.id)
    }

    const eligibility = isCharacterRelationshipEligible(project.brief, records, region)
    if (eligibility.eligible && eligibility.characterPoint) {
      const actionId = `${project.id}-${region.toLocaleLowerCase()}-character-relationship`
      const characterTrace = decisionTrace(project, eligibility.evidence.slice(0, 5), createdAt, '满足角色卖点、区域角色/剧情证据、审核资产和显式创新测试授权。', true)
      const base: Omit<ReleaseAction, 'evaluation'> = {
        id: actionId,
        projectId: project.id,
        region,
        type: 'character_relationship',
        title: `${eligibility.characterPoint.name}关系触达灰度`,
        objective: objectiveLabels[project.brief.primaryObjective],
        sellingPointId: eligibility.characterPoint.id,
        audience: ['主动订阅角色消息的目标玩家', '超过14天未上线且允许接收召回信息的玩家'],
        channels: ['受控消息预演'],
        stage: 'preheat',
        startDay: -4,
        endDay: 3,
        description: '仅在ReHoYo沙盒中生成审核模板与有限个性化预览；不接入真实玩家，不自动发送。',
        dependencies: ['角色设定与审核模板', '主动订阅与退出机制', '人工审批'],
        costLevel: 'medium',
        riskLevel: 'high',
        metrics: metricsFor('character_relationship'),
        decisionTrace: characterTrace,
        status: 'needs_review',
        locked: false,
        requiresApproval: true,
      }
      actions.push({ ...base, evaluation: actionEvaluation(base, coverage) })
      plan.actionIds.push(actionId)
      characterPlans.push({
        actionId,
        character: eligibility.characterPoint.name,
        targetRegion: region,
        targetSegment: base.audience,
        useCase: project.brief.primaryObjective === 'recall' ? 'recall' : 'preheat',
        channel: '受控消息预演',
        timing: '角色PV发布后，版本上线前4日至上线后3日',
        narrativeApproach: `以${eligibility.characterPoint.name}的已审核角色口吻延续版本关系线索，再自然引出新版本内容。`,
        objective: objectiveLabels[project.brief.primaryObjective],
        sellingPoint: eligibility.characterPoint.name,
        scenario: project.brief.primaryObjective === 'recall' ? '版本回归邀请沙盒预演' : '版本预热沙盒预演',
        templateMode: 'bounded_personalization',
        pilotPercentage: 5,
        consentRequired: true,
        optOutEnabled: true,
        reviewRequirements: ['角色监修', '事实校验', '剧透检查', '地区合规复核'],
        risks: ['人设偏差', '剧透', '过度触达', '错误个性化'],
        metrics: metricsFor('character_relationship'),
        expandConditions: ['审核通过率稳定', '主动退出率未上升', '负面反馈未增加'],
        throttleConditions: ['连续不回复', '互动质量下降'],
        stopConditions: ['用户主动退出', '负面反馈升高', '人设一致性不足', '出现错误信息或剧透'],
        contentRules: ['只使用版本Brief中的已确认事实', '角色语气必须通过角色监修', '个性化只允许称呼与内容顺序'],
        forbiddenTopics: ['未公开剧情', '未经确认的奖励与日期', '现实身份推断', '诱导付费表达'],
        frequencyLimit: '沙盒单次预演；真实触达功能未接入',
        status: 'draft',
      })
    }
    regionalPlans.push(plan)
  }

  const globalTrace = decisionTrace(project, records.slice(0, 8), createdAt, `全球主轴由首要发行目标和首要卖点生成，区域表达由真实公开证据校准。`)
  return {
    id: `${project.id}-plan-${Date.parse(createdAt)}`,
    projectId: project.id,
    globalStrategy: {
      primaryObjective: project.brief.primaryObjective,
      axis: `以「${primaryPoint.name}」重新连接全球玩家`,
      unifiedExpression: `所有区域统一说明版本事实与「${primaryPoint.name}」，只在有公开证据支持时调整地区表达。`,
      primarySellingPoint: primaryPoint.name,
      targetAudience: ['当前活跃玩家', ...(project.brief.primaryObjective === 'recall' ? ['明确授权接收召回信息的流失玩家'] : [])],
      globalAssets: project.brief.availableAssets,
      differentiableParts: ['素材切入点', '内容语气', '渠道组合', '发布节奏'],
      risks: ['证据覆盖不均', '区域表达被误读', '高成本动作缺少执行数据'],
      decisionTrace: globalTrace,
    },
    regionalPlans,
    actions,
    characterPlans,
    generatedAt: createdAt,
  }
}

export function lockReleaseAction(action: ReleaseAction, locked: boolean): ReleaseAction {
  return { ...action, locked }
}

function requireCharacterPlan(project: ReleaseProject, actionId: string) {
  const plan = project.currentPlan?.characterPlans.find((item) => item.actionId === actionId)
  if (!plan) throw new Error('未找到可执行的角色发行方案。')
  return plan
}

function updateCharacterExecution(
  project: ReleaseProject,
  actionId: string,
  update: (current: CharacterExecutionState | undefined) => CharacterExecutionState,
  now: Now,
) {
  const current = project.characterExecutions.find((item) => item.actionId === actionId)
  const next = update(current)
  return {
    ...project,
    characterExecutions: [...project.characterExecutions.filter((item) => item.actionId !== actionId), next],
    updatedAt: timestamp(now),
  }
}

function characterEvent(actionId: string, kind: CharacterExecutionEvent['kind'], message: string, occurredAt: string): CharacterExecutionEvent {
  return { id: `${actionId}-${kind}-${Date.parse(occurredAt)}`, actionId, kind, message, sandbox: true, occurredAt }
}

export function createCharacterSandboxDraft(
  project: ReleaseProject,
  actionId: string,
  mode: CharacterContentDraft['mode'],
  now: Now = () => new Date(),
): ReleaseProject {
  const plan = requireCharacterPlan(project, actionId)
  const occurredAt = timestamp(now)
  const body = mode === 'official'
    ? `${project.game} ${project.version}「${project.updateName}」即将上线。查看版本内容与活动说明。`
    : `开拓者，新的旅程快开始了。这次和「${plan.sellingPoint}」有关，我把已公开的版本线索整理好了。要一起看看吗？`
  return updateCharacterExecution(project, actionId, (current) => ({
    actionId,
    status: 'awaiting_review',
    contentDraft: {
      id: `${actionId}-draft-${Date.parse(occurredAt)}`,
      actionId,
      mode,
      body,
      fixedFacts: [project.game, project.version, project.updateName, plan.sellingPoint],
      controllableFields: mode === 'bounded_personalization' ? ['已授权称呼', '内容顺序'] : [],
      status: 'draft',
      createdAt: occurredAt,
    },
    events: [...(current?.events ?? []), characterEvent(actionId, 'content_generated', '已在本地沙盒生成待审内容；未连接外部发送渠道。', occurredAt)],
  }), now)
}

export function approveCharacterSandbox(project: ReleaseProject, actionId: string, now: Now = () => new Date()): ReleaseProject {
  requireCharacterPlan(project, actionId)
  const current = project.characterExecutions.find((item) => item.actionId === actionId)
  if (!current?.contentDraft || current.status !== 'awaiting_review') throw new Error('请先生成并提交待审内容。')
  const occurredAt = timestamp(now)
  return updateCharacterExecution(project, actionId, () => ({
    ...current,
    status: 'approved',
    contentDraft: { ...current.contentDraft!, status: 'approved', approvedAt: occurredAt },
    events: [...current.events, characterEvent(actionId, 'approved', '人工审核已通过；仍仅允许沙盒执行。', occurredAt)],
  }), now)
}

export function startCharacterSandbox(project: ReleaseProject, actionId: string, now: Now = () => new Date()): ReleaseProject {
  requireCharacterPlan(project, actionId)
  const current = project.characterExecutions.find((item) => item.actionId === actionId)
  if (!current || !['approved', 'paused'].includes(current.status)) throw new Error('角色沙盒必须先完成人工审批。')
  const occurredAt = timestamp(now)
  const resumed = current.status === 'paused'
  return updateCharacterExecution(project, actionId, () => ({
    ...current,
    status: 'running',
    events: [...current.events, characterEvent(actionId, resumed ? 'resumed' : 'started', resumed ? '沙盒流程已恢复；无外部接收者。' : '沙盒流程已启动；无外部接收者。', occurredAt)],
  }), now)
}

export function pauseCharacterSandbox(project: ReleaseProject, actionId: string, now: Now = () => new Date()): ReleaseProject {
  const current = project.characterExecutions.find((item) => item.actionId === actionId)
  if (!current || current.status !== 'running') throw new Error('只有运行中的角色沙盒可以暂停。')
  const occurredAt = timestamp(now)
  return updateCharacterExecution(project, actionId, () => ({
    ...current,
    status: 'paused',
    events: [...current.events, characterEvent(actionId, 'paused', '沙盒流程已暂停。', occurredAt)],
  }), now)
}

export function stopCharacterSandbox(project: ReleaseProject, actionId: string, now: Now = () => new Date()): ReleaseProject {
  const current = project.characterExecutions.find((item) => item.actionId === actionId)
  if (!current || !['approved', 'running', 'paused'].includes(current.status)) throw new Error('当前角色沙盒不能停止。')
  const occurredAt = timestamp(now)
  return updateCharacterExecution(project, actionId, () => ({
    ...current,
    status: 'stopped',
    events: [...current.events, characterEvent(actionId, 'stopped', '沙盒流程已停止；没有消息发送到真实玩家。', occurredAt)],
  }), now)
}

export function applyStrategyPatch(actions: ReleaseAction[], patch: StrategyPatch): ReleaseAction[] {
  const targets = new Set(patch.targetIds)
  if (actions.some((action) => targets.has(action.id) && action.locked)) throw new Error('锁定动作不能被Agent自动修改。')
  return actions.map((action) => targets.has(action.id) ? { ...action, ...patch.after } as ReleaseAction : action)
}

export function createPlanVersion(
  projectId: string,
  plan: ReleasePlan,
  versions: PlanVersion[],
  now: Now = () => new Date(),
  status: PlanVersion['status'] = 'draft',
): PlanVersion {
  const createdAt = timestamp(now)
  const draftCount = versions.filter((version) => version.status === 'draft').length
  const version = status === 'approved' ? 'V1.0' : `V0.${draftCount + 1}`
  return {
    id: `${projectId}-${version.toLocaleLowerCase().replace('.', '-')}-${Date.parse(createdAt)}`,
    projectId,
    version,
    plan,
    changeSummary: status === 'approved' ? '人工确认当前发行方案。' : '根据版本Brief与当前真实公开证据生成初版发行方案。',
    status,
    createdAt,
  }
}
