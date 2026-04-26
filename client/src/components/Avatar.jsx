import React, { useState } from 'react'

const ROLES = {
  Boss: { src: '/avatars/boss.svg', label: 'บ', cls: 'bg-amber-500 text-slate-950' },
  Code: { src: '/avatars/code.svg', label: 'C', cls: 'bg-sky-600 text-white' },
  Codex: { src: '/avatars/codex.svg', label: 'X', cls: 'bg-violet-600 text-white' },
  ChatGPT: { src: '/avatars/chatgpt.svg', label: 'G', cls: 'bg-emerald-600 text-white' },
  Cowork: { src: '/avatars/cowork.svg', label: '฿', cls: 'bg-rose-600 text-white' },
}

const ALIASES = {
  'บอส': 'Boss', Boss: 'Boss', Code: 'Code', Codex: 'Codex',
  ChatGPT: 'ChatGPT', Cowork: 'Cowork',
}

export default function Avatar({ sender, size = 36 }) {
  const role = ALIASES[sender] || 'Boss'
  const cfg = ROLES[role] || ROLES.Boss
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-full font-semibold shadow ring-1 ring-slate-900/40 ${cfg.cls}`}
        style={{ width: size, height: size, fontSize: size * 0.4 }}
        aria-label={`avatar ${role}`}
        title={role}
      >
        {cfg.label}
      </div>
    )
  }

  return (
    <img
      src={cfg.src}
      alt={`avatar ${role}`}
      title={role}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="shrink-0 rounded-full shadow ring-1 ring-slate-900/40 bg-slate-800 object-cover"
      style={{ width: size, height: size }}
    />
  )
}
