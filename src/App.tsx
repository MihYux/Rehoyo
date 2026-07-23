import { useCallback, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { createCustomPreset, getPresetById } from './data/presets'
import { startTask } from './domain/engine'
import { loadCompletedTasks, saveCompletedTask } from './domain/storage'
import type { AnalysisPreset, RuntimeTask } from './domain/types'
import { TaskLobby } from './features/lobby/TaskLobby'
import { TaskWorkspace } from './features/workspace/TaskWorkspace'

interface ActiveSession {
  preset: AnalysisPreset
  task: RuntimeTask
}

function resolvePreset(task: RuntimeTask): AnalysisPreset {
  const known = getPresetById(task.presetId)
  if (known) return known
  return createCustomPreset(task.gameName, task.versionTitle.replace(/^CUSTOM\s*/, ''))
}

function GuardedRun({
  session,
  onComplete,
}: {
  session: ActiveSession | null
  onComplete: (task: RuntimeTask) => void
}) {
  const { taskId } = useParams()
  if (!session || session.task.id !== taskId) return <Navigate replace to="/" />
  return (
    <TaskWorkspace
      preset={session.preset}
      initialTask={session.task}
      onComplete={onComplete}
    />
  )
}

export function AppRoutes() {
  const navigate = useNavigate()
  const [session, setSession] = useState<ActiveSession | null>(null)
  const [recentTasks, setRecentTasks] = useState<RuntimeTask[]>(() => loadCompletedTasks())

  const handleStart = (preset: AnalysisPreset) => {
    const task = startTask(preset)
    setSession({ preset, task })
    navigate(`/tasks/${encodeURIComponent(task.id)}/run`)
  }

  const handleOpenReport = (task: RuntimeTask) => {
    setSession({ task, preset: resolvePreset(task) })
    navigate(`/tasks/${encodeURIComponent(task.id)}/report?tab=overview`)
  }

  const handleComplete = useCallback((task: RuntimeTask) => {
    saveCompletedTask(task)
    setSession((current) => current ? { ...current, task } : current)
    setRecentTasks(loadCompletedTasks())
    navigate(`/tasks/${encodeURIComponent(task.id)}/report?tab=overview`)
  }, [navigate])

  return (
    <>
      <div className="app-desktop">
        <Routes>
          <Route
            path="/"
            element={
              <TaskLobby
                recentTasks={recentTasks}
                onStart={handleStart}
                onOpenReport={handleOpenReport}
              />
            }
          />
          <Route
            path="/tasks/:taskId/run"
            element={<GuardedRun session={session} onComplete={handleComplete} />}
          />
          <Route path="/tasks/:taskId/report" element={<Navigate replace to="/" />} />
          <Route path="/tasks/:taskId/advisor" element={<Navigate replace to="/" />} />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </div>
      <div className="desktop-warning">
        <div>
          <strong>ReHoYo 指挥中心需要桌面视野</strong>
          <p>请使用宽度不低于 1280px 的浏览器打开完整 Agent 工作空间。</p>
        </div>
      </div>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
