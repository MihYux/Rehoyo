import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const VALID_ROLES = new Set(['player', 'context'])

function clean(value, limit = 80_000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function chunksFor(text, maxLength = 900, overlap = 120) {
  const normalized = clean(text)
  if (!normalized) return []
  const chunks = []
  let offset = 0
  while (offset < normalized.length) {
    let end = Math.min(normalized.length, offset + maxLength)
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf(' ', end)
      if (boundary > offset + Math.floor(maxLength * 0.6)) end = boundary
    }
    chunks.push(normalized.slice(offset, end).trim())
    if (end >= normalized.length) break
    offset = Math.max(offset + 1, end - overlap)
  }
  return chunks.filter(Boolean)
}

function tokenize(value) {
  const normalized = clean(value).toLocaleLowerCase()
  const tokens = new Set(normalized.match(/[\p{L}\p{N}]+/gu) ?? [])
  for (const sequence of normalized.match(/[\p{Script=Han}]{2,}/gu) ?? []) {
    tokens.add(sequence)
    for (let index = 0; index < sequence.length - 1; index += 1) tokens.add(sequence.slice(index, index + 2))
  }
  return [...tokens].filter((token) => token.length > 1)
}

function relevanceScore(queryTokens, row) {
  const title = clean(row.title).toLocaleLowerCase()
  const content = clean(row.content).toLocaleLowerCase()
  let score = 0
  for (const token of queryTokens) {
    if (title.includes(token)) score += 4
    if (content.includes(token)) score += 1
  }
  return score
}

export function createLocalRagStore({ dbPath, now = Date.now }) {
  if (!dbPath || typeof dbPath !== 'string') throw new Error('A local RAG database path is required.')
  mkdirSync(path.dirname(dbPath), { recursive: true })
  const database = new DatabaseSync(dbPath)
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS rag_documents (
      run_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      game TEXT NOT NULL,
      version TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('player', 'context')),
      source TEXT NOT NULL,
      region TEXT NOT NULL,
      language TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      body TEXT NOT NULL,
      retrieved_at TEXT NOT NULL,
      PRIMARY KEY (run_id, document_id)
    );
    CREATE TABLE IF NOT EXISTS rag_chunks (
      run_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      PRIMARY KEY (run_id, document_id, chunk_index),
      FOREIGN KEY (run_id, document_id) REFERENCES rag_documents(run_id, document_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS rag_documents_run_role ON rag_documents(run_id, role);
    CREATE INDEX IF NOT EXISTS rag_chunks_run ON rag_chunks(run_id);
  `)

  const upsertDocument = database.prepare(`
    INSERT INTO rag_documents (run_id, document_id, game, version, role, source, region, language, title, url, body, retrieved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(run_id, document_id) DO UPDATE SET
      game=excluded.game, version=excluded.version, role=excluded.role, source=excluded.source,
      region=excluded.region, language=excluded.language, title=excluded.title, url=excluded.url,
      body=excluded.body, retrieved_at=excluded.retrieved_at
  `)
  const deleteChunks = database.prepare('DELETE FROM rag_chunks WHERE run_id = ? AND document_id = ?')
  const insertChunk = database.prepare('INSERT INTO rag_chunks (run_id, document_id, chunk_index, content) VALUES (?, ?, ?, ?)')

  function indexDocuments({ runId, game, version, documents }) {
    const safeRunId = clean(runId, 160)
    if (!safeRunId || !Array.isArray(documents)) throw new Error('RAG indexing requires a run id and documents.')
    database.exec('BEGIN IMMEDIATE')
    let indexed = 0
    try {
      for (const document of documents) {
        const documentId = clean(document?.id, 200)
        const role = clean(document?.role, 20)
        const url = clean(document?.url, 2_000)
        const body = clean(document?.text)
        if (!documentId || !VALID_ROLES.has(role) || !url.startsWith('https://') || !body) continue
        const retrievedAt = clean(document?.retrievedAt, 60) || new Date(now()).toISOString()
        upsertDocument.run(
          safeRunId, documentId, clean(game, 160), clean(version, 80), role,
          clean(document?.source, 120), clean(document?.region, 20) || 'GLOBAL', clean(document?.language, 30) || 'unknown',
          clean(document?.title, 500), url, body, retrievedAt,
        )
        deleteChunks.run(safeRunId, documentId)
        chunksFor(body).forEach((content, index) => insertChunk.run(safeRunId, documentId, index, content))
        indexed += 1
      }
      database.exec('COMMIT')
      return { indexed }
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }

  function getStats(runId) {
    const row = database.prepare(`
      SELECT COUNT(*) AS documents,
        SUM(CASE WHEN role = 'context' THEN 1 ELSE 0 END) AS context_documents,
        SUM(CASE WHEN role = 'player' THEN 1 ELSE 0 END) AS player_documents
      FROM rag_documents WHERE run_id = ?
    `).get(clean(runId, 160))
    const chunkRow = database.prepare('SELECT COUNT(*) AS chunks FROM rag_chunks WHERE run_id = ?').get(clean(runId, 160))
    return {
      documents: Number(row?.documents ?? 0),
      contextDocuments: Number(row?.context_documents ?? 0),
      playerDocuments: Number(row?.player_documents ?? 0),
      chunks: Number(chunkRow?.chunks ?? 0),
    }
  }

  function retrieve(query, { runId, roles = ['player', 'context'], limit = 8 } = {}) {
    const queryTokens = tokenize(query)
    if (!queryTokens.length || !runId) return []
    const roleSet = new Set(roles.filter((role) => VALID_ROLES.has(role)))
    const rows = database.prepare(`
      SELECT d.document_id, d.role, d.source, d.region, d.language, d.title, d.url, d.retrieved_at,
        c.chunk_index, c.content
      FROM rag_chunks c
      JOIN rag_documents d ON d.run_id = c.run_id AND d.document_id = c.document_id
      WHERE c.run_id = ?
      ORDER BY d.document_id, c.chunk_index
      LIMIT 2400
    `).all(clean(runId, 160))
    return rows
      .filter((row) => roleSet.has(row.role))
      .map((row) => ({ ...row, score: relevanceScore(queryTokens, row) }))
      .filter((row) => row.score > 0)
      .sort((left, right) => right.score - left.score || String(left.document_id).localeCompare(String(right.document_id)))
      .slice(0, Math.max(1, Math.min(24, Math.floor(limit))))
      .map((row) => ({
        documentId: row.document_id,
        role: row.role,
        source: row.source,
        region: row.region,
        language: row.language,
        title: row.title,
        url: row.url,
        content: row.content,
        retrievedAt: row.retrieved_at,
        score: row.score,
      }))
  }

  return Object.freeze({ indexDocuments, getStats, retrieve, close: () => database.close() })
}
