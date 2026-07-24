import { RELEASE_STORAGE_KEY, type ReleaseProject } from './release-project'

const MAX_PROJECTS = 12

interface StoredReleaseProjects {
  version: 1
  projects: ReleaseProject[]
}

function isHttps(value: unknown) {
  try {
    return new URL(String(value)).protocol === 'https:'
  } catch {
    return false
  }
}

function assertProject(project: ReleaseProject) {
  if (!project || typeof project !== 'object' || !project.id || !project.game || !project.version || !Array.isArray(project.regions)) {
    throw new Error('发行项目存储结构无效。')
  }
  if (!project.brief || !Array.isArray(project.brief.sellingPoints) || !project.brief.sellingPoints.length) {
    throw new Error('发行项目缺少版本Brief。')
  }
  const evidence = project.researchSnapshot?.evidence
  if (evidence && (!Array.isArray(evidence) || evidence.some((item) => item.synthetic !== false || !isHttps(item.url)))) {
    throw new Error('发行项目不能保存模拟或不可验证的 synthetic 证据。')
  }
  if (project.currentPlan && project.currentPlan.projectId !== project.id) throw new Error('发行方案不属于当前项目。')
}

export function loadReleaseProjects(): ReleaseProject[] {
  const raw = localStorage.getItem(RELEASE_STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Partial<StoredReleaseProjects>
    if (parsed.version !== 1 || !Array.isArray(parsed.projects)) throw new Error('Invalid release storage')
    parsed.projects.forEach(assertProject)
    return parsed.projects.map((project) => ({ ...project, characterExecutions: Array.isArray(project.characterExecutions) ? project.characterExecutions : [] }))
  } catch {
    localStorage.removeItem(RELEASE_STORAGE_KEY)
    return []
  }
}

export function saveReleaseProject(project: ReleaseProject) {
  assertProject(project)
  const projects = [project, ...loadReleaseProjects().filter((item) => item.id !== project.id)]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, MAX_PROJECTS)
  const value: StoredReleaseProjects = { version: 1, projects }
  localStorage.setItem(RELEASE_STORAGE_KEY, JSON.stringify(value))
}

export function findReleaseProject(projectId: string) {
  return loadReleaseProjects().find((project) => project.id === projectId)
}
