export interface WikiContextDocument {
  id: string
  role: 'context'
  source: string
  region: 'GLOBAL'
  language: string
  title: string
  url: string
  text: string
  retrievedAt: string
}

export function getWikiSources(gameName: unknown): Array<{ id: string; name: string; apiUrl: string; language: string }>
export function collectWikiContext(options: Record<string, unknown>): Promise<WikiContextDocument[]>
