import { analysisPresets } from '../data/presets'
import type { AnalysisPreset, EvidenceRecord, RuntimeTask } from '../domain/types'

export function createGroundedTestPreset(): AnalysisPreset {
  const base = analysisPresets[0]
  const retrievedAt = '2026-07-23T10:00:00.000Z'
  const evidence: EvidenceRecord[] = [
    {
      id: 'live-cn-001',
      source: 'Bilibili',
      sourceType: 'video',
      region: 'CN',
      language: 'zh-CN',
      author: 'TEST_FIXTURE',
      title: '测试来源：版本体验讨论',
      url: 'https://www.bilibili.com/video/BV1TEST001/',
      excerptOriginal: '测试夹具：页面讨论了版本探索体验。',
      excerptZh: '测试夹具：页面讨论了版本探索体验。',
      sentiment: 'positive',
      topics: ['探索体验'],
      confidence: 0.9,
      engagement: 0,
      publishedLabel: '2024-08-30',
      retrievedAt,
      synthetic: false,
    },
    {
      id: 'live-jp-001',
      source: 'Niconico',
      sourceType: 'video',
      region: 'JP',
      language: 'ja-JP',
      author: 'TEST_FIXTURE',
      title: 'テスト用公開ページ',
      url: 'https://www.nicovideo.jp/watch/smTEST001',
      excerptOriginal: 'テストフィクスチャ：キャラクター表現についてのページ。',
      excerptZh: '测试夹具：关于角色表现的页面。',
      sentiment: 'neutral',
      topics: ['角色表现'],
      confidence: 0.86,
      engagement: 0,
      publishedLabel: '2024-08-31',
      retrievedAt,
      synthetic: false,
    },
    {
      id: 'live-west-001',
      source: 'Reddit',
      sourceType: 'community',
      region: 'WEST',
      language: 'en-US',
      author: 'TEST_FIXTURE',
      title: 'Test fixture public discussion',
      url: 'https://www.reddit.com/r/Genshin_Impact/comments/test001/',
      excerptOriginal: 'Test fixture: a public page discussing story pacing.',
      excerptZh: '测试夹具：讨论剧情节奏的公开页面。',
      sentiment: 'negative',
      topics: ['剧情节奏'],
      confidence: 0.88,
      engagement: 0,
      publishedLabel: '2024-09-01',
      retrievedAt,
      synthetic: false,
    },
  ]
  const events = [
    { id: 'live-event-001', offsetMs: 0, agentId: 'research' as const, phase: 'research' as const, kind: 'status' as const, message: '社区研究 Agent 已启动真实公开网络检索', evidenceIds: [], progress: 4 },
    { id: 'live-event-002', offsetMs: 200, agentId: 'research' as const, phase: 'research' as const, kind: 'source' as const, message: '公开检索返回 3 条可验证页面', evidenceIds: evidence.map((item) => item.id), progress: 100, source: 'TEST FIXTURE' },
    { id: 'live-event-003', offsetMs: 400, agentId: 'sentiment' as const, phase: 'sentiment' as const, kind: 'handoff' as const, message: '情绪分类已完成', evidenceIds: evidence.map((item) => item.id), progress: 100 },
    { id: 'live-event-004', offsetMs: 600, agentId: 'regional' as const, phase: 'regional' as const, kind: 'handoff' as const, message: '地区证据比较已完成', evidenceIds: evidence.map((item) => item.id), progress: 100 },
    { id: 'live-event-005', offsetMs: 1_000, agentId: 'strategy' as const, phase: 'complete' as const, kind: 'complete' as const, message: '真实全球玩家洞察报告已生成', evidenceIds: evidence.map((item) => item.id), progress: 100 },
  ]

  return {
    ...base,
    id: 'live-test-preset',
    durationMs: 1_000,
    agents: base.agents.map((agent) => ({ ...agent, endOffsetMs: 1_000 })),
    events,
    evidence,
    sources: ['Bilibili', 'Niconico', 'Reddit'],
    report: {
      summary: '测试夹具报告：仅用于验证真实证据约束。',
      sentimentScore: 51,
      riskLevel: 'medium',
      sampleCount: 3,
      positivePercent: 34,
      neutralPercent: 33,
      negativePercent: 33,
      trend: [{ label: '实时快照', positive: 34, neutral: 33, negative: 33 }],
      regions: [
        { region: 'CN', label: '中国', sentimentScore: 100, sampleCount: 1, topConcern: '探索体验', secondaryConcern: '当前证据不足', insight: '测试夹具：1 条公开页面。' },
        { region: 'JP', label: '日本', sentimentScore: 50, sampleCount: 1, topConcern: '角色表现', secondaryConcern: '当前证据不足', insight: '测试夹具：1 条公开页面。' },
        { region: 'WEST', label: '欧美', sentimentScore: 0, sampleCount: 1, topConcern: '剧情节奏', secondaryConcern: '当前证据不足', insight: '测试夹具：1 条公开页面。' },
      ],
      keywords: [
        { label: '探索体验', weight: 48, sentiment: 'positive' },
        { label: '剧情节奏', weight: 48, sentiment: 'negative' },
      ],
      controversies: [{ id: 'live-controversy-1', title: '测试争议', description: '测试夹具中的证据化争议。', severity: 'medium', region: 'WEST', evidenceIds: ['live-west-001', 'live-cn-001'], propagation: 'TEST FIXTURE → TEST FIXTURE' }],
      recommendations: [{ id: 'live-recommendation-1', priority: 'P1', title: '测试建议', action: '只用于测试界面。', rationale: '引用测试证据。', region: 'WEST', evidenceIds: ['live-west-001'] }],
    },
    advisorAnswers: [],
  }
}

export function createGroundedCompletedTask(preset = createGroundedTestPreset()): RuntimeTask {
  return {
    id: 'live-task-1',
    presetId: preset.id,
    gameName: preset.game.name,
    versionTitle: `${preset.version.label} ${preset.version.title}`,
    status: 'completed',
    startedAt: 1_000,
    elapsedMs: preset.durationMs,
    completedAt: 1_000 + preset.durationMs,
    visibleEventIds: preset.events.map((event) => event.id),
    dataMode: 'live',
    presetSnapshot: preset,
  }
}
