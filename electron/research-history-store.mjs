import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const RUN_STATUSES = new Set(['running', 'incomplete', 'complete', 'failed'])
const REGIONS = new Set(['CN', 'JP', 'WEST'])

function clean(value, limit = 80_000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(String(value || ''))
  } catch {
    return fallback
  }
}

function canonicalEvidence(record) {
  let url
  try {
    url = new URL(clean(record?.url, 2_000))
  } catch {
    throw new Error('Evidence requires a valid HTTPS URL.')
  }
  if (url.protocol !== 'https:') throw new Error('Evidence requires an HTTPS URL.')
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|ref$|source$|share$)/i.test(key)) url.searchParams.delete(key)
  }
  const excerpt = clean(record?.excerptOriginal)
  if (!excerpt) throw new Error('Evidence requires an original public excerpt.')
  return createHash('sha256').update(`${url.href}\n${excerpt.normalize('NFKC').toLocaleLowerCase()}`).digest('hex')
}

function validateEvidence(runId, record) {
  if (record?.synthetic !== false) throw new Error('Synthetic evidence is forbidden in research history.')
  if (record?.role !== 'player') throw new Error('Only verified player evidence can be stored as research evidence.')
  if (clean(record?.runId, 160) !== runId) throw new Error('Evidence runId must match the active research run.')
  if (!REGIONS.has(record?.region)) throw new Error('Evidence requires a supported player region.')
  if (!clean(record?.id, 200)) throw new Error('Evidence requires an id.')
  return canonicalEvidence(record)
}

export function createResearchHistoryStore({ dbPath, now = Date.now }) {
  if (!dbPath || typeof dbPath !== 'string') throw new Error('A research history database path is required.')
  mkdirSync(path.dirname(dbPath), { recursive: true })
  const database = new DatabaseSync(dbPath)
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS research_runs (
      id TEXT PRIMARY KEY,
      game TEXT NOT NULL,
      version TEXT NOT NULL,
      regions_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('running', 'incomplete', 'complete', 'failed')),
      started_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      completed_at INTEGER,
      limitations_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS research_attempts (
      run_id TEXT NOT NULL,
      attempt_id TEXT NOT NULL,
      region TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      url TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (run_id, attempt_id),
      FOREIGN KEY (run_id) REFERENCES research_runs(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS research_evidence (
      run_id TEXT NOT NULL,
      evidence_id TEXT NOT NULL,
      canonical_key TEXT NOT NULL,
      source TEXT NOT NULL,
      domain TEXT NOT NULL,
      region TEXT NOT NULL CHECK (region IN ('CN', 'JP', 'WEST')),
      language TEXT NOT NULL,
      url TEXT NOT NULL CHECK (url LIKE 'https://%'),
      excerpt_original TEXT NOT NULL,
      retrieved_at TEXT NOT NULL,
      record_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (run_id, evidence_id),
      UNIQUE (run_id, canonical_key),
      FOREIGN KEY (run_id) REFERENCES research_runs(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS research_reports (
      run_id TEXT PRIMARY KEY,
      report_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (run_id) REFERENCES research_runs(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS browser_observations (
      run_id TEXT NOT NULL,
      observation_id TEXT NOT NULL,
      page_id TEXT NOT NULL,
      region TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      url TEXT NOT NULL DEFAULT '',
      observation_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (run_id, observation_id),
      FOREIGN KEY (run_id) REFERENCES research_runs(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS research_runs_game_status ON research_runs(game, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS research_evidence_run_region ON research_evidence(run_id, region);
  `)

  const insertRun = database.prepare(`
    INSERT INTO research_runs (id, game, version, regions_json, status, started_at, updated_at)
    VALUES (?, ?, ?, ?, 'running', ?, ?)
  `)
  const insertAttempt = database.prepare(`
    INSERT INTO research_attempts (run_id, attempt_id, region, action, status, url, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertEvidence = database.prepare(`
    INSERT INTO research_evidence
      (run_id, evidence_id, canonical_key, source, domain, region, language, url, excerpt_original, retrieved_at, record_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertReport = database.prepare('INSERT INTO research_reports (run_id, report_json, created_at) VALUES (?, ?, ?)')

  function assertRun(runId) {
    const id = clean(runId, 160)
    if (!id || !database.prepare('SELECT 1 FROM research_runs WHERE id = ?').get(id)) throw new Error('Research run does not exist.')
    return id
  }

  function startRun(input) {
    const id = clean(input?.id, 160)
    const game = clean(input?.game, 160)
    const version = clean(input?.version, 80)
    const regions = [...new Set((Array.isArray(input?.regions) ? input.regions : []).filter((region) => REGIONS.has(region)))]
    if (!id || !game || !version || !regions.length) throw new Error('A run id, game, version, and regions are required.')
    const timestamp = Number(now())
    insertRun.run(id, game, version, JSON.stringify(regions), timestamp, timestamp)
    return getRun(id)
  }

  function appendAttempt(runId, attempt) {
    const id = assertRun(runId)
    const attemptId = clean(attempt?.id, 200)
    if (!attemptId) throw new Error('Research attempt requires an id.')
    insertAttempt.run(
      id,
      attemptId,
      clean(attempt?.region, 20),
      clean(attempt?.action, 80),
      clean(attempt?.status, 40),
      clean(attempt?.url, 2_000),
      JSON.stringify(attempt),
      Number(now()),
    )
  }

  function appendEvidence(runId, record) {
    const id = assertRun(runId)
    const canonicalKey = validateEvidence(id, record)
    const url = new URL(record.url)
    try {
      insertEvidence.run(
        id,
        clean(record.id, 200),
        canonicalKey,
        clean(record.source, 120),
        url.hostname.toLocaleLowerCase().replace(/^www\./, ''),
        record.region,
        clean(record.language, 30),
        url.href,
        clean(record.excerptOriginal),
        clean(record.retrievedAt, 60),
        JSON.stringify(record),
        Number(now()),
      )
    } catch (error) {
      if (/UNIQUE constraint failed/i.test(String(error?.message || error))) throw new Error('Duplicate research evidence is not allowed.')
      throw error
    }
  }

  function saveReport(runId, report) {
    const id = assertRun(runId)
    insertReport.run(id, JSON.stringify(report), Number(now()))
  }

  function finishRun(runId, { status, limitations = [] }) {
    const id = assertRun(runId)
    if (!RUN_STATUSES.has(status) || status === 'running') throw new Error('A terminal or resumable run status is required.')
    const timestamp = Number(now())
    database.prepare(`
      UPDATE research_runs SET status = ?, limitations_json = ?, updated_at = ?, completed_at = ? WHERE id = ?
    `).run(status, JSON.stringify(Array.isArray(limitations) ? limitations : []), timestamp, status === 'complete' ? timestamp : null, id)
    return getRun(id)
  }

  function resumeRun(runId) {
    const id = assertRun(runId)
    database.prepare(`UPDATE research_runs SET status = 'running', updated_at = ?, completed_at = NULL WHERE id = ? AND status = 'incomplete'`).run(Number(now()), id)
    return getRun(id)
  }

  function getRun(runId) {
    const row = database.prepare('SELECT * FROM research_runs WHERE id = ?').get(clean(runId, 160))
    if (!row) return undefined
    const evidence = database.prepare('SELECT record_json FROM research_evidence WHERE run_id = ? ORDER BY created_at, evidence_id').all(row.id)
      .map((item) => parseJson(item.record_json, null)).filter(Boolean)
    const attempts = database.prepare('SELECT payload_json FROM research_attempts WHERE run_id = ? ORDER BY created_at, attempt_id').all(row.id)
      .map((item) => parseJson(item.payload_json, null)).filter(Boolean)
    const reportRow = database.prepare('SELECT report_json FROM research_reports WHERE run_id = ?').get(row.id)
    return {
      id: row.id,
      game: row.game,
      version: row.version,
      regions: parseJson(row.regions_json, []),
      status: row.status,
      startedAt: Number(row.started_at),
      updatedAt: Number(row.updated_at),
      completedAt: row.completed_at == null ? undefined : Number(row.completed_at),
      limitations: parseJson(row.limitations_json, []),
      evidence,
      attempts,
      report: reportRow ? parseJson(reportRow.report_json, undefined) : undefined,
    }
  }

  function listRuns({ game, status } = {}) {
    return database.prepare('SELECT id FROM research_runs ORDER BY updated_at DESC, id DESC').all()
      .map((row) => getRun(row.id))
      .filter((run) => (!game || run.game === game) && (!status || run.status === status))
  }

  function getEvidenceForRuns(runIds) {
    const ids = [...new Set((Array.isArray(runIds) ? runIds : []).map((id) => clean(id, 160)).filter(Boolean))]
    return ids.flatMap((id) => getRun(id)?.evidence || [])
  }

  function getBaselineCandidates({ game, excludeRunId } = {}) {
    return listRuns({ game, status: 'complete' }).filter((run) => run.id !== excludeRunId)
  }

  return Object.freeze({
    startRun,
    appendAttempt,
    appendEvidence,
    saveReport,
    finishRun,
    resumeRun,
    getRun,
    listRuns,
    getEvidenceForRuns,
    getBaselineCandidates,
    close: () => database.close(),
  })
}
