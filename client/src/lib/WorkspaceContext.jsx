import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { fetchWorkspaces } from './omniApi.js'

const WorkspaceContext = createContext({
  workspaces: [],
  activeWorkspaceId: null,
  setActiveWorkspaceId: () => {},
  activeWorkspace: null,
  loading: false,
})

export function WorkspaceProvider({ children }) {
  const [workspaces, setWorkspaces] = useState([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(() => {
    // Persist in sessionStorage for client-only preference
    return sessionStorage.getItem('omni_active_workspace') || null
  })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchWorkspaces()
      setWorkspaces(data || [])
      // Auto-select first workspace if none selected
      if (!activeWorkspaceId && data?.length) {
        const defaultWs = data.find((ws) => ws.id === 'ws_oagent') || data[0]
        setActiveWorkspaceId(defaultWs.id)
      }
    } catch {
      // Silently fail — workspace list is optional
    } finally {
      setLoading(false)
    }
  }, [activeWorkspaceId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (activeWorkspaceId) {
      sessionStorage.setItem('omni_active_workspace', activeWorkspaceId)
    }
  }, [activeWorkspaceId])

  const activeWorkspace = workspaces.find((ws) => ws.id === activeWorkspaceId) || null

  return (
    <WorkspaceContext.Provider value={{ workspaces, activeWorkspaceId, setActiveWorkspaceId, activeWorkspace, loading }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  return useContext(WorkspaceContext)
}

/**
 * WorkspaceSelector — compact dropdown for selecting active workspace.
 * Place in headers/toolbars where workspace context should be visible.
 */
export function WorkspaceSelector({ className = '' }) {
  const { workspaces, activeWorkspaceId, setActiveWorkspaceId } = useWorkspace()

  if (workspaces.length <= 1) return null

  return (
    <label className={`inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-muted)] ${className}`}>
      <span className="whitespace-nowrap">Workspace</span>
      <select
        value={activeWorkspaceId || ''}
        onChange={(event) => setActiveWorkspaceId(event.target.value)}
        className="min-w-32 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-2 py-1.5 text-xs font-bold text-[var(--color-ink)]"
      >
        {workspaces.map((ws) => (
          <option key={ws.id} value={ws.id}>{ws.name} ({ws.id})</option>
        ))}
      </select>
    </label>
  )
}

/**
 * WorkspaceBadge — small inline badge showing the active workspace name.
 */
export function WorkspaceBadge({ workspaceId, className = '' }) {
  const { workspaces } = useWorkspace()
  const ws = workspaces.find((w) => w.id === workspaceId)
  const label = ws ? ws.name : workspaceId || 'ws_oagent'

  return (
    <span className={`inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-accent)] bg-[var(--color-accent-subtle,var(--color-panel-2))] px-2 py-0.5 text-[11px] font-bold text-[var(--color-accent)] ${className}`}>
      {label}
    </span>
  )
}
