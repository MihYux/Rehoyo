# Secure First-Run Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen first-run connection gate that accepts a GLM API key and the fixed BigModel Coding endpoint, stores the key with Electron `safeStorage`, and unlocks the existing ReHoYo routes without exposing credentials to the renderer after submission.

**Architecture:** A focused `ConnectionManager` in the Electron main process owns validation, source precedence, encrypted persistence, session fallback, and key access. Preload exposes a narrow status/save/clear bridge; React mounts the existing router only after the bridge reports a configured connection. Advisor and research clients consume an injected `getApiKey()` provider so key-file and encrypted credentials share one request path.

**Tech Stack:** Electron 43 `safeStorage` and IPC, Node filesystem promises, React 19, TypeScript 7, Vitest 4, Testing Library, Playwright Electron.

## Global Constraints

- The only permitted endpoint is exactly `https://open.bigmodel.cn/api/coding/paas/v4` after trailing-slash normalization.
- Never persist a plaintext API key or expose a saved key, encrypted value, or key-file path to the renderer.
- If `safeStorage` is unavailable, retain the key only in Electron main-process memory for the current session.
- Existing environment, launch argument, and external key-file configuration remains highest priority.
- The first-run screen has only two inputs and one primary action; it uses a white flat layout and opacity-only motion.
- Do not alter Agent research, report derivation, or task storage behavior beyond injecting the new key provider.
- Automated tests never make a real BigModel request or use a real API key.

---

## File Map

- Create `electron/connection-manager.mjs`: validate connection input; load, encrypt, save, clear, and provide credentials.
- Create `electron/connection-manager.d.mts`: public types for TypeScript tests and imports.
- Create `src/desktop/connectionManager.test.ts`: deterministic unit tests with injected filesystem and encryption adapters.
- Modify `electron/glm-client.mjs` and `.d.mts`: accept `getApiKey` while preserving `readKeyFile` compatibility.
- Modify `electron/research-client.mjs` and `.d.mts`: accept `getApiKey` while preserving `readKeyFile` compatibility.
- Modify `electron/main.mjs`: initialize the manager and register connection, advisor, and research IPC handlers.
- Modify `electron/preload.cjs`: expose the connection bridge.
- Modify `src/desktop/bridge.ts`: add renderer-safe connection types and accessor.
- Create `src/features/connection/ConnectionGate.tsx`: first-run and settings connection UI.
- Create `src/features/connection/ConnectionGate.test.tsx`: gate behavior and credential-clearing tests.
- Modify `src/App.tsx` and `src/App.test.tsx`: gate all routes until configured.
- Modify `src/styles.css`: white full-screen flat connection visual and opacity-only transition.
- Modify `tests/electron/app.spec.ts`: isolated-userData first-run, encrypted persistence, restart, and clear tests.

### Task 1: Connection manager and encrypted persistence

**Files:**
- Create: `electron/connection-manager.mjs`
- Create: `electron/connection-manager.d.mts`
- Create: `src/desktop/connectionManager.test.ts`

**Interfaces:**
- Consumes: injected `userDataPath`, `safeStorage`, filesystem methods, optional external config and provider.
- Produces: `createConnectionManager(options)`, `sanitizeConnectionInput(value)`, `BIGMODEL_CODING_ENDPOINT`, and manager methods `initialize()`, `getStatus()`, `save()`, `clear()`, `getApiKey()`.

- [ ] **Step 1: Write failing validation and encrypted round-trip tests**

```ts
const manager = createConnectionManager({
  userDataPath: 'C:/test-user-data',
  safeStorage: fakeSafeStorage,
  fs: fakeFs,
})
await manager.initialize()
await manager.save({ apiKey: 'private-test-key', endpoint: BIGMODEL_CODING_ENDPOINT })
expect(await manager.getApiKey()).toBe('private-test-key')
expect(fakeFs.text()).not.toContain('private-test-key')
expect(manager.getStatus()).toMatchObject({ configured: true, persistence: 'encrypted' })
expect(() => sanitizeConnectionInput({ apiKey: 'x', endpoint: 'https://evil.example' })).toThrow(/BigModel/)
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npx vitest run src/desktop/connectionManager.test.ts`

Expected: FAIL because `electron/connection-manager.mjs` does not exist.

- [ ] **Step 3: Implement strict validation, source precedence, encrypted JSON, session fallback, corruption recovery, and clear**

```js
export const BIGMODEL_CODING_ENDPOINT = 'https://open.bigmodel.cn/api/coding/paas/v4'

export function sanitizeConnectionInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw connectionError('INVALID_INPUT')
  const keys = Object.keys(value)
  if (keys.some((key) => !['apiKey', 'endpoint'].includes(key))) throw connectionError('INVALID_INPUT')
  const apiKey = typeof value.apiKey === 'string' ? value.apiKey.trim() : ''
  const endpoint = typeof value.endpoint === 'string' ? value.endpoint.trim().replace(/\/+$/, '') : ''
  if (!apiKey || apiKey.length > 4096) throw connectionError('INVALID_API_KEY')
  if (endpoint !== BIGMODEL_CODING_ENDPOINT) throw connectionError('UNSUPPORTED_ENDPOINT')
  return { apiKey, endpoint }
}
```

The manager writes `{ version: 1, provider: 'bigmodel', endpoint, model: 'glm-5.2', encryptedApiKey, updatedAt }` through a same-directory temporary file and rename. `getStatus()` returns only configured/provider/endpoint/endpointHost/model/persistence/warning.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `npx vitest run src/desktop/connectionManager.test.ts`

Expected: all connection manager tests pass with zero failures.

- [ ] **Step 5: Commit and push**

```powershell
gh auth switch --hostname github.com --user UnoxyRich
git add electron/connection-manager.mjs electron/connection-manager.d.mts src/desktop/connectionManager.test.ts
git commit -m "feat: add encrypted connection manager"
git push origin main
```

### Task 2: Inject credentials into advisor and research clients

**Files:**
- Modify: `electron/glm-client.mjs`
- Modify: `electron/glm-client.d.mts`
- Modify: `electron/research-client.mjs`
- Modify: `electron/research-client.d.mts`
- Modify: `src/desktop/glmClient.test.ts`
- Modify: `src/desktop/researchClient.test.ts`

**Interfaces:**
- Consumes: `getApiKey?: () => Promise<string>` supplied by `ConnectionManager`.
- Produces: request functions that prefer `getApiKey`, with the current `readKeyFile(config.keyFile)` path as backward-compatible fallback.

- [ ] **Step 1: Add failing provider tests**

```ts
await requestGlmAdvisor({
  config: { ...config, configured: true, keyFile: '' },
  request,
  getApiKey: vi.fn(async () => 'provider-test-key'),
  fetchImpl,
})
expect(fetchImpl.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer provider-test-key' })
```

Add the equivalent `runLiveResearch` test using its existing mocked fetch orchestration.

- [ ] **Step 2: Run both suites and confirm RED**

Run: `npx vitest run src/desktop/glmClient.test.ts src/desktop/researchClient.test.ts`

Expected: provider-only configurations fail because clients still read an empty key-file path.

- [ ] **Step 3: Implement the shared resolution rule**

```js
async function resolveApiKey({ config, getApiKey, readKeyFile }) {
  const value = getApiKey ? await getApiKey() : await readKeyFile(config.keyFile)
  const apiKey = String(value || '').trim()
  if (!apiKey) throw new Error('GLM API key is empty.')
  return apiKey
}
```

Use the resolved key only to construct the Authorization header and never return it.

- [ ] **Step 4: Run both suites and confirm GREEN**

Run: `npx vitest run src/desktop/glmClient.test.ts src/desktop/researchClient.test.ts`

Expected: all existing key-file tests and new provider tests pass.

- [ ] **Step 5: Commit and push**

```powershell
gh auth switch --hostname github.com --user maybebebee
git add electron/glm-client.mjs electron/glm-client.d.mts electron/research-client.mjs electron/research-client.d.mts src/desktop/glmClient.test.ts src/desktop/researchClient.test.ts
git commit -m "refactor: inject GLM credential provider"
git push origin main
```

### Task 3: Electron IPC and preload bridge

**Files:**
- Modify: `electron/main.mjs`
- Modify: `electron/preload.cjs`
- Modify: `src/desktop/bridge.ts`
- Modify: `src/desktop/glmClient.test.ts`

**Interfaces:**
- Consumes: `ConnectionManager` and its sanitized status.
- Produces: renderer bridge `connection.getStatus()`, `connection.save(input)`, and `connection.clear()`.

- [ ] **Step 1: Add failing bridge-contract tests**

```ts
expect(source).toContain("ipcRenderer.invoke('rehoyo:connection:status')")
expect(source).toContain("ipcRenderer.invoke('rehoyo:connection:save', input)")
expect(source).toContain("ipcRenderer.invoke('rehoyo:connection:clear')")
expect(source).not.toContain('encryptedApiKey')
```

- [ ] **Step 2: Run the focused suite and confirm RED**

Run: `npx vitest run src/desktop/glmClient.test.ts`

Expected: FAIL because no connection bridge exists.

- [ ] **Step 3: Initialize the manager after `app.whenReady()`, register IPC, and route all model calls through `getApiKey`**

```js
ipcMain.handle('rehoyo:connection:status', () => connectionManager.getStatus())
ipcMain.handle('rehoyo:connection:save', async (_event, input) => connectionManager.save(input))
ipcMain.handle('rehoyo:connection:clear', async () => connectionManager.clear())
```

The main process derives its public GLM and research status from `connectionManager.getStatus()` and passes `getApiKey: () => connectionManager.getApiKey()` into advisor and research requests.

- [ ] **Step 4: Run the bridge/client suites and confirm GREEN**

Run: `npx vitest run src/desktop/glmClient.test.ts src/desktop/researchClient.test.ts src/desktop/electronConfig.test.ts`

Expected: all tests pass and no bridge response includes credential material.

- [ ] **Step 5: Commit and push**

```powershell
gh auth switch --hostname github.com --user UnoxyRich
git add electron/main.mjs electron/preload.cjs src/desktop/bridge.ts src/desktop/glmClient.test.ts
git commit -m "feat: expose secure connection IPC"
git push origin main
```

### Task 4: React full-screen connection gate

**Files:**
- Create: `src/features/connection/ConnectionGate.tsx`
- Create: `src/features/connection/ConnectionGate.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `getConnectionClient()` returning the connection bridge.
- Produces: `<ConnectionGate>{existing app routes}</ConnectionGate>` that mounts children only when configured.

- [ ] **Step 1: Write failing gate tests**

```tsx
render(<ConnectionGate><h1>任务大厅</h1></ConnectionGate>)
expect(await screen.findByRole('heading', { name: '连接 ReHoYo' })).toBeVisible()
expect(screen.queryByRole('heading', { name: '任务大厅' })).not.toBeInTheDocument()
await user.type(screen.getByLabelText('API Key'), 'private-ui-test-key')
await user.click(screen.getByRole('button', { name: '连接并进入' }))
expect(await screen.findByRole('heading', { name: '任务大厅' })).toBeVisible()
expect(screen.getByLabelText('API Key')).toHaveValue('')
```

Cover preconfigured startup, missing desktop bridge, rejected save, keyboard submit, and session-only warning.

- [ ] **Step 2: Run component tests and confirm RED**

Run: `npx vitest run src/features/connection/ConnectionGate.test.tsx src/App.test.tsx`

Expected: FAIL because the gate component and connection bridge types do not exist.

- [ ] **Step 3: Implement the state machine and flat full-screen UI**

```tsx
type GateState = 'checking' | 'required' | 'saving' | 'ready' | 'error'

export function ConnectionGate({ children }: PropsWithChildren) {
  const client = getConnectionClient()
  // Query status on mount; submit FormData directly; clear the password input
  // immediately after IPC settles; render children only in ready state.
}
```

Use the transparent logo, Chinese copy, native password input, visible labels, `aria-live` status, 44px minimum controls, a maximum 560px card, white background, no gradients, and only an opacity animation.

- [ ] **Step 4: Run component tests and confirm GREEN**

Run: `npx vitest run src/features/connection/ConnectionGate.test.tsx src/App.test.tsx`

Expected: all tests pass; existing route tests install a configured connection mock.

- [ ] **Step 5: Commit and push**

```powershell
gh auth switch --hostname github.com --user maybebebee
git add src/features/connection/ConnectionGate.tsx src/features/connection/ConnectionGate.test.tsx src/App.tsx src/App.test.tsx src/styles.css
git commit -m "feat: add first-run connection screen"
git push origin main
```

### Task 5: Electron persistence path and full verification

**Files:**
- Modify: `tests/electron/app.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: packaged renderer, connection IPC, Electron `userData` path.
- Produces: regression coverage proving encrypted persistence across restart and documenting first-run setup.

- [ ] **Step 1: Replace the unconfigured-lobby Electron expectation with a failing first-run flow**

```ts
await expect(page.getByRole('heading', { name: '连接 ReHoYo' })).toBeVisible()
await page.getByLabel('API Key').fill('electron-e2e-private-key')
await page.getByLabel('API Endpoint').fill('https://open.bigmodel.cn/api/coding/paas/v4')
await page.getByRole('button', { name: '连接并进入' }).click()
await expect(page.getByRole('heading', { name: /听见全球玩家/ })).toBeVisible()
expect(await fs.readFile(connectionPath, 'utf8')).not.toContain('electron-e2e-private-key')
```

Launch with an isolated temporary `--user-data-dir`, restart against the same directory, verify the lobby appears without the gate, then call `connection.clear()` and verify the gate returns.

- [ ] **Step 2: Build and run Electron test to confirm RED before implementation completion**

Run: `npm run test:electron`

Expected before Tasks 1–4: first-run assertions fail. Expected now: pass after updating the test harness for the implemented behavior.

- [ ] **Step 3: Update README startup configuration documentation**

Document the recommended in-app first-run flow, encrypted local persistence, session fallback, and unchanged key-file option. Do not include a real key or secret-shaped example.

- [ ] **Step 4: Run complete fresh verification**

Run: `npm run check`

Expected: Vitest and production build complete with zero failures.

Run: `npm run test:electron`

Expected: Electron Playwright suite completes with zero failures and confirms no plaintext test key in the stored JSON.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 5: Commit and push**

```powershell
gh auth switch --hostname github.com --user UnoxyRich
git add tests/electron/app.spec.ts README.md
git commit -m "test: verify secure first-run persistence"
git push origin main
```

## Self-Review Result

- Spec coverage: first-run UX, exact endpoint allowlist, encrypted and session storage, corrupted store recovery, external config precedence, IPC redaction, provider injection, accessibility, Electron persistence, and README documentation are assigned to concrete tasks.
- Placeholder scan: the plan contains no deferred implementation markers; every task names exact files, commands, interfaces, and expected results.
- Type consistency: the plan consistently uses `ConnectionStatus`, `ConnectionBridge`, `createConnectionManager`, `getApiKey`, and `BIGMODEL_CODING_ENDPOINT` across main, preload, renderer, and tests.
