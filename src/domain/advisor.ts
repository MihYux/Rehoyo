import type { AdvisorAnswer, AnalysisPreset } from './types'

export interface GroundedAdvisorResponse {
  answer: string
  evidenceIds: string[]
  reportTab: AdvisorAnswer['reportTab']
  isFallback: boolean
}

function normalize(value: string) {
  return value.toLocaleLowerCase().replace(/[？?！!，,。\s]/g, '')
}

export function getAdvisorResponse(
  preset: AnalysisPreset,
  prompt: string,
): GroundedAdvisorResponse {
  const normalizedPrompt = normalize(prompt)
  if (preset.dataMode === 'live') {
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
    const evidenceIds = (preferred.length ? preferred : rankedEvidence).slice(0, 8).map(({ item }) => item.id)
    const reportTab = normalizedPrompt.includes('地区') || regionTerms.length
      ? 'regions'
      : normalizedPrompt.includes('建议') || normalizedPrompt.includes('下一版本') || normalizedPrompt.includes('避免')
        ? 'strategy'
        : normalizedPrompt.includes('争议') || normalizedPrompt.includes('风险')
          ? 'controversies'
          : 'overview'

    if (!evidenceIds.length) {
      return {
        answer: '当前实时任务没有检索到足够的公开证据，无法可靠回答这个问题。',
        evidenceIds: [],
        reportTab: 'overview',
        isFallback: true,
      }
    }

    return {
      answer: `${preset.report.summary} 请仅依据随附的实时公开网页证据进一步回答用户问题。`,
      evidenceIds,
      reportTab,
      isFallback: false,
    }
  }

  const scored = preset.advisorAnswers
    .map((candidate) => ({
      candidate,
      score:
        (normalizedPrompt.includes(normalize(candidate.question)) ? 10 : 0) +
        candidate.matchers.filter((matcher) => normalizedPrompt.includes(normalize(matcher))).length,
    }))
    .sort((a, b) => b.score - a.score)
  const best = scored[0]

  if (!best || best.score < 2) {
    return {
      answer: '当前演示快照没有足够证据回答这个问题。你可以尝试询问地区差异、版本争议、角色评价或下一版本策略。',
      evidenceIds: [],
      reportTab: 'overview',
      isFallback: true,
    }
  }

  return {
    answer: best.candidate.answer,
    evidenceIds: best.candidate.evidenceIds,
    reportTab: best.candidate.reportTab,
    isFallback: false,
  }
}
