import type {
  AgentDefinition,
  AnalysisPreset,
  InsightReport,
  RegionCode,
} from '../domain/types'

const researchSources = ['Reddit RSS', 'Niconico Snapshot', 'BigModel Web Search']

function buildAgents(durationMs: number): AgentDefinition[] {
  return [
    {
      id: 'research',
      name: '社区研究 Agent',
      englishName: 'COMMUNITY RESEARCH',
      objective: '实时检索公开网页与公开搜索接口，只接收带可验证 URL 的来源记录。',
      startOffsetMs: 0,
      endOffsetMs: Math.round(durationMs * 0.42),
      sources: researchSources,
      outputs: ['真实来源 URL', '原始页面摘录', '检索时间'],
    },
    {
      id: 'sentiment',
      name: '玩家情绪 Agent',
      englishName: 'SENTIMENT ANALYSIS',
      objective: '只对社区研究 Agent 本次检索到的原始证据进行逐条分类与释义。',
      startOffsetMs: Math.round(durationMs * 0.38),
      endOffsetMs: Math.round(durationMs * 0.7),
      sources: ['社区研究真实证据'],
      outputs: ['逐条情绪', '忠实中文释义', '原因主题'],
    },
    {
      id: 'regional',
      name: '地区差异 Agent',
      englishName: 'REGIONAL ANALYSIS',
      objective: '比较本次检索证据中的中国、日本和欧美关注点，并标明证据缺口。',
      startOffsetMs: Math.round(durationMs * 0.38),
      endOffsetMs: Math.round(durationMs * 0.72),
      sources: ['分地区真实证据'],
      outputs: ['地区矩阵', '证据缺口', '文化语境'],
    },
    {
      id: 'strategy',
      name: '策略建议 Agent',
      englishName: 'STRATEGY SYNTHESIS',
      objective: '等待上游完成，只生成带有效证据编号的风险与建议。',
      startOffsetMs: Math.round(durationMs * 0.7),
      endOffsetMs: durationMs,
      sources: ['三个上游 Agent 的真实证据输出'],
      outputs: ['争议风险', '优先级建议', '证据引用'],
    },
  ]
}

function emptyReport(): InsightReport {
  return {
    summary: '尚未运行真实公开网络研究。没有可验证来源时，ReHoYo 不生成玩家结论。',
    sentimentScore: 0,
    riskLevel: 'low',
    sampleCount: 0,
    positivePercent: 0,
    negativePercent: 0,
    neutralPercent: 0,
    trend: [],
    regions: [],
    keywords: [],
    controversies: [],
    recommendations: [],
  }
}

function createResearchTarget(
  id: string,
  game: AnalysisPreset['game'],
  version: AnalysisPreset['version'],
  isGeneric = false,
): AnalysisPreset {
  const durationMs = 120_000
  return {
    id,
    dataMode: 'live',
    game,
    version,
    durationMs,
    regions: ['CN', 'JP', 'WEST'],
    sources: researchSources,
    agents: buildAgents(durationMs),
    events: [],
    evidence: [],
    report: emptyReport(),
    advisorAnswers: [],
    isGeneric,
  }
}

export const analysisPresets: AnalysisPreset[] = [
  createResearchTarget(
    'genshin-5-0',
    { id: 'genshin', name: '原神', shortName: 'GI', accent: '#278fb9' },
    { id: '5-0', label: '5.0', title: '荣花与炎日之途' },
  ),
  createResearchTarget(
    'star-rail-2-0',
    { id: 'star-rail', name: '崩坏：星穹铁道', shortName: 'HSR', accent: '#7868c7' },
    { id: '2-0', label: '2.0', title: '假如在午夜入梦' },
  ),
  createResearchTarget(
    'zzz-1-1',
    { id: 'zzz', name: '绝区零', shortName: 'ZZZ', accent: '#617d21' },
    { id: '1-1', label: '1.1', title: '卧底蓝调' },
  ),
]

export function getPresetById(id: string): AnalysisPreset | undefined {
  return analysisPresets.find((preset) => preset.id === id)
}

export function createCustomPreset(gameName: string, updateTitle: string): AnalysisPreset {
  const normalizedName = gameName.trim() || '自定义游戏'
  const normalizedUpdate = updateTitle.trim() || '自定义版本更新'
  return createResearchTarget(
    `custom-${encodeURIComponent(normalizedName)}-${encodeURIComponent(normalizedUpdate)}`,
    { id: 'custom', name: normalizedName, shortName: 'CUSTOM', accent: '#278fb9' },
    { id: 'custom', label: 'CUSTOM', title: normalizedUpdate },
    true,
  )
}

export const regionLabels: Record<Exclude<RegionCode, 'GLOBAL'>, string> = {
  CN: '中国',
  JP: '日本',
  WEST: '欧美',
}
