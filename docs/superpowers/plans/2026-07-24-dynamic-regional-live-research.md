# Dynamic Regional Live Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed search-plan pipeline with an AI-directed Playwright research loop that collects at least 30 current, verifiable player records for each of CN, JP, and WEST before producing a full report, while maintaining clearly separated real historical baselines.

**Architecture:** The Electron main process owns a guarded research tool runtime. A research-planner model repeatedly inspects current regional coverage and chooses the next real search, navigation, scrolling, extraction, or verification action; deterministic code validates URLs, provenance, deduplication, dates, region, and quotas. SQLite stores immutable research runs, raw evidence, browser observations, RAG chunks, and historical reports; the renderer only receives safe progress events and report snapshots over IPC.

**Tech Stack:** Electron, React, TypeScript, Node SQLite, Playwright Chromium, GLM chat completions, Brave Search HTML, BigModel Web Search, Vitest, Testing Library, Playwright Electron tests.

## Global Constraints

- No prefilled comments, metrics, sentiment, controversies, recommendations, or “live” report content.
- Presets may contain only game/version metadata and blank evidence/report containers.
- Current-run quota is `CN >= 30`, `JP >= 30`, `WEST >= 30` unique verified player records, plus at least 30 distinct successfully inspected public domains globally.
- Wikipedia and other context documents never count as player evidence or toward regional quotas.
- Historical evidence never counts toward current-run quotas.
- A full report is generated only after every requested region reaches quota; otherwise the run remains `incomplete` and can resume.
- Every player record must include an HTTPS URL, original excerpt, source, region, language, retrieval time, content kind, and `synthetic: false`.
- The AI chooses searches dynamically from observed gaps and results. The source catalog is a capability/safety registry, not a precomputed execution plan.
- Browser automation is headless by default, globally capped at 12 simultaneous pages, and emits live screenshot/action events to the renderer.
- Turnstile or CAPTCHA is never bypassed. The affected page pauses for manual user takeover or is abandoned; other workers continue.
- API credentials remain in Electron `safeStorage` and never cross renderer IPC.
- All code changes follow test-first red/green/refactor, commit directly to `main`, switch GitHub accounts in the required order before every commit, and push immediately after every commit.

---

## File Structure

### New files

- `electron/research-policy.mjs` — quota, time-budget, source-diversity, and completion rules.
- `electron/research-agent-loop.mjs` — model-driven tool loop and structured action validation.
- `electron/research-tools.mjs` — guarded `search_web`, `open_page`, `scroll_page`, `extract_comments`, `inspect_source`, and `finish_region` tools.
- `electron/research-history-store.mjs` — immutable runs/evidence/reports and baseline queries in SQLite.
- `electron/historical-report.mjs` — recent-three, all-local-history, and curated-source baseline generation.
- `src/features/projects/RegionalResearchProgress.tsx` — per-region quota, live actions, browser previews, and resume state.
- `src/features/release-workspace/HistoricalBaselinePanel.tsx` — separate historical-vs-current comparison.
- `src/desktop/researchPolicy.test.ts`
- `src/desktop/researchAgentLoop.test.ts`
- `src/desktop/researchHistoryStore.test.ts`
- `src/desktop/historicalReport.test.ts`
- `src/features/projects/RegionalResearchProgress.test.tsx`
- `src/features/release-workspace/HistoricalBaselinePanel.test.tsx`

### Modified files

- `electron/research-client.mjs` — replace `buildSourceSearchPlans`/global early-stop orchestration with the dynamic regional loop.
- `electron/headless-research-browser.mjs` — persistent page sessions, action execution, extraction, screenshots, and challenge pause/resume.
- `electron/local-rag-store.mjs` — retrieve across explicitly selected run IDs without mixing historical and current roles.
- `electron/main.mjs` — run/resume/cancel/manual-takeover/history IPC handlers.
- `electron/preload.cjs` and `src/desktop/bridge.ts` — typed safe IPC methods and events.
- `electron/research-client.d.mts`, `electron/headless-research-browser.d.mts`, `electron/local-rag-store.d.mts` — runtime type declarations.
- `src/domain/types.ts` — regional coverage, run status, browser action, provenance, and baseline types.
- `src/features/projects/RegionalAnalysisRun.tsx` — render `RegionalResearchProgress` and prohibit full completion on partial coverage.
- `src/features/release-workspace/ReleaseWorkspace.tsx` — current report plus explicitly labeled historical baseline.
- `src/features/report/ReportDashboard.tsx` — show current-only counts and citations; add historical comparison section.
- `src/data/presets.ts` — retain metadata-only presets and blank live containers.
- `src/desktop/researchClient.test.ts`, `src/desktop/headlessResearchBrowser.test.ts`, `src/data/presets.test.ts` — update integration and no-prefill assertions.
- `tests/electron/research-flow.spec.ts` — complete dynamic HSR run and incomplete/resume paths.
- `README.md` — real-time-only and historical-baseline semantics.

---

### Task 1: Lock the live-only contract and per-region completion policy

**Files:**
- Create: `electron/research-policy.mjs`
- Test: `src/desktop/researchPolicy.test.ts`
- Modify: `src/domain/types.ts`
- Modify: `src/data/presets.test.ts`

**Interfaces:**
- Produces: `createCoveragePolicy(input)`, `deriveRegionalCoverage(evidence, attempts, policy)`, `canGenerateFullReport(coverage)`.
- Produces type: `RegionalResearchCoverage` with per-region evidence, domains, attempts, exhausted state, and quota status.

- [ ] **Step 1: Write failing policy tests** proving 30/30/30 plus 30 global domains completes, 30/29/30 does not complete, context/Wiki records do not count, duplicates do not count, and historical records do not count.

```ts
it('requires 30 current player records in every requested region', () => {
  const coverage = deriveRegionalCoverage(records({ CN: 30, JP: 29, WEST: 30 }), attempts, createCoveragePolicy({}))
  expect(coverage.regions.JP).toMatchObject({ evidence: 29, target: 30, reached: false })
  expect(canGenerateFullReport(coverage)).toBe(false)
})
```

- [ ] **Step 2: Run `npm.cmd test -- src/desktop/researchPolicy.test.ts src/data/presets.test.ts`** and confirm failure because the regional policy does not exist.
- [ ] **Step 3: Implement deterministic policy functions** with defaults `{ evidencePerRegion: 30, globalDomains: 30, maxConcurrentPages: 12, maxRunMinutes: 45 }`; accept only `role === 'player'`, `synthetic === false`, current `runId`, valid HTTPS provenance, and unique canonical URL plus excerpt hash.
- [ ] **Step 4: Extend `AnalysisPreset.researchCoverage`** with `status: 'running' | 'incomplete' | 'complete'`, `regions: Record<'CN'|'JP'|'WEST', RegionCoverage>`, `globalDomains`, `targetGlobalDomains`, `canResume`, and `limitations`.
- [ ] **Step 5: Run the focused tests** and confirm they pass.
- [ ] **Step 6: Commit and push** with `feat: enforce per-region live evidence quotas` after the two required `gh auth switch` commands.

### Task 2: Persist immutable real evidence and historical runs

**Files:**
- Create: `electron/research-history-store.mjs`
- Create: `src/desktop/researchHistoryStore.test.ts`
- Modify: `electron/main.mjs`

**Interfaces:**
- Produces: `createResearchHistoryStore({ dbPath, now })`.
- Methods: `startRun`, `appendEvidence`, `appendAttempt`, `saveReport`, `finishRun`, `getRun`, `listRuns`, `getEvidenceForRuns`, `getBaselineCandidates`.

- [ ] **Step 1: Write failing SQLite tests** for immutable append, duplicate rejection, provenance validation, resume after process restart, and separation of current versus historical run IDs.
- [ ] **Step 2: Run `npm.cmd test -- src/desktop/researchHistoryStore.test.ts`** and confirm module-not-found failure.
- [ ] **Step 3: Create tables** `research_runs`, `research_attempts`, `research_evidence`, `research_reports`, and `browser_observations` in WAL mode. Store canonical URL, excerpt hash, source/domain, region/language, published/retrieved timestamps, role, raw excerpt, translated excerpt, and evidence validation status.
- [ ] **Step 4: Enforce database constraints** so `synthetic != 0`, non-HTTPS URLs, missing raw excerpts, or `role='context'` player inserts fail before persistence.
- [ ] **Step 5: Wire the store in `electron/main.mjs`** using the existing `rehoyo-research.sqlite` path and close it during `before-quit`.
- [ ] **Step 6: Run focused tests** and confirm restart/resume and immutability pass.
- [ ] **Step 7: Commit and push** with `feat: persist immutable live research history`.

### Task 3: Replace fixed plans with an AI-directed research action loop

**Files:**
- Create: `electron/research-agent-loop.mjs`
- Create: `electron/research-tools.mjs`
- Create: `src/desktop/researchAgentLoop.test.ts`
- Modify: `electron/research-client.mjs`

**Interfaces:**
- Produces: `runRegionalResearchAgent({ region, request, policy, state, model, tools, onEvent, signal })`.
- Model action schema:

```ts
type ResearchAction =
  | { type: 'search_web'; provider: 'brave' | 'bigmodel'; query: string; language: string }
  | { type: 'open_page'; url: string; reason: string }
  | { type: 'scroll_page'; pageId: string; direction: 'down' | 'up'; amount: number }
  | { type: 'extract_comments'; pageId: string; selectors?: string[] }
  | { type: 'inspect_source'; url: string }
  | { type: 'finish_region'; reason: string }
```

- [ ] **Step 1: Write failing loop tests** where the model reacts to zero-result searches by changing provider/query/source, reacts to a regional deficit by continuing only that region, and is rejected when it tries to finish below 30.
- [ ] **Step 2: Run `npm.cmd test -- src/desktop/researchAgentLoop.test.ts`** and confirm failure.
- [ ] **Step 3: Implement strict JSON action parsing** with `jsonrepair`, per-action validation, public-HTTPS validation, query length bounds, domain repetition penalties, and cancellation support.
- [ ] **Step 4: Give the model only observed state**: quota gaps, attempted domains/queries, error categories, snippets, date window, and source capability metadata. Do not provide an ordered search plan or a fixed next query.
- [ ] **Step 5: Implement the control loop** so deterministic code executes one validated action, records the result, recalculates coverage, and asks the model for the next action. `finish_region` succeeds only when policy says the region is complete.
- [ ] **Step 6: Add bounded recovery**: malformed model output is repaired once, then re-prompted with the validation error; repeated action cycles are blocked; safety budget expiry returns `incomplete`, never a fabricated report.
- [ ] **Step 7: Remove `collectResearchCoverage` from production orchestration** while retaining parsers and providers as tools. Delete production dependence on `buildSourceSearchPlans` and `interleavePlans`.
- [ ] **Step 8: Run loop and existing parser tests** and confirm pass.
- [ ] **Step 9: Commit and push** with `feat: let research agents choose searches dynamically`.

### Task 4: Let the AI control persistent Playwright pages and extract real comments

**Files:**
- Modify: `electron/headless-research-browser.mjs`
- Modify: `electron/headless-research-browser.d.mts`
- Modify: `src/desktop/headlessResearchBrowser.test.ts`
- Modify: `electron/research-tools.mjs`

**Interfaces:**
- Produces browser methods: `open`, `scroll`, `click`, `type`, `extractVisibleComments`, `screenshot`, `pauseForTakeover`, `resume`, `closePage`, `close`.
- Emits `BrowserObservation` with `pageId`, `agentId`, `region`, `action`, `status`, `url`, `title`, `screenshotDataUrl`, and redacted text preview.

- [ ] **Step 1: Write failing Playwright-adapter tests** for hidden launch, 12-page global cap, navigation, scrolling, clicking, comment extraction, screenshot emission, challenge pause, manual resume, and page cleanup.
- [ ] **Step 2: Run `npm.cmd test -- src/desktop/headlessResearchBrowser.test.ts`** and confirm failures for missing action methods.
- [ ] **Step 3: Refactor one-shot `observe()` into a persistent session** with one isolated context per run, semaphore-limited pages, blocked downloads/service workers, public-HTTPS checks on every navigation, and a fixed user agent that does not pretend to be a human identity.
- [ ] **Step 4: Implement semantic extraction** using visible DOM text, comment/article/review containers, author/time/permalink discovery, and page-specific adapters for Reddit, YouTube, Bilibili, 米游社, HoYoLAB, Niconico, Tieba, app stores, and general forums.
- [ ] **Step 5: Validate each extracted record** against the selected game/version/date window and preserve the original excerpt exactly before translation or sentiment analysis.
- [ ] **Step 6: Emit JPEG previews after every browser action** at a throttled rate; never send cookies, form values, API keys, or authorization headers to the renderer.
- [ ] **Step 7: Detect Turnstile/CAPTCHA** and pause that page. Expose a manual-takeover token; do not implement cloaking or bypass behavior.
- [ ] **Step 8: Run focused tests** and confirm all browser resources close on success, abort, and error.
- [ ] **Step 9: Commit and push** with `feat: add AI-controlled Playwright research sessions`.

### Task 5: Coordinate three regional workers until 90+ current records are verified

**Files:**
- Modify: `electron/research-client.mjs`
- Modify: `src/desktop/researchClient.test.ts`
- Modify: `electron/research-client.d.mts`

**Interfaces:**
- Consumes: `runRegionalResearchAgent`, `deriveRegionalCoverage`, history store, RAG store, browser tools.
- Produces: resumable `runLiveResearch` result with current-only evidence and per-region coverage.

- [ ] **Step 1: Replace the old 30-global-record integration test** with a failing test requiring 30 CN, 30 JP, 30 WEST and 30 distinct inspected domains before sentiment/regional/strategy agents run.
- [ ] **Step 2: Add failing tests** proving historical evidence and Wiki documents cannot fill current quotas, a 30/29/30 run remains incomplete, and resume collects only the missing regional evidence.
- [ ] **Step 3: Run `npm.cmd test -- src/desktop/researchClient.test.ts`** and confirm expected failures.
- [ ] **Step 4: Run regional research workers concurrently** under one 12-page semaphore. Dynamically allocate idle page capacity to the largest quota deficit while preventing one region from consuming all slots.
- [ ] **Step 5: Persist every attempt/evidence item immediately** and recalculate coverage from the database, not renderer state.
- [ ] **Step 6: Gate downstream analysis**: only call sentiment, regional comparison, and strategy synthesis when every requested region is complete. On interruption or budget expiry, return `status='incomplete'`, `canResume=true`, evidence collected so far, and no full report.
- [ ] **Step 7: Batch model analysis safely** in chunks of 20 evidence records, require exact ID coverage, merge deterministically, and compute all counts/percentages in code.
- [ ] **Step 8: Run the integration tests** and confirm at least 90 unique current records and no analysis call before quotas complete.
- [ ] **Step 9: Commit and push** with `feat: require 30 verified records per region`.

### Task 6: Build three real historical baseline modes

**Files:**
- Create: `electron/historical-report.mjs`
- Create: `src/desktop/historicalReport.test.ts`
- Modify: `electron/local-rag-store.mjs`
- Modify: `src/desktop/localRagStore.test.ts`

**Interfaces:**
- Produces `buildHistoricalBaseline({ game, regions, mode, currentRunId, store, curatedSources })`.
- Modes: `recent_three_versions`, `all_local_runs`, `curated_real_sources`.

- [ ] **Step 1: Write failing tests** for all three modes, provenance citations, run/date labels, region separation, and exclusion of current-run evidence.
- [ ] **Step 2: Run `npm.cmd test -- src/desktop/historicalReport.test.ts src/desktop/localRagStore.test.ts`** and confirm failure.
- [ ] **Step 3: Implement recent-three baseline** from the latest three completed, real-evidence versions for the selected game and region.
- [ ] **Step 4: Implement all-local baseline** from every completed local run for the selected game, with per-version weighting so one large run cannot silently dominate.
- [ ] **Step 5: Implement curated-source baseline** by running the same real browser/search validation pipeline against user-approved source URLs; store source-set version, retrieval time, and citations. A curated URL without verified evidence remains empty.
- [ ] **Step 6: Generate deterministic baseline metrics** from stored evidence and use the model only to summarize cited themes. Label every sentence with run IDs/evidence IDs.
- [ ] **Step 7: Extend RAG retrieval** to accept explicit `runIds` and `roles`; default remains current run only. Historical retrieval requires an explicit baseline mode.
- [ ] **Step 8: Run focused tests** and confirm historical evidence cannot leak into current metrics.
- [ ] **Step 9: Commit and push** with `feat: add provenance-backed historical baselines`.

### Task 7: Produce a full cited report only after live quotas complete

**Files:**
- Modify: `electron/research-client.mjs`
- Modify: `src/domain/types.ts`
- Modify: `src/features/report/ReportDashboard.tsx`
- Modify: `src/features/report/ReportDashboard.test.tsx`

**Interfaces:**
- Produces report layers: `current`, `historicalBaselines`, and `changeSinceBaseline`.

- [ ] **Step 1: Write failing report tests** proving incomplete runs show coverage gaps and no full conclusions, while complete 30/30/30 runs show regional sentiment, themes, controversies, representative quotes, source diversity, and strategies with valid current evidence IDs.
- [ ] **Step 2: Run the report tests** and confirm failures.
- [ ] **Step 3: Compute metrics deterministically** from current evidence: counts, percentages, region matrices, domain/source diversity, publication distribution, topic frequencies, and confidence intervals.
- [ ] **Step 4: Validate model conclusions** so every claim cites existing evidence IDs from the correct region and every strategy cites at least three current evidence records from at least two sources.
- [ ] **Step 5: Render historical comparison separately** with visible labels `历史真实快照` and `本次实时研究`; show added, persistent, and declining themes without merging sample counts.
- [ ] **Step 6: Add evidence drill-down** from every quote, controversy, and recommendation to the original URL, raw excerpt, run, region, and retrieval timestamp.
- [ ] **Step 7: Run tests** and confirm fabricated/missing IDs are rejected.
- [ ] **Step 8: Commit and push** with `feat: gate full reports on complete live coverage`.

### Task 8: Show clear regional progress, browser actions, and resumable deficits

**Files:**
- Create: `src/features/projects/RegionalResearchProgress.tsx`
- Create: `src/features/projects/RegionalResearchProgress.test.tsx`
- Create: `src/features/release-workspace/HistoricalBaselinePanel.tsx`
- Create: `src/features/release-workspace/HistoricalBaselinePanel.test.tsx`
- Modify: `src/features/projects/RegionalAnalysisRun.tsx`
- Modify: `src/features/release-workspace/ReleaseWorkspace.tsx`
- Modify: `src/desktop/bridge.ts`
- Modify: `electron/preload.cjs`
- Modify: `electron/main.mjs`

**Interfaces:**
- IPC: `research.run`, `research.resume`, `research.cancel`, `research.takeover`, `research.releaseTakeover`, `research.getHistory`, and `research.onEvent`.

- [ ] **Step 1: Write failing UI tests** for three flag cards with independent `x/30` counters, dynamic query/action text, 12 live browser slots, screenshot previews, current-vs-history labels, incomplete/resume state, and disabled full-report navigation before completion.
- [ ] **Step 2: Run the focused UI tests** and confirm failures.
- [ ] **Step 3: Replace global `30+` counters** with CN/JP/WEST counters, actual domain counts, current query, current browser action, failed-source reason, and estimated remaining gap.
- [ ] **Step 4: Render a compact browser grid** that automatically allocates visible previews to active pages; clicking a preview opens action history and manual-takeover controls for challenge pages.
- [ ] **Step 5: Implement resume** using persisted `runId`; the UI must preserve already verified current evidence and continue only missing quotas.
- [ ] **Step 6: Render historical baseline controls** for recent three versions, all local history, and curated real sources. Never label them `LIVE`.
- [ ] **Step 7: Run UI tests** and confirm keyboard navigation, focus visibility, and reduced-motion behavior.
- [ ] **Step 8: Commit and push** with `feat: show live regional research coverage and history`.

### Task 9: End-to-end verification and documentation

**Files:**
- Modify: `tests/electron/research-flow.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: Add an Electron E2E fixture model/search service** that returns deterministic tool responses but exercises the real orchestration, Playwright adapters, IPC, persistence, resume, and report gates without claiming fixture records are production data.
- [ ] **Step 2: Test a complete HSR path**: HSR default → dynamic queries change after sparse results → CN/JP/WEST reach 30 → at least 30 domains inspected → browser previews/actions appear → full cited report unlocks → historical comparison remains separate.
- [ ] **Step 3: Test an incomplete path**: JP stops at 29 → no full report → app restart → resume → JP reaches 30 → full report unlocks.
- [ ] **Step 4: Test rejection paths** for synthetic evidence, HTTP/private URLs, duplicate comments, Wiki counted as player evidence, historical leakage, invalid model JSON, challenge pages, and cancellation cleanup.
- [ ] **Step 5: Update README** with live-only guarantees, quota semantics, supported source capabilities, browser/manual-verification behavior, SQLite location, baseline modes, and the statement that public-page evidence is not statistically representative of all players.
- [ ] **Step 6: Run `npm.cmd run check`** and require 0 test/build failures.
- [ ] **Step 7: Run `npm.cmd run test:electron`** at 1440×900 and 1920×1080 and require 0 failures and no renderer/main-process console errors.
- [ ] **Step 8: Inspect `git diff --check` and `git status --short`**, then commit and push with `docs: document dynamic live research guarantees`.

---

## Acceptance Checklist

- [ ] Starting a new task shows zero current evidence and zero current metrics.
- [ ] The AI selects the next provider, query, source, and browser action from observed research state rather than following a predetermined ordered plan.
- [ ] CN, JP, and WEST each contain at least 30 unique, current, verified player records before a full report exists.
- [ ] At least 30 distinct public domains were actually inspected; attempted-but-unopened search results are not counted as inspected domains.
- [ ] Each evidence record opens its real HTTPS source and preserves the original excerpt.
- [ ] Wiki is present only as context and never affects player counts or sentiment.
- [ ] Historical recent-three, all-local, and curated-source baselines are available and visibly separated from the current run.
- [ ] An incomplete run survives restart and resumes from its regional deficit.
- [ ] Playwright runs headlessly, caps concurrency at 12, streams safe previews/actions, and never bypasses verification challenges.
- [ ] Report counts are deterministic; model-generated claims without valid citations are rejected.
- [ ] No code path falls back to demo comments, simulated evidence, or prefilled live reports.
