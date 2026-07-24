export interface ResearchHistoryStore {
  startRun(input: { id: string; game: string; version: string; regions: string[] }): unknown
  appendAttempt(runId: string, attempt: Record<string, unknown>): void
  appendRouteSnapshot(runId: string, snapshot: Record<string, unknown>): void
  appendCandidate(runId: string, candidate: Record<string, unknown>): void
  appendBrowserObservation(runId: string, observation: Record<string, unknown>): void
  appendEvidence(runId: string, evidence: Record<string, unknown>): void
  saveReport(runId: string, report: Record<string, unknown>): void
  finishRun(runId: string, input: { status: 'incomplete' | 'complete' | 'failed'; limitations?: string[] }): unknown
  resumeRun(runId: string): unknown
  getRun(runId: string): any
  listRuns(filters?: { game?: string; status?: string }): any[]
  getEvidenceForRuns(runIds: string[]): any[]
  getBaselineCandidates(filters?: { game?: string; excludeRunId?: string }): any[]
  close(): void
}

export function createResearchHistoryStore(input: { dbPath: string; now?: () => number }): ResearchHistoryStore
