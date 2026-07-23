import { lazy, Suspense, useCallback, useState } from 'react'
import {
  HashRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { startTask } from './domain/engine'
import { isCompletedGroundedTask } from './domain/grounding'
import { loadCompletedTasks, saveCompletedTask } from './domain/storage'
import type { AnalysisPreset, RuntimeTask } from './domain/types'
import { ConnectionGate } from './features/connection/ConnectionGate'
import { TaskLobby } from './features/lobby/TaskLobby'
import type { ReportTab } from './features/report/ReportDashboard'

const TaskWorkspace = lazy(() =>
  import('./features/workspace/TaskWorkspace').then((module) => ({ default: module.TaskWorkspace })),
)
const ReportDashboard = lazy(() =>
  import('./features/report/ReportDashboard').then((module) => ({ default: module.ReportDashboard })),
)
const AdvisorWorkspace = lazy(() =>
  import('./features/advisor/AdvisorWorkspace').then((module) => ({ default: module.AdvisorWorkspace })),
)

interface ActiveSession {
  preset: AnalysisPreset
  task: RuntimeTask
}

function GuardedRun({
  session,
  onComplete,
}: {
  session: ActiveSession | null
  onComplete: (task: RuntimeTask, preset?: AnalysisPreset) => void
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

const reportTabs: ReportTab[] = ['overview', 'regions', 'controversies', 'strategy']

function completedSessionFor(
  taskId: string | undefined,
  session: ActiveSession | null,
  recentTasks: RuntimeTask[],
): ActiveSession | null {
  if (!taskId) return null
  if (session?.task.id === taskId && isCompletedGroundedTask(session.task)) {
    return { task: session.task, preset: session.task.presetSnapshot }
  }
  const task = recentTasks.find((item) => item.id === taskId)
  return task && isCompletedGroundedTask(task) ? { task, preset: task.presetSnapshot } : null
}

function GuardedReport({
  session,
  recentTasks,
}: {
  session: ActiveSession | null
  recentTasks: RuntimeTask[]
}) {
  const { taskId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const completed = completedSessionFor(taskId, session, recentTasks)
  if (!completed) return <Navigate replace to="/" />

  const requestedTab = searchParams.get('tab') as ReportTab | null
  const tab = requestedTab && reportTabs.includes(requestedTab) ? requestedTab : 'overview'
  const highlightEvidenceId = searchParams.get('evidence') ?? undefined

  return (
    <ReportDashboard
      preset={completed.preset}
      task={completed.task}
      initialTab={tab}
      highlightEvidenceId={highlightEvidenceId}
      onTabChange={(nextTab) => setSearchParams({ tab: nextTab }, { replace: true })}
      onOpenAdvisor={() => navigate(`/tasks/${encodeURIComponent(completed.task.id)}/advisor`)}
    />
  )
}

function GuardedAdvisor({
  session,
  recentTasks,
}: {
  session: ActiveSession | null
  recentTasks: RuntimeTask[]
}) {
  const { taskId } = useParams()
  const navigate = useNavigate()
  const completed = completedSessionFor(taskId, session, recentTasks)
  if (!completed) return <Navigate replace to="/" />

  return (
    <AdvisorWorkspace
      preset={completed.preset}
      onBackToReport={() => navigate(`/tasks/${encodeURIComponent(completed.task.id)}/report?tab=overview`)}
      onOpenEvidence={(evidenceId, tab) =>
        navigate(`/tasks/${encodeURIComponent(completed.task.id)}/report?tab=${tab}&evidence=${encodeURIComponent(evidenceId)}`)
      }
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
    if (!isCompletedGroundedTask(task)) return
    setSession({ task, preset: task.presetSnapshot })
    navigate(`/tasks/${encodeURIComponent(task.id)}/report?tab=overview`)
  }

  const handleComplete = useCallback((task: RuntimeTask, completedPreset?: AnalysisPreset) => {
    saveCompletedTask(task)
    setSession((current) => current ? { preset: completedPreset ?? current.preset, task } : current)
    setRecentTasks(loadCompletedTasks())
    navigate(`/tasks/${encodeURIComponent(task.id)}/report?tab=overview`)
  }, [navigate])

  return (
    <>
      <div className="app-desktop">
        <Suspense fallback={<div className="route-loading" role="status"><i /> 正在载入智能工作空间…</div>}>
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
            <Route
              path="/tasks/:taskId/report"
              element={<GuardedReport session={session} recentTasks={recentTasks} />}
            />
            <Route
              path="/tasks/:taskId/advisor"
              element={<GuardedAdvisor session={session} recentTasks={recentTasks} />}
            />
            <Route path="*" element={<Navigate replace to="/" />} />
          </Routes>
        </Suspense>
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
    <ConnectionGate>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </ConnectionGate>
  )
}
