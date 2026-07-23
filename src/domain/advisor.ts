import type { AdvisorAnswer, AnalysisPreset } from './types'

export interface GroundedAdvisorResponse {
  answer: string
  evidenceIds: string[]
  reportTab: AdvisorAnswer['reportTab']
  isFallback: boolean
}

function normalize(value: string) {
  return value.toLocaleLowerCase().replace(/[，。！？、\s]/g, '')
}

export function getAdvisorResponse(
  preset: AnalysisPreset,
  prompt: string,
): GroundedAdvisorResponse {
  const normalizedPrompt = normalize(prompt)
  const regionTerms = normalizedPrompt.includes('日本')
    ? ['JP']
    : normalizedPrompt.includes('中国')
      ? ['CN']
      : normalizedPrompt.includes('欧美') || normalizedPrompt.includes('西方')
        ? ['WEST']
        : []
  const rankedEvidence = preset.evidence
    .map((item) => ({
      item,
      score:
        (regionTerms.includes(item.region) ? 5 : 0) +
        item.topics.filter((topic) => normalizedPrompt.includes(normalize(topic))).length * 3 +
        (normalizedPrompt.includes(normalize(item.source)) ? 2 : 0),
    }))
    .sort((a, b) => b.score - a.score)
  const preferred = rankedEvidence.filter((item) => item.score > 0)
  const evidenceIds = (preferred.length ? preferred : rankedEvidence)
    .slice(0, 8)
    .map(({ item }) => item.id)
  const reportTab = normalizedPrompt.includes('地区') || regionTerms.length
    ? 'regions'
    : normalizedPrompt.includes('建议') || normalizedPrompt.includes('下一版本') || normalizedPrompt.includes('避免')
      ? 'strategy'
      : normalizedPrompt.includes('争议') || normalizedPrompt.includes('风险')
        ? 'controversies'
        : 'overview'

  if (!evidenceIds.length) {
    return {
      answer: '当前任务没有检索到足够的可验证公开证据，因此无法可靠回答这个问题。ReHoYo 不会生成替代评论或推测数据。',
      evidenceIds: [],
      reportTab: 'overview',
      isFallback: true,
    }
  }

  return {
    answer: `${preset.report.summary} 以下回答只能依据随附的真实公开网页证据，不代表总体玩家或平台官方结论。`,
    evidenceIds,
    reportTab,
    isFallback: false,
  }
}
