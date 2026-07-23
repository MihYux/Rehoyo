import type {
  AdvisorAnswer,
  AgentDefinition,
  AnalysisEvent,
  AnalysisPreset,
  EvidenceRecord,
  InsightReport,
  RegionCode,
  Sentiment,
} from '../domain/types'

interface EvidenceSeed {
  id: string
  source: string
  sourceType: EvidenceRecord['sourceType']
  region: EvidenceRecord['region']
  language: EvidenceRecord['language']
  author: string
  original: string
  zh: string
  sentiment: Sentiment
  topics: string[]
  confidence: number
  engagement: number
}

interface PresetSeed {
  id: string
  game: AnalysisPreset['game']
  version: AnalysisPreset['version']
  durationMs: number
  sampleCount: number
  sentimentScore: number
  riskLevel: InsightReport['riskLevel']
  percentages: [number, number, number]
  summary: string
  evidence: EvidenceSeed[]
  regions: InsightReport['regions']
  keywords: InsightReport['keywords']
  controversies: InsightReport['controversies']
  recommendations: InsightReport['recommendations']
  advisor: Omit<AdvisorAnswer, 'id'>[]
  discoveries: [string, string, string, string]
}

const sourceList = ['Reddit', 'YouTube', 'Bilibili', '米游社', 'HoYoLAB', 'App Store']

function buildAgents(durationMs: number): AgentDefinition[] {
  return [
    {
      id: 'research',
      name: '社区研究 Agent',
      englishName: 'COMMUNITY RESEARCH',
      objective: '追踪公开讨论源、传播路径与最早出现的问题信号。',
      startOffsetMs: 0,
      endOffsetMs: 20_500,
      sources: sourceList,
      outputs: ['来源覆盖', '传播轨迹', '关键证据'],
    },
    {
      id: 'sentiment',
      name: '玩家情绪 Agent',
      englishName: 'SENTIMENT ANALYSIS',
      objective: '识别情绪方向、成因主题与观点强度。',
      startOffsetMs: 9_000,
      endOffsetMs: 28_000,
      sources: ['社区研究证据流'],
      outputs: ['情绪分类', '原因簇', '置信度'],
    },
    {
      id: 'regional',
      name: '地区差异 Agent',
      englishName: 'REGIONAL ANALYSIS',
      objective: '比较中国、日本与欧美玩家的关注点和语义差异。',
      startOffsetMs: 16_000,
      endOffsetMs: 34_000,
      sources: ['多语评论', '地区情绪簇'],
      outputs: ['地区矩阵', '文化差异', '本地化风险'],
    },
    {
      id: 'strategy',
      name: '策略建议 Agent',
      englishName: 'STRATEGY SYNTHESIS',
      objective: '把证据与地区差异转化为可执行的版本和运营建议。',
      startOffsetMs: 32_000,
      endOffsetMs: durationMs,
      sources: ['前三个 Agent 的完整报告'],
      outputs: ['风险优先级', '版本建议', '地区策略'],
    },
  ]
}

function buildEvents(seed: PresetSeed): AnalysisEvent[] {
  const evidenceIds = seed.evidence.map((item) => item.id)
  const event = (
    suffix: string,
    offsetMs: number,
    agentId: AnalysisEvent['agentId'],
    phase: AnalysisEvent['phase'],
    kind: AnalysisEvent['kind'],
    message: string,
    progress: number,
    refs: string[] = [],
    extras: Partial<AnalysisEvent> = {},
  ): AnalysisEvent => ({
    id: `${seed.id}-${suffix}`,
    offsetMs,
    agentId,
    phase,
    kind,
    message,
    evidenceIds: refs,
    progress,
    ...extras,
  })

  return [
    event('01', 0, 'research', 'research', 'status', '社区研究 Agent 已启动全球公开讨论扫描', 4),
    event('02', 2_600, 'research', 'research', 'source', '接入 Reddit、YouTube 与 HoYoLAB 讨论快照', 16, evidenceIds.slice(6, 8), { source: 'Reddit · YouTube', region: 'WEST' }),
    event('03', 5_400, 'research', 'research', 'source', '发现 Bilibili 与米游社高互动话题簇', 31, evidenceIds.slice(0, 2), { source: 'Bilibili · 米游社', region: 'CN' }),
    event('04', 8_200, 'research', 'research', 'finding', seed.discoveries[0], 45, [evidenceIds[0], evidenceIds[6]], { severity: 'medium' }),
    event('05', 9_000, 'sentiment', 'sentiment', 'status', '玩家情绪 Agent 开始分类观点与成因', 8),
    event('06', 12_600, 'sentiment', 'sentiment', 'finding', seed.discoveries[1], 33, [evidenceIds[1], evidenceIds[7]]),
    event('07', 16_000, 'regional', 'regional', 'status', '地区差异 Agent 开始对齐中、日、英语义簇', 8),
    event('08', 18_800, 'research', 'research', 'source', '补充日本 YouTube 与 App Store 代表观点', 78, evidenceIds.slice(3, 6), { source: 'YouTube · App Store', region: 'JP' }),
    event('09', 20_500, 'research', 'research', 'handoff', `社区样本扫描完成，共汇总 ${seed.sampleCount.toLocaleString('zh-CN')} 条公开讨论快照`, 100, evidenceIds),
    event('10', 24_300, 'sentiment', 'sentiment', 'finding', seed.discoveries[2], 76, [evidenceIds[2], evidenceIds[5], evidenceIds[8]]),
    event('11', 28_000, 'sentiment', 'sentiment', 'handoff', '情绪分类完成，已生成原因簇与置信度', 100, evidenceIds),
    event('12', 30_400, 'regional', 'regional', 'finding', seed.discoveries[3], 82, [evidenceIds[1], evidenceIds[4], evidenceIds[7]], { severity: seed.riskLevel }),
    event('13', 34_000, 'regional', 'regional', 'handoff', '地区差异矩阵完成，交付策略 Agent', 100, evidenceIds),
    event('14', 34_200, 'strategy', 'strategy', 'status', '策略 Agent 正在综合证据、风险与地区差异', 18),
    event('15', seed.durationMs - 3_600, 'strategy', 'strategy', 'finding', '已形成版本、传播与本地化三层建议', 72, seed.recommendations.flatMap((item) => item.evidenceIds)),
    event('16', seed.durationMs, 'strategy', 'complete', 'complete', '全球玩家洞察报告已生成', 100, evidenceIds),
  ]
}

function buildPreset(seed: PresetSeed): AnalysisPreset {
  const evidence: EvidenceRecord[] = seed.evidence.map((item, index) => ({
    id: item.id,
    source: item.source,
    sourceType: item.sourceType,
    region: item.region,
    language: item.language,
    author: item.author,
    excerptOriginal: item.original,
    excerptZh: item.zh,
    sentiment: item.sentiment,
    topics: item.topics,
    confidence: item.confidence,
    engagement: item.engagement,
    publishedLabel: `${index + 1} 天前`,
    synthetic: true,
  }))
  const [positivePercent, neutralPercent, negativePercent] = seed.percentages

  return {
    id: seed.id,
    game: seed.game,
    version: seed.version,
    durationMs: seed.durationMs,
    regions: ['CN', 'JP', 'WEST'],
    sources: sourceList,
    agents: buildAgents(seed.durationMs),
    events: buildEvents(seed),
    evidence,
    report: {
      summary: seed.summary,
      sentimentScore: seed.sentimentScore,
      riskLevel: seed.riskLevel,
      sampleCount: seed.sampleCount,
      positivePercent,
      neutralPercent,
      negativePercent,
      trend: [
        { label: 'D-3', positive: positivePercent - 6, neutral: neutralPercent + 2, negative: negativePercent + 4 },
        { label: 'D-2', positive: positivePercent - 3, neutral: neutralPercent + 1, negative: negativePercent + 2 },
        { label: 'D-1', positive: positivePercent, neutral: neutralPercent, negative: negativePercent },
        { label: 'D+1', positive: positivePercent + 5, neutral: neutralPercent - 2, negative: negativePercent - 3 },
        { label: 'D+3', positive: positivePercent + 2, neutral: neutralPercent - 1, negative: negativePercent - 1 },
        { label: 'D+7', positive: positivePercent, neutral: neutralPercent, negative: negativePercent },
      ],
      regions: seed.regions,
      keywords: seed.keywords,
      controversies: seed.controversies,
      recommendations: seed.recommendations,
    },
    advisorAnswers: seed.advisor.map((answer, index) => ({ ...answer, id: `${seed.id}-advisor-${index + 1}` })),
  }
}

const genshin = buildPreset({
  id: 'genshin-5-0',
  game: { id: 'genshin', name: '原神', shortName: 'GI', accent: '#67d8f2' },
  version: { id: '5-0', label: '5.0', title: '荣花与炎日之途' },
  durationMs: 42_000,
  sampleCount: 1_284,
  sentimentScore: 74,
  riskLevel: 'high',
  percentages: [62, 15, 23],
  summary: '探索体验获得全球认可，但角色价值表达与跨语言剧情语义正在形成地区分化。下一版本应同步优化培养预期、角色故事展示和本地化审校。',
  evidence: [
    { id: 'gi-cn-01', source: 'Bilibili', sourceType: 'video', region: 'CN', language: 'zh-CN', author: '旅行者_042', original: '新地图探索非常顺，但新角色的培养材料和配队成本比预想高。', zh: '新地图探索非常顺，但新角色的培养材料和配队成本比预想高。', sentiment: 'negative', topics: ['培养成本', '角色价值'], confidence: 0.94, engagement: 842 },
    { id: 'gi-cn-02', source: '米游社', sourceType: 'community', region: 'CN', language: 'zh-CN', author: '风之翼研究员', original: '奖励改善能感受到诚意，真正决定抽不抽的还是强度和泛用性。', zh: '奖励改善受到肯定，但抽取决策仍由强度和泛用性主导。', sentiment: 'neutral', topics: ['版本奖励', '抽卡价值'], confidence: 0.91, engagement: 615 },
    { id: 'gi-cn-03', source: 'Bilibili', sourceType: 'video', region: 'CN', language: 'zh-CN', author: '深境观察站', original: '角色机制有想法，不过宣传演示没有讲清楚实际循环。', zh: '玩家认可机制创意，但认为宣传未准确解释实战循环。', sentiment: 'negative', topics: ['宣传预期', '战斗机制'], confidence: 0.88, engagement: 429 },
    { id: 'gi-jp-01', source: 'YouTube', sourceType: 'video', region: 'JP', language: 'ja-JP', author: 'Aoi_T', original: '音楽と景色は本当に素晴らしい。キャラクターの旅をもっと見たかった。', zh: '音乐与景色非常出色，但希望看到更多角色旅程与个人故事。', sentiment: 'positive', topics: ['音乐', '角色塑造'], confidence: 0.93, engagement: 511 },
    { id: 'gi-jp-02', source: 'HoYoLAB', sourceType: 'community', region: 'JP', language: 'ja-JP', author: '旅人ミナ', original: '声の演技は好きですが、二人の関係が少し急に見えました。', zh: '喜欢声优表现，但角色关系的发展显得略为突然。', sentiment: 'neutral', topics: ['声优表现', '角色关系'], confidence: 0.9, engagement: 274 },
    { id: 'gi-jp-03', source: 'App Store', sourceType: 'store', region: 'JP', language: 'ja-JP', author: '匿名レビュー', original: '新しい地域は楽しいが、一部の用語が会話の流れを止める。', zh: '新地区很有趣，但部分术语影响了对话节奏。', sentiment: 'negative', topics: ['本地化', '剧情节奏'], confidence: 0.86, engagement: 188 },
    { id: 'gi-west-01', source: 'Reddit', sourceType: 'forum', region: 'WEST', language: 'en-US', author: 'WorldQuestArchive', original: 'The region is a joy to move through, but the main quest front-loads too many new terms.', zh: '地区探索令人愉快，但主线前段一次引入了太多新术语。', sentiment: 'neutral', topics: ['世界探索', '剧情节奏'], confidence: 0.95, engagement: 973 },
    { id: 'gi-west-02', source: 'YouTube', sourceType: 'video', region: 'WEST', language: 'en-US', author: 'AetherScope', original: 'The trailer sold a very different combat fantasy from the rotation we actually got.', zh: '宣传片传达的战斗想象与实际上手循环存在偏差。', sentiment: 'negative', topics: ['宣传预期', '战斗机制'], confidence: 0.92, engagement: 744 },
    { id: 'gi-west-03', source: 'Reddit', sourceType: 'forum', region: 'WEST', language: 'en-US', author: 'Loreline', original: 'The worldbuilding is strong. Give the cast more quiet scenes and it will land harder.', zh: '世界观很强，如果为角色增加更多安静的相处场景，情感落点会更好。', sentiment: 'positive', topics: ['世界观', '角色塑造'], confidence: 0.89, engagement: 536 },
  ],
  regions: [
    { region: 'CN', label: '中国', sentimentScore: 68, sampleCount: 482, topConcern: '抽卡价值', secondaryConcern: '培养成本', insight: '正面评价集中在探索和奖励，但角色强度与投入回报直接决定口碑。' },
    { region: 'JP', label: '日本', sentimentScore: 79, sampleCount: 316, topConcern: '角色塑造', secondaryConcern: '声优表现', insight: '审美与演出评价最高，角色关系铺垫不足是主要遗憾。' },
    { region: 'WEST', label: '欧美', sentimentScore: 72, sampleCount: 486, topConcern: '剧情节奏', secondaryConcern: '世界观', insight: '探索获得高度认可，但术语密度和宣传预期差异放大负面讨论。' },
  ],
  keywords: [
    { label: '探索体验', weight: 96, sentiment: 'positive' }, { label: '角色强度', weight: 88, sentiment: 'negative' },
    { label: '剧情节奏', weight: 81, sentiment: 'neutral' }, { label: '声优表现', weight: 70, sentiment: 'positive' },
    { label: '培养成本', weight: 78, sentiment: 'negative' }, { label: '世界观', weight: 74, sentiment: 'positive' },
    { label: '宣传预期', weight: 68, sentiment: 'negative' }, { label: '版本奖励', weight: 61, sentiment: 'positive' },
  ],
  controversies: [
    { id: 'gi-c1', title: '宣传与实战循环预期错位', description: '英文视频讨论率在 24 小时内快速上升，并回流到中文强度讨论。', severity: 'high', region: 'GLOBAL', evidenceIds: ['gi-cn-03', 'gi-west-02'], propagation: 'YouTube → Reddit → Bilibili' },
    { id: 'gi-c2', title: '角色价值被培养成本稀释', description: '中国玩家对资源投入和泛用性更加敏感。', severity: 'medium', region: 'CN', evidenceIds: ['gi-cn-01', 'gi-cn-02'], propagation: '米游社 → Bilibili' },
    { id: 'gi-c3', title: '多语术语影响剧情理解', description: '日英玩家均提到新术语密度打断叙事节奏。', severity: 'medium', region: 'GLOBAL', evidenceIds: ['gi-jp-03', 'gi-west-01'], propagation: 'App Store ↔ Reddit' },
  ],
  recommendations: [
    { id: 'gi-r1', priority: 'P0', title: '重写角色机制传播材料', action: '用完整实战循环和真实队伍成本替代单段爆发演示。', rationale: '减少宣传与体验落差，阻断跨平台负面传播。', region: 'GLOBAL', evidenceIds: ['gi-cn-03', 'gi-west-02'] },
    { id: 'gi-r2', priority: 'P1', title: '提前展示培养路径', action: '在前瞻中公开材料来源、养成周期和低成本替代方案。', rationale: '直接回应中国市场对抽卡价值与资源回报的关注。', region: 'CN', evidenceIds: ['gi-cn-01', 'gi-cn-02'] },
    { id: 'gi-r3', priority: 'P1', title: '增加角色关系短篇', action: '为日本与欧美渠道分别突出声优互动和世界观关联。', rationale: '把审美好感转化为更稳定的情感连接。', region: 'GLOBAL', evidenceIds: ['gi-jp-01', 'gi-jp-02', 'gi-west-03'] },
  ],
  advisor: [
    { question: '为什么欧美玩家不喜欢这个角色？', matchers: ['欧美', '不喜欢', '角色'], answer: '欧美玩家并非整体排斥角色设计。主要负面来自宣传呈现的战斗想象与实际上手循环不一致，其次是主线前段术语密度削弱了角色首次亮相的情感落点。', evidenceIds: ['gi-west-01', 'gi-west-02', 'gi-west-03'], reportTab: 'regions' },
    { question: '为什么日本和中国玩家评价不同？', matchers: ['日本', '中国', '不同', '差异'], answer: '中国讨论更快落到强度、泛用性和培养成本；日本讨论则持续关注声优表现、角色关系和情感铺垫。因此同一角色会出现“价值不足”和“塑造不够”两种不同批评。', evidenceIds: ['gi-cn-01', 'gi-cn-02', 'gi-jp-01', 'gi-jp-02'], reportTab: 'regions' },
    { question: '下一版本应该避免什么问题？', matchers: ['下一版本', '避免', '问题'], answer: '优先避免三件事：用理想化片段制造战斗预期、在前瞻中隐藏真实培养成本、让多语术语在短时间密集出现。三者都会让初始好感快速转成可传播的失望。', evidenceIds: ['gi-cn-03', 'gi-jp-03', 'gi-west-02'], reportTab: 'strategy' },
    { question: '这个争议会影响未来版本吗？', matchers: ['争议', '未来', '影响'], answer: '如果后续角色继续采用同类宣传方式，预期错位会形成可复用的负面叙事模板；当前风险为高，但通过实战透明度和上线前审校可以显著降低。', evidenceIds: ['gi-cn-03', 'gi-west-02'], reportTab: 'controversies' },
  ],
  discoveries: ['角色实战预期错位话题开始跨平台传播', '正面探索反馈与负面角色价值评价同时上升', '负面情绪主要由成本和预期差异驱动，而非美术设计', '日英文本对新术语的理解成本显著高于中文'],
})

const starRail = buildPreset({
  id: 'hsr-2-0',
  game: { id: 'hsr', name: '崩坏：星穹铁道', shortName: 'HSR', accent: '#c8ad72' },
  version: { id: '2-0', label: '2.0', title: '假如在午夜入梦' },
  durationMs: 40_000,
  sampleCount: 1_512,
  sentimentScore: 82,
  riskLevel: 'medium',
  percentages: [71, 13, 16],
  summary: '匹诺康尼的视觉、音乐与世界观形成强烈正面共识，但信息密度和部分本地化表达让不同地区对剧情可读性产生分化。',
  evidence: [
    { id: 'hsr-cn-01', source: 'Bilibili', sourceType: 'video', region: 'CN', language: 'zh-CN', author: '列车智库', original: '演出规格拉满，但第一章塞入的名词太多，需要反复看对话。', zh: '演出受到高度认可，但首章名词密度增加理解成本。', sentiment: 'neutral', topics: ['剧情节奏', '演出'], confidence: 0.95, engagement: 1042 },
    { id: 'hsr-cn-02', source: '米游社', sourceType: 'community', region: 'CN', language: 'zh-CN', author: '模拟宇宙观察员', original: '角色机制很完整，不过连续限定角色让资源规划压力明显。', zh: '认可角色机制，但对连续限定角色的资源压力感到担忧。', sentiment: 'negative', topics: ['抽卡价值', '资源规划'], confidence: 0.92, engagement: 684 },
    { id: 'hsr-cn-03', source: 'HoYoLAB', sourceType: 'community', region: 'CN', language: 'zh-CN', author: '梦境访客', original: '支线把城市气质补得很好，希望主线也能给人物更多停顿。', zh: '支线塑造城市氛围出色，希望主线给予人物更多呼吸空间。', sentiment: 'positive', topics: ['世界观', '角色塑造'], confidence: 0.89, engagement: 443 },
    { id: 'hsr-jp-01', source: 'YouTube', sourceType: 'video', region: 'JP', language: 'ja-JP', author: '星の旅人', original: '音楽と声優の演技で夢の世界に入った感覚が強い。', zh: '音乐与声优演出带来了很强的梦境沉浸感。', sentiment: 'positive', topics: ['音乐', '声优表现'], confidence: 0.96, engagement: 812 },
    { id: 'hsr-jp-02', source: 'HoYoLAB', sourceType: 'community', region: 'JP', language: 'ja-JP', author: 'NanashiRail', original: '人物同士の距離感が魅力的。説明は少し長く感じる。', zh: '角色关系很有魅力，但部分说明段落偏长。', sentiment: 'positive', topics: ['角色关系', '剧情节奏'], confidence: 0.91, engagement: 525 },
    { id: 'hsr-jp-03', source: 'App Store', sourceType: 'store', region: 'JP', language: 'ja-JP', author: '匿名開拓者', original: '固有名詞の訳が場面ごとに少し分かりにくい。', zh: '专有名词的译法在不同场景中略难理解。', sentiment: 'negative', topics: ['本地化', '专有名词'], confidence: 0.87, engagement: 207 },
    { id: 'hsr-west-01', source: 'Reddit', sourceType: 'forum', region: 'WEST', language: 'en-US', author: 'ClockworkTheory', original: 'Penacony looks incredible, but the exposition asks you to memorize a glossary before caring.', zh: '匹诺康尼视觉惊艳，但大量设定说明让玩家先记术语、后建立情感。', sentiment: 'neutral', topics: ['世界观', '信息密度'], confidence: 0.95, engagement: 1326 },
    { id: 'hsr-west-02', source: 'YouTube', sourceType: 'video', region: 'WEST', language: 'en-US', author: 'AstralFrame', original: 'The soundtrack carries every reveal. The character chemistry is the real hook.', zh: '音乐强化了每次揭示，角色之间的化学反应才是真正吸引点。', sentiment: 'positive', topics: ['音乐', '角色关系'], confidence: 0.93, engagement: 977 },
    { id: 'hsr-west-03', source: 'Reddit', sourceType: 'forum', region: 'WEST', language: 'en-US', author: 'TurnBasedRoom', original: 'Great launch, though the banner cadence makes it hard to plan without spoilers.', zh: '版本上线质量很高，但卡池节奏让玩家难以在不接触剧透的情况下规划。', sentiment: 'negative', topics: ['抽卡价值', '信息策略'], confidence: 0.9, engagement: 691 },
  ],
  regions: [
    { region: 'CN', label: '中国', sentimentScore: 78, sampleCount: 530, topConcern: '资源规划', secondaryConcern: '信息密度', insight: '演出评价很高，但连续卡池与复杂叙事让规划压力成为主要负面来源。' },
    { region: 'JP', label: '日本', sentimentScore: 87, sampleCount: 361, topConcern: '声优表现', secondaryConcern: '角色关系', insight: '情感演出形成最强正面口碑，本地化术语是少数持续问题。' },
    { region: 'WEST', label: '欧美', sentimentScore: 81, sampleCount: 621, topConcern: '世界观', secondaryConcern: '剧情可读性', insight: '世界观获得高度认可，但解释性文本过多削弱首次体验。' },
  ],
  keywords: [
    { label: '匹诺康尼', weight: 98, sentiment: 'positive' }, { label: '音乐演出', weight: 92, sentiment: 'positive' },
    { label: '信息密度', weight: 83, sentiment: 'negative' }, { label: '角色关系', weight: 81, sentiment: 'positive' },
    { label: '资源规划', weight: 69, sentiment: 'negative' }, { label: '梦境世界', weight: 78, sentiment: 'positive' },
    { label: '专有名词', weight: 62, sentiment: 'negative' }, { label: '声优表现', weight: 74, sentiment: 'positive' },
  ],
  controversies: [
    { id: 'hsr-c1', title: '叙事信息密度压过情感建立', description: '中英文社区都认可世界观，但对前段解释量形成一致批评。', severity: 'medium', region: 'GLOBAL', evidenceIds: ['hsr-cn-01', 'hsr-west-01'], propagation: 'Reddit ↔ Bilibili' },
    { id: 'hsr-c2', title: '卡池节奏增加规划压力', description: '中国与欧美玩家把资源压力与剧透风险联系起来。', severity: 'medium', region: 'GLOBAL', evidenceIds: ['hsr-cn-02', 'hsr-west-03'], propagation: '米游社 → Reddit' },
    { id: 'hsr-c3', title: '日语专有名词理解偏差', description: '部分术语缺少上下文辅助，影响剧情顺滑度。', severity: 'low', region: 'JP', evidenceIds: ['hsr-jp-03'], propagation: 'App Store → HoYoLAB' },
  ],
  recommendations: [
    { id: 'hsr-r1', priority: 'P0', title: '降低首章术语并发量', action: '把可延后解释的设定移入可选资料页，用角色行动承担核心信息。', rationale: '保持世界观深度，同时让玩家先建立情感目标。', region: 'GLOBAL', evidenceIds: ['hsr-cn-01', 'hsr-west-01'] },
    { id: 'hsr-r2', priority: 'P1', title: '为地区传播重排卖点', action: '日本突出声优与关系，欧美突出谜团和世界观，中国同步提供资源规划信息。', rationale: '三个地区的正面驱动因素明显不同。', region: 'GLOBAL', evidenceIds: ['hsr-cn-02', 'hsr-jp-01', 'hsr-west-02'] },
    { id: 'hsr-r3', priority: 'P2', title: '建立多语术语一致性审校', action: '在主线发布前用场景化对话测试专有名词的可理解性。', rationale: '低频问题具有跨章节累积风险。', region: 'JP', evidenceIds: ['hsr-jp-03'] },
  ],
  advisor: [
    { question: '为什么欧美玩家觉得剧情难懂？', matchers: ['欧美', '剧情', '难懂'], answer: '他们高度认可世界观，但认为首章要求先记住大量专有名词，角色动机和情感目标因此出现得太晚。问题不是设定复杂，而是信息出现顺序。', evidenceIds: ['hsr-west-01', 'hsr-west-02'], reportTab: 'regions' },
    { question: '日本玩家最喜欢什么？', matchers: ['日本', '喜欢'], answer: '日本样本中音乐、声优表现和角色关系构成最强正面簇。相比机制信息，玩家更愿意围绕角色之间的距离感持续讨论。', evidenceIds: ['hsr-jp-01', 'hsr-jp-02'], reportTab: 'regions' },
    { question: '下一版本应该避免什么问题？', matchers: ['下一版本', '避免', '问题'], answer: '避免在版本开场同时投放过多术语、阵营和卡池决策信息。先建立角色目标，再逐步开放设定与资源规划信息。', evidenceIds: ['hsr-cn-01', 'hsr-cn-02', 'hsr-west-01'], reportTab: 'strategy' },
    { question: '这个争议会影响未来版本吗？', matchers: ['争议', '未来', '影响'], answer: '当前风险为中等。若术语密度持续累积，老玩家尚可适应，新玩家进入成本会在后续版本显著上升。', evidenceIds: ['hsr-jp-03', 'hsr-west-01'], reportTab: 'controversies' },
  ],
  discoveries: ['世界观正面讨论快速增长，同时出现“先记词典”的反向叙事', '强正面情绪主要由音乐、演出和角色关系驱动', '负面情绪并非剧情方向，而是信息出现顺序与资源压力', '日语专有名词缺少场景上下文，理解成本高于中英样本'],
})

const zzz = buildPreset({
  id: 'zzz-1-1',
  game: { id: 'zzz', name: '绝区零', shortName: 'ZZZ', accent: '#d8f35a' },
  version: { id: '1-1', label: '1.1', title: '卧底蓝调' },
  durationMs: 38_000,
  sampleCount: 986,
  sentimentScore: 69,
  riskLevel: 'high',
  percentages: [58, 13, 29],
  summary: '角色表现与战斗手感形成明显拉力，但任务节奏和玩法切换让欧美负面情绪扩散更快。应优先澄清核心玩法节奏，并按地区调整角色传播重点。',
  evidence: [
    { id: 'zzz-cn-01', source: 'Bilibili', sourceType: 'video', region: 'CN', language: 'zh-CN', author: '新艾利都日报', original: '角色演出很抓人，但调查段落还是会把战斗节奏切碎。', zh: '角色演出吸引力强，但调查段落打断战斗节奏。', sentiment: 'neutral', topics: ['角色演出', '玩法节奏'], confidence: 0.95, engagement: 978 },
    { id: 'zzz-cn-02', source: '米游社', sourceType: 'community', region: 'CN', language: 'zh-CN', author: '绳匠作战室', original: '操作手感比首发更稳，资源和队伍需求需要讲得更早。', zh: '操作改进受到认可，但资源与队伍需求披露偏晚。', sentiment: 'positive', topics: ['战斗手感', '资源规划'], confidence: 0.91, engagement: 566 },
    { id: 'zzz-cn-03', source: 'Bilibili', sourceType: 'video', region: 'CN', language: 'zh-CN', author: '空洞研究社', original: '宣传全是角色魅力，实际版本大量时间花在重复流程。', zh: '角色宣传很强，但实际版本中的重复流程造成预期落差。', sentiment: 'negative', topics: ['宣传预期', '重复流程'], confidence: 0.93, engagement: 712 },
    { id: 'zzz-jp-01', source: 'YouTube', sourceType: 'video', region: 'JP', language: 'ja-JP', author: 'NewEridu_FM', original: 'キャラクターの表情と声の演技が映画のようで好き。', zh: '角色表情与声优演出像电影一样，令人喜欢。', sentiment: 'positive', topics: ['角色演出', '声优表现'], confidence: 0.96, engagement: 834 },
    { id: 'zzz-jp-02', source: 'HoYoLAB', sourceType: 'community', region: 'JP', language: 'ja-JP', author: 'プロキシK', original: '二人の駆け引きが面白い。戦闘まで少し長い。', zh: '角色之间的心理博弈很有趣，但进入战斗前的流程偏长。', sentiment: 'positive', topics: ['角色关系', '玩法节奏'], confidence: 0.92, engagement: 487 },
    { id: 'zzz-jp-03', source: 'App Store', sourceType: 'store', region: 'JP', language: 'ja-JP', author: '匿名プロキシ', original: 'UIは魅力的だが、小さい文字が読みづらい場面がある。', zh: '界面很有魅力，但部分场景的小字号影响阅读。', sentiment: 'negative', topics: ['界面可读性', '无障碍'], confidence: 0.88, engagement: 199 },
    { id: 'zzz-west-01', source: 'Reddit', sourceType: 'forum', region: 'WEST', language: 'en-US', author: 'HollowDive', original: 'The combat is excellent. I just spend too much time waiting to get back to it.', zh: '战斗非常优秀，但返回战斗前的等待时间过长。', sentiment: 'negative', topics: ['战斗手感', '玩法节奏'], confidence: 0.97, engagement: 1488 },
    { id: 'zzz-west-02', source: 'YouTube', sourceType: 'video', region: 'WEST', language: 'en-US', author: 'NeonFrame', original: 'The character direction is top tier and the animation sells every personality beat.', zh: '角色导演和动画表现出色，每个性格细节都很有说服力。', sentiment: 'positive', topics: ['角色塑造', '动画演出'], confidence: 0.95, engagement: 1102 },
    { id: 'zzz-west-03', source: 'Reddit', sourceType: 'forum', region: 'WEST', language: 'en-US', author: 'InputWindow', original: 'The stylish UI needs better readability options if the game wants longer sessions.', zh: '风格化界面需要更好的可读性选项，才能支撑长时间游玩。', sentiment: 'negative', topics: ['界面可读性', '无障碍'], confidence: 0.91, engagement: 604 },
  ],
  regions: [
    { region: 'CN', label: '中国', sentimentScore: 66, sampleCount: 353, topConcern: '玩法节奏', secondaryConcern: '资源规划', insight: '角色与操作获得认可，但重复流程和资源披露不足压低整体评价。' },
    { region: 'JP', label: '日本', sentimentScore: 78, sampleCount: 268, topConcern: '角色演出', secondaryConcern: '声优表现', insight: '角色关系和表演形成最强正面情绪，流程长度影响相对较小。' },
    { region: 'WEST', label: '欧美', sentimentScore: 63, sampleCount: 365, topConcern: '战斗节奏', secondaryConcern: '界面可读性', insight: '战斗本身评价极高，但非战斗流程与可读性问题传播最快。' },
  ],
  keywords: [
    { label: '战斗手感', weight: 98, sentiment: 'positive' }, { label: '玩法节奏', weight: 94, sentiment: 'negative' },
    { label: '角色演出', weight: 90, sentiment: 'positive' }, { label: '重复流程', weight: 79, sentiment: 'negative' },
    { label: '声优表现', weight: 72, sentiment: 'positive' }, { label: '界面可读性', weight: 67, sentiment: 'negative' },
    { label: '动画风格', weight: 76, sentiment: 'positive' }, { label: '资源规划', weight: 58, sentiment: 'neutral' },
  ],
  controversies: [
    { id: 'zzz-c1', title: '核心战斗被非战斗流程稀释', description: '欧美讨论率最高，并逐渐成为版本评价的默认框架。', severity: 'high', region: 'GLOBAL', evidenceIds: ['zzz-cn-01', 'zzz-west-01'], propagation: 'Reddit → YouTube → Bilibili' },
    { id: 'zzz-c2', title: '角色宣传与重复流程错位', description: '宣传集中在角色魅力，实际体验时间分配造成落差。', severity: 'high', region: 'CN', evidenceIds: ['zzz-cn-03'], propagation: 'Bilibili → 米游社' },
    { id: 'zzz-c3', title: '风格化 UI 的可读性门槛', description: '日英商店评价都出现小字号与长时游玩疲劳反馈。', severity: 'medium', region: 'GLOBAL', evidenceIds: ['zzz-jp-03', 'zzz-west-03'], propagation: 'App Store ↔ Reddit' },
  ],
  recommendations: [
    { id: 'zzz-r1', priority: 'P0', title: '压缩战斗间隔流程', action: '在关键任务中减少重复确认和过渡，把核心战斗更早交还给玩家。', rationale: '阻断当前增长最快的跨地区负面叙事。', region: 'GLOBAL', evidenceIds: ['zzz-cn-01', 'zzz-west-01'] },
    { id: 'zzz-r2', priority: 'P1', title: '按地区重排角色传播', action: '日本强化声优和关系片段，欧美同时展示角色动画与完整战斗循环。', rationale: '保留角色吸引力，并修正欧美对玩法占比的预期。', region: 'GLOBAL', evidenceIds: ['zzz-jp-01', 'zzz-jp-02', 'zzz-west-02'] },
    { id: 'zzz-r3', priority: 'P1', title: '增加界面可读性选项', action: '提供字号、对比度和信息密度设置，并在商店更新说明中明确展示。', rationale: '回应长时游玩和无障碍需求，避免低评分累积。', region: 'GLOBAL', evidenceIds: ['zzz-jp-03', 'zzz-west-03'] },
  ],
  advisor: [
    { question: '为什么欧美玩家不喜欢这个版本？', matchers: ['欧美', '不喜欢', '版本'], answer: '欧美样本高度认可战斗与角色动画，负面集中在“想继续战斗却要等待”的流程阻力，以及风格化界面的长时可读性。', evidenceIds: ['zzz-west-01', 'zzz-west-02', 'zzz-west-03'], reportTab: 'regions' },
    { question: '为什么日本和中国玩家评价不同？', matchers: ['日本', '中国', '不同', '差异'], answer: '日本讨论更愿意围绕角色表情、声优和关系展开，因此对流程长度更宽容；中国玩家更快比较实际玩法占比、资源投入和宣传承诺。', evidenceIds: ['zzz-cn-02', 'zzz-cn-03', 'zzz-jp-01', 'zzz-jp-02'], reportTab: 'regions' },
    { question: '下一版本应该避免什么问题？', matchers: ['下一版本', '避免', '问题'], answer: '不要让角色导向的宣传掩盖实际玩法时间分配，也不要继续增加战斗之间的重复确认。可读性选项应与新内容同步上线。', evidenceIds: ['zzz-cn-03', 'zzz-west-01', 'zzz-west-03'], reportTab: 'strategy' },
    { question: '这个争议会影响未来版本吗？', matchers: ['争议', '未来', '影响'], answer: '风险较高，因为“战斗很好但总被打断”已经成为跨社区的简短传播标签。若不在下一版本改变流程，它会覆盖其他内容改进。', evidenceIds: ['zzz-cn-01', 'zzz-west-01'], reportTab: 'controversies' },
  ],
  discoveries: ['“战斗优秀但等待过长”成为跨平台高复用表达', '角色演出贡献最强正面情绪，流程切换贡献最强负面情绪', '负面情绪来自时间分配与可读性，而非战斗系统本身', '日本对角色关系更宽容，欧美对核心玩法占比最敏感'],
})

export const analysisPresets: AnalysisPreset[] = [genshin, starRail, zzz]

export function getPresetById(id: string): AnalysisPreset | undefined {
  return analysisPresets.find((preset) => preset.id === id)
}

export function createCustomPreset(gameName: string, updateTitle: string): AnalysisPreset {
  const template = structuredClone(genshin)
  const normalizedName = gameName.trim() || '自定义游戏'
  const normalizedUpdate = updateTitle.trim() || '自定义版本更新'
  return {
    ...template,
    id: `custom-${encodeURIComponent(normalizedName)}-${encodeURIComponent(normalizedUpdate)}`,
    game: { id: 'custom', name: normalizedName, shortName: 'CUSTOM', accent: '#67d8f2' },
    version: { id: 'custom', label: 'CUSTOM', title: normalizedUpdate },
    isGeneric: true,
    report: {
      ...template.report,
      summary: `这是针对「${normalizedName} · ${normalizedUpdate}」生成的通用演示数据快照。它用于展示 Agent 协作、证据追踪和地区洞察流程，不代表真实互联网采集结果。`,
    },
  }
}

export const regionLabels: Record<Exclude<RegionCode, 'GLOBAL'>, string> = {
  CN: '中国',
  JP: '日本',
  WEST: '欧美',
}
