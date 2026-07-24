export interface RagDocumentInput {
  id: string
  role: 'player' | 'context'
  source: string
  region: string
  language: string
  title: string
  url: string
  text: string
  retrievedAt?: string
}

export interface RagHit extends Omit<RagDocumentInput, 'id' | 'text'> {
  documentId: string
  content: string
  retrievedAt: string
  score: number
}

export interface LocalRagStore {
  indexDocuments(input: { runId: string; game: string; version: string; documents: RagDocumentInput[] }): { indexed: number }
  getStats(runId: string): { documents: number; contextDocuments: number; playerDocuments: number; chunks: number }
  retrieve(query: string, options: { runId: string; roles?: RagDocumentInput['role'][]; limit?: number }): RagHit[]
  close(): void
}

export function createLocalRagStore(options: { dbPath: string; now?: () => number }): LocalRagStore
