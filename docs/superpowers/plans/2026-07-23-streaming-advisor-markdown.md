# Streaming Advisor Markdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream genuine GLM advisor tokens into the Electron UI and render the accumulated response as secure Markdown with Streamdown.

**Architecture:** Electron's main process owns the authenticated GLM SSE request and emits request-scoped lifecycle events over preload IPC. The React workspace accumulates deltas into one assistant turn, renders that string through Streamdown, and cancels through a main-process `AbortController` without exposing credentials.

**Tech Stack:** Electron 43, React 19, TypeScript 7, Vitest, Testing Library, native Fetch/ReadableStream/SSE, Streamdown 2.x.

## Global Constraints

- API credentials remain in the Electron main process and are never included in IPC payloads.
- Only real GLM `stream: true` output may drive the live answer; no typewriter simulation.
- Only one advisor stream is active per workspace.
- User cancellation preserves received text.
- Evidence buttons are derived from the existing local evidence matcher, not model-generated Markdown.
- Raw HTML is not enabled; Streamdown safe URL behavior remains active.
- Work directly on `main`; switch GitHub account before every commit and push every commit.

## File map

- `electron/glm-client.mjs`: GLM request construction, streaming SSE decoder, and non-streaming compatibility wrapper.
- `electron/glm-client.d.mts`: public streaming function and callback types.
- `electron/main.mjs`: request ownership, cancellation, and normalized IPC lifecycle events.
- `electron/preload.cjs`: safe advisor stream/cancel/event bridge.
- `src/desktop/bridge.ts`: renderer-side stream request, result, event, and client interfaces.
- `src/desktop/glmClient.test.ts`: GLM SSE and request tests.
- `src/desktop/advisorBridge.test.ts`: source-contract checks for main/preload channels and credential boundaries.
- `src/features/advisor/AdvisorWorkspace.tsx`: progressive conversation state, cancellation, fallback behavior, and Streamdown rendering.
- `src/features/advisor/AdvisorWorkspace.test.tsx`: progressive rendering, cancellation, fallback, and citations.
- `src/styles.css`: compact Markdown and stop-button styles.
- `package.json`, `package-lock.json`: Streamdown dependency.
- `README.md`: real streaming advisor documentation.

---

### Task 1: Real GLM SSE client

**Files:**
- Modify: `src/desktop/glmClient.test.ts`
- Modify: `electron/glm-client.mjs`
- Modify: `electron/glm-client.d.mts`

**Interfaces:**
- Consumes: existing `GlmRuntimeConfig`, `sanitizeGlmAdvisorRequest`, and injected `getApiKey`.
- Produces: `streamGlmAdvisor({ config, request, fetchImpl, getApiKey, signal, onEvent })`, where `onEvent` receives `{ type: 'delta'; content: string }` and the promise resolves `{ content, model, requestId }`.

- [ ] **Step 1: Write failing streaming tests**

Add tests that construct a byte-split `ReadableStream`, call `streamGlmAdvisor`, and assert the exact deltas and accumulated Markdown:

```ts
const encoder = new TextEncoder()
const body = new ReadableStream({
  start(controller) {
    controller.enqueue(encoder.encode('data: {"id":"req-1","model":"glm-5.2","choices":[{"delta":{"content":"## 结"}}]}\n'))
    controller.enqueue(encoder.encode('\ndata: {"choices":[{"delta":{"content":"论\\n- 要点"}}]}\n\ndata: [DONE]\n\n'))
    controller.close()
  },
})
const deltas: string[] = []
const result = await streamGlmAdvisor({
  config,
  request,
  getApiKey: async () => 'secret',
  fetchImpl: vi.fn(async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } })),
  onEvent: (event) => deltas.push(event.content),
})
expect(deltas.join('')).toBe('## 结论\n- 要点')
expect(result).toMatchObject({ content: '## 结论\n- 要点', model: 'glm-5.2', requestId: 'req-1' })
```

Also assert `stream: true`, `[DONE]` termination, split UTF-8 decoding, HTTP JSON errors, unreadable bodies, empty completions, malformed SSE JSON, and caller cancellation.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run src/desktop/glmClient.test.ts`

Expected: FAIL because `streamGlmAdvisor` is not exported.

- [ ] **Step 3: Implement incremental SSE parsing**

Implement an internal async decoder that preserves partial lines and parses only `data:` payloads:

```js
async function consumeSse(body, onPayload, signal) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError')
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const frames = buffer.split(/\r?\n\r?\n/)
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith('data:')) await onPayload(line.slice(5).trim())
      }
    }
    if (done) break
  }
  if (buffer.trim()) {
    for (const line of buffer.split(/\r?\n/)) {
      if (line.startsWith('data:')) await onPayload(line.slice(5).trim())
    }
  }
}
```

Build `streamGlmAdvisor` with `stream: true`, `Accept: text/event-stream`, a combined 60-second timeout/caller signal, metadata capture, `choices[0].delta.content` callbacks, and `[DONE]` handling. Retain `requestGlmAdvisor` as a compatibility wrapper or its current non-streaming implementation.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run src/desktop/glmClient.test.ts`

Expected: all GLM client tests pass.

- [ ] **Step 5: Commit and push**

Switch to `UnoxyRich`, commit `feat: stream GLM advisor responses`, then push `main`.

---

### Task 2: Request-scoped Electron IPC bridge

**Files:**
- Create: `src/desktop/advisorBridge.test.ts`
- Modify: `electron/main.mjs`
- Modify: `electron/preload.cjs`
- Modify: `src/desktop/bridge.ts`

**Interfaces:**
- Consumes: `streamGlmAdvisor` from Task 1.
- Produces: `LiveAdvisorClient.stream`, `LiveAdvisorClient.cancel`, and `LiveAdvisorClient.onEvent` with request-scoped `start | delta | complete | error | cancelled` events.

- [ ] **Step 1: Write failing bridge contract tests**

Read the main/preload sources and assert all three channels exist, the event listener unregisters, and sensitive fields never appear in renderer payload code:

```ts
for (const channel of ['rehoyo:advisor:stream', 'rehoyo:advisor:cancel', 'rehoyo:advisor:event']) {
  expect(`${mainSource}\n${preloadSource}`).toContain(channel)
}
expect(preloadSource).toContain("ipcRenderer.removeListener('rehoyo:advisor:event', handler)")
expect(preloadSource).not.toContain('apiKey')
```

- [ ] **Step 2: Run focused bridge tests and verify RED**

Run: `npx vitest run src/desktop/advisorBridge.test.ts`

Expected: FAIL because the streaming channels are absent.

- [ ] **Step 3: Implement main-process request ownership**

Add an `activeAdvisorStreams` map keyed by `${sender.id}:${requestId}`. Validate request IDs to 160 characters, reject duplicates, forward normalized events, abort on cancel or sender destruction, and clean the map/listener in `finally`:

```js
const sendAdvisorEvent = (sender, payload) => {
  if (!sender.isDestroyed()) sender.send('rehoyo:advisor:event', payload)
}
ipcMain.handle('rehoyo:advisor:stream', async (event, input) => {
  const requestId = String(input?.requestId || '').trim().slice(0, 160)
  const controller = new AbortController()
  const key = `${event.sender.id}:${requestId}`
  activeAdvisorStreams.set(key, controller)
  sendAdvisorEvent(event.sender, { requestId, type: 'start', model: currentGlmConfig().model })
  try {
    const result = await streamGlmAdvisor({
      config: currentGlmConfig(),
      request: sanitizeGlmAdvisorRequest(input?.request),
      getApiKey: () => connectionManager.getApiKey(),
      signal: controller.signal,
      onEvent: ({ content }) => sendAdvisorEvent(event.sender, { requestId, type: 'delta', content }),
    })
    sendAdvisorEvent(event.sender, { requestId, type: 'complete', model: result.model })
    return { ok: true, ...result }
  } finally {
    activeAdvisorStreams.delete(key)
  }
})
```

Map aborts to `cancelled`, other failures to `error`, and never send the request or provider payload back as an event.

- [ ] **Step 4: Expose typed preload methods**

Expose:

```js
stream: (input) => ipcRenderer.invoke('rehoyo:advisor:stream', input),
cancel: (requestId) => ipcRenderer.invoke('rehoyo:advisor:cancel', requestId),
onEvent: (listener) => {
  if (typeof listener !== 'function') return () => {}
  const handler = (_event, payload) => listener(payload)
  ipcRenderer.on('rehoyo:advisor:event', handler)
  return () => ipcRenderer.removeListener('rehoyo:advisor:event', handler)
},
```

Define the same payload union in `src/desktop/bridge.ts` and replace renderer reliance on `ask` with `stream`.

- [ ] **Step 5: Run bridge and GLM tests**

Run: `npx vitest run src/desktop/advisorBridge.test.ts src/desktop/glmClient.test.ts`

Expected: both files pass.

- [ ] **Step 6: Commit and push**

Switch to `maybebebee`, commit `feat: bridge advisor stream events`, then push `main`.

---

### Task 3: Progressive Streamdown advisor UI

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/features/advisor/AdvisorWorkspace.test.tsx`
- Modify: `src/features/advisor/AdvisorWorkspace.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: Task 2 `LiveAdvisorClient` stream methods and events.
- Produces: a single active, cancellable Markdown answer with stable evidence citations.

- [ ] **Step 1: Install Streamdown**

Run: `npm install streamdown@latest`

Expected: `streamdown` appears under dependencies and the lockfile updates.

- [ ] **Step 2: Write failing progressive UI tests**

Build a fake client that captures the event listener and emits deltas while its stream promise is active:

```ts
let emit: (event: LiveAdvisorStreamEvent) => void = () => {}
const liveAdvisor: LiveAdvisorClient = {
  getStatus: vi.fn(async () => ({ configured: true, endpoint: 'open.bigmodel.cn', model: 'glm-5.2' })),
  onEvent: vi.fn((listener) => { emit = listener; return vi.fn() }),
  stream: vi.fn(async ({ requestId }) => {
    emit({ requestId, type: 'delta', content: '## 地区结论\n\n- 中国：强度' })
    emit({ requestId, type: 'complete', model: 'glm-5.2' })
    return { ok: true, content: '## 地区结论\n\n- 中国：强度', model: 'glm-5.2', requestId }
  }),
  cancel: vi.fn(async () => ({ ok: true })),
}
```

Assert a level-two heading and list item render, evidence buttons remain, the submit button changes to `停止生成`, cancellation calls `cancel`, pre-delta errors use the local answer, post-delta errors keep partial Markdown, and unsubscribe runs on unmount.

- [ ] **Step 3: Run the component test and verify RED**

Run: `npx vitest run src/features/advisor/AdvisorWorkspace.test.tsx`

Expected: FAIL because `stream`, lifecycle events, and Markdown rendering are not wired.

- [ ] **Step 4: Implement progressive state and cleanup**

Import `Streamdown`, subscribe once per client, append an empty live turn before calling `stream`, and update only the matching request turn:

```tsx
<div className="advisor-markdown">
  <Streamdown mode={turn.streamState === 'streaming' ? 'streaming' : 'static'} isAnimating={turn.streamState === 'streaming'}>
    {turn.answer}
  </Streamdown>
</div>
```

Use `activeRequestIdRef` to reject stale events. `stopGenerating` calls `advisorClient.cancel(requestId)`. On unmount, unsubscribe and cancel the active request. Preserve partial text on post-delta errors; replace only empty output with the existing grounded fallback.

- [ ] **Step 5: Style Markdown and the stop action**

Add compact rules under `.advisor-markdown` for headings, paragraphs, lists, blockquotes, tables, links, and code. Ensure long code scrolls horizontally and links retain visible focus. Add `.advisor-composer button.is-stop` with a neutral risk color and no gradient.

- [ ] **Step 6: Run component and accessibility-focused tests**

Run: `npx vitest run src/features/advisor/AdvisorWorkspace.test.tsx`

Expected: all advisor tests pass with no React act warnings.

- [ ] **Step 7: Commit and push**

Switch to `UnoxyRich`, commit `feat: render streaming advisor markdown`, then push `main`.

---

### Task 4: Documentation and full verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: completed behavior from Tasks 1-3.
- Produces: user-facing setup and behavior documentation.

- [ ] **Step 1: Document the streaming advisor**

Update the advisor section to state that GLM output uses real SSE, Markdown is rendered by Streamdown, Stop preserves partial content, API keys remain encrypted/main-process only, and evidence chips are local grounded references.

- [ ] **Step 2: Run formatting and source checks**

Run: `git diff --check`

Expected: exit code 0.

- [ ] **Step 3: Run the complete unit/build suite**

Run: `npm run check`

Expected: all Vitest files pass and Vite production build succeeds.

- [ ] **Step 4: Run renderer E2E**

Run: `npm run test:e2e`

Expected: all renderer critical-path scenarios pass.

- [ ] **Step 5: Run Electron E2E**

Run: `npm run test:electron`

Expected: the packaged Electron smoke/persistence scenario passes without console errors.

- [ ] **Step 6: Commit and push**

Switch to `maybebebee`, commit `docs: document streaming advisor`, then push `main`.

