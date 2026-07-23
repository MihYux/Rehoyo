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
