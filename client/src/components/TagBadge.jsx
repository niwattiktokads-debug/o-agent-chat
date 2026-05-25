import React from 'react'

const COLOR = {
  ASK: 'bg-blue-500/20 text-blue-300',
  ANS: 'bg-cyan-500/20 text-cyan-300',
  PROPOSE: 'bg-violet-500/20 text-violet-300',
  AGREE: 'bg-emerald-500/20 text-emerald-300',
  DISAGREE: 'bg-rose-500/20 text-rose-300',
  DECIDE: 'bg-amber-500/30 text-amber-300',
  DO: 'bg-lime-500/20 text-lime-300',
  PASS: 'bg-slate-500/20 text-slate-300',
  STATE: 'bg-indigo-500/20 text-indigo-300',
}

export default function TagBadge({ tag }) {
  if (!tag) return null
  const upper = String(tag).toUpperCase()
  const cls = COLOR[upper] || 'bg-slate-500/20 text-slate-300'
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide mr-1.5 ${cls}`}>
      {upper}
    </span>
  )
}
