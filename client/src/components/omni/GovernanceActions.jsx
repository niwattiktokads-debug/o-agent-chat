import React, { useState } from 'react'
import { applyOmniGovernanceAction } from '../../lib/omniApi.js'

const ACTION_STYLES = {
  archive: 'border-[var(--color-rule)] text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]',
  disable: 'border-[var(--color-warn)] text-[var(--color-warn)] hover:bg-[var(--color-warn-soft)]',
  clear: 'border-[var(--color-ai)] text-[var(--color-ai)] hover:bg-[var(--color-ai-soft)]',
  delete: 'border-[var(--color-danger)] text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]',
}

const ACTION_LABELS = {
  archive: 'Archive',
  disable: 'Disable',
  clear: 'Clear',
  delete: 'Delete',
}

function confirmMessage(objectLabel, action) {
  const label = objectLabel || 'รายการนี้'
  if (action === 'delete') return `ยืนยัน soft-delete ${label} ?`
  if (action === 'clear') return `ยืนยัน clear ${label} ?`
  if (action === 'disable') return `ยืนยัน disable ${label} ?`
  return `ยืนยัน archive ${label} ?`
}

export default function GovernanceActions({
  objectType,
  objectId,
  objectLabel,
  actions = ['archive', 'disable', 'clear', 'delete'],
  onChanged,
  onError,
  disabled = false,
  className = '',
}) {
  const [busyAction, setBusyAction] = useState('')

  async function submit(action) {
    if (!objectId || busyAction || disabled) return
    if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(confirmMessage(objectLabel, action))) return
    setBusyAction(action)
    try {
      const result = await applyOmniGovernanceAction(objectType, objectId, action)
      onChanged?.(result)
    } catch (error) {
      onError?.(error)
    } finally {
      setBusyAction('')
    }
  }

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`.trim()}>
      {actions.map((action) => (
        <button
          key={action}
          type="button"
          disabled={disabled || busyAction === action}
          onClick={() => submit(action)}
          className={`rounded-[var(--radius-sm)] border px-2 py-1 text-[11px] font-semibold transition disabled:opacity-50 ${ACTION_STYLES[action] || ACTION_STYLES.archive}`}
        >
          {busyAction === action ? '...' : ACTION_LABELS[action] || action}
        </button>
      ))}
    </div>
  )
}
