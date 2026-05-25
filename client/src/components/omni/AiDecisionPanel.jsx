import React, { useState } from 'react'
import { createAiDraft } from '../../lib/omniApi.js'

const ACTION_LABELS = {
  draft_ready: 'AI ร่างคำตอบแล้ว',
  needs_approval: 'ต้องให้คนตรวจ',
  needs_data: 'ต้องเติมข้อมูลก่อน',
  auto_sent: 'ส่งอัตโนมัติแล้ว',
  escalated: 'ส่งต่อให้คนดู',
  review_before_reply: 'ต้องตรวจคำตอบก่อนส่ง',
  draft_reply: 'พร้อมให้ AI ร่าง',
}

function actionLabel(action) {
  return ACTION_LABELS[action] || action || 'ยังไม่มีสถานะ'
}

function confidencePercent(value) {
  const number = Number(value || 0)
  if (!Number.isFinite(number) || number <= 0) return null
  return Math.round(number * 100)
}

function sortDecisions(decisions = []) {
  return decisions.slice().sort((a, b) => String(b.createdAt || b.id || '').localeCompare(String(a.createdAt || a.id || '')))
}

export default function AiDecisionPanel({ snapshot, thread, onDrafted }) {
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState('')
  const decisions = sortDecisions(thread ? snapshot.aiDecisions.filter((decision) => decision.threadId === thread.id) : [])
  const latestDecision = draft || decisions[0] || null
  const history = decisions.slice(draft ? 0 : 1)

  async function runDraft() {
    if (!thread) return
    setBusy(true)
    setError('')
    try {
      const result = await createAiDraft(thread.id)
      setDraft(result.decision)
      onDrafted?.(result.snapshot)
    } catch (err) {
      setError(err.message || 'ai_draft_failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-[var(--color-ink)]">AI ทำอะไรอยู่</h2>
        <button
          type="button"
          className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--color-accent-ink)] shadow-sm disabled:opacity-50"
          disabled={!thread || busy}
          onClick={runDraft}
        >
          {busy ? 'กำลังร่าง' : 'ให้ AI ร่าง'}
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      {latestDecision ? (
        <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-ai)] bg-[var(--color-ai-soft)] p-3 text-sm text-[var(--color-ink)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-bold">{actionLabel(latestDecision.action)}</div>
            {confidencePercent(latestDecision.confidence) ? (
              <span className="rounded-[var(--radius-pill)] bg-[var(--color-panel)] px-2 py-1 text-xs font-semibold text-[var(--color-ai)]">
                มั่นใจ {confidencePercent(latestDecision.confidence)}%
              </span>
            ) : null}
          </div>
          {latestDecision.intent ? <div className="mt-2 text-xs text-[var(--color-ink-2)]">เรื่องที่ AI จับได้: {latestDecision.intent}</div> : null}
          {latestDecision.risk ? <div className="mt-1 text-xs text-[var(--color-ink-2)]">ความเสี่ยง: {latestDecision.risk}</div> : null}
          {latestDecision.reason ? <div className="mt-2 text-xs text-[var(--color-muted)]">{latestDecision.reason}</div> : null}
          {latestDecision.draftText ? (
            <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-3 text-sm leading-6">
              {latestDecision.draftText}
            </div>
          ) : (
            <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-3 text-xs text-[var(--color-muted)]">
              ยังไม่มีข้อความร่างในรายการนี้ กด “ให้ AI ร่าง” เพื่อสร้าง draft ใหม่
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 rounded-[var(--radius-md)] border border-dashed border-[var(--color-rule)] bg-[var(--color-panel)] p-3 text-xs text-[var(--color-muted)]">
          ยังไม่มีการตัดสินใจจาก AI สำหรับแชทนี้
        </div>
      )}

      {history.length ? (
        <details className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-3">
          <summary className="cursor-pointer text-xs font-bold text-[var(--color-ink)]">ดูประวัติ AI {history.length} รายการ</summary>
          <div className="mt-3 space-y-2">
            {history.map((decision) => (
              <div key={decision.id} className="rounded-[var(--radius-md)] bg-[var(--color-panel-2)] p-3 text-xs text-[var(--color-ink-2)]">
                <div className="font-semibold text-[var(--color-ink)]">{actionLabel(decision.action)}</div>
                <div className="mt-1">
                  {confidencePercent(decision.confidence) ? `มั่นใจ ${confidencePercent(decision.confidence)}%` : 'ไม่มีคะแนนความมั่นใจ'}
                  {decision.intent ? ` · ${decision.intent}` : ''}
                  {decision.risk ? ` · ${decision.risk}` : ''}
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  )
}
