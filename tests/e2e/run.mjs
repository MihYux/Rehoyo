import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
const playwrightCli = fileURLToPath(
  new URL('../../node_modules/@playwright/test/cli.js', import.meta.url),
)
const playwrightConfig = fileURLToPath(new URL('../../playwright.config.ts', import.meta.url))

process.env.VITE_REHOYO_CLOCK_SCALE = '50'

const renderer = await createServer({
  root: projectRoot,
  logLevel: 'error',
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
})

let playwrightProcess
let shuttingDown = false

async function shutdown(exitCode) {
  if (shuttingDown) return
  shuttingDown = true

  if (playwrightProcess && playwrightProcess.exitCode === null) {
    playwrightProcess.kill()
  }

  await renderer.close()
  process.exitCode = exitCode
}

process.once('SIGINT', () => void shutdown(130))
process.once('SIGTERM', () => void shutdown(143))

try {
  await renderer.listen()

  playwrightProcess = spawn(
    process.execPath,
    [playwrightCli, 'test', '--config', playwrightConfig, ...process.argv.slice(2)],
    {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    },
  )

  const exitCode = await new Promise((resolve, reject) => {
    playwrightProcess.once('error', reject)
    playwrightProcess.once('exit', (code, signal) => {
      resolve(code ?? (signal ? 1 : 0))
    })
  })

  await shutdown(exitCode)
} catch (error) {
  console.error(error)
  await shutdown(1)
}
