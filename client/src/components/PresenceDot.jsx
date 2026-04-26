import React from 'react'

export default function PresenceDot({ online }) {
  const cls = online ? 'bg-emerald-400' : 'bg-slate-600'
  const title = online ? 'online' : 'offline'
  return <span title={title} className={`inline-block h-2 w-2 rounded-full ${cls}`} />
}
