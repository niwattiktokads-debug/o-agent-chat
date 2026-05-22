import React from 'react'

export default function ThreadDetail({ snapshot, thread }) {
  if (!thread) return <div className="p-5 text-slate-400">No thread selected</div>
  const messages = snapshot.messages.filter((message) => message.threadId === thread.id)
  return (
    <div className="space-y-3 p-5">
      {messages.map((message) => (
        <article key={message.id} className="rounded border border-slate-800 bg-slate-900 p-3">
          <div className="text-xs text-slate-500">{message.authorName}</div>
          <p className="mt-1 text-sm text-slate-100">{message.text}</p>
        </article>
      ))}
    </div>
  )
}
