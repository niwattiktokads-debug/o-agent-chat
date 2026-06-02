import React, { useEffect, useState } from 'react'
import { fetchWorkspaces } from '../../lib/omniApi.js'

/**
 * WorkspacePanel — displays workspace/tenant runtime status on the Settings page.
 * Part of Private SaaS v1 Foundation.
 */
export default function WorkspacePanel({ snapshot }) {
  const [workspaces, setWorkspaces] = useState([])
  const [status, setStatus] = useState('')

  useEffect(() => {
    // Derive workspaces from snapshot if available (avoids extra fetch)
    if (snapshot?.workspaces?.length) {
      setWorkspaces(snapshot.workspaces)
      return
    }
    // Fallback: fetch from API
    fetchWorkspaces()
      .then((data) => setWorkspaces(data || []))
      .catch((error) => setStatus(error.message))
  }, [snapshot])

  if (!workspaces.length && !status) return null

  const pages = snapshot?.pages || []

  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-4">
      <h2 className="text-sm font-bold text-[var(--color-ink)]">Workspace / Tenant</h2>
      <p className="mt-1 text-xs text-[var(--color-ink-2)]">
        Private SaaS workspace foundation — แสดงสถานะ runtime ของ workspace ที่ใช้งานอยู่
      </p>
      {status ? (
        <p className="mt-2 text-xs font-semibold text-[var(--color-muted)]">{status}</p>
      ) : null}
      <div className="mt-3 divide-y divide-[var(--color-rule)]">
        {workspaces.map((ws) => {
          const wsPages = pages.filter((page) => page.workspaceId === ws.id)
          return (
            <div key={ws.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-[var(--color-ink)]">{ws.name}</p>
                  <p className="text-xs text-[var(--color-muted)]">{ws.id} &middot; {ws.plan}</p>
                </div>
                <span
                  className={`rounded-[var(--radius-md)] border px-2 py-1 text-xs font-bold ${
                    ws.status === 'active'
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-ink)]'
                      : 'border-[var(--color-rule)] bg-[var(--color-paper)] text-[var(--color-ink-2)]'
                  }`}
                >
                  {ws.status}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <MiniMetric label="Pages" value={String(wsPages.length)} />
                <MiniMetric label="Owner" value={ws.ownerRef || '-'} />
                <MiniMetric label="Updated" value={ws.updatedAt ? new Date(ws.updatedAt).toLocaleDateString('th-TH') : '-'} />
              </div>
              <div className="mt-2 rounded-[var(--radius-md)] border border-[var(--color-accent)] bg-[var(--color-accent-subtle,var(--color-panel-2))] px-3 py-2 text-xs text-[var(--color-ink-2)]">
                Settings scope: <span className="font-bold">{ws.id}</span>
              </div>
              {wsPages.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {wsPages.map((page) => (
                    <span
                      key={page.id}
                      className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-2 py-0.5 text-xs font-semibold text-[var(--color-ink-2)]"
                    >
                      {page.name}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function MiniMetric({ label, value }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-2 py-1.5 text-center">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">{label}</p>
      <p className="text-xs font-bold text-[var(--color-ink)]">{value}</p>
    </div>
  )
}
