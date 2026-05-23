import React from 'react'

export default function ThreadDetail({ snapshot, thread }) {
  if (!thread) return <div className="p-5 text-[#7a8b84]">No thread selected</div>
  const messages = snapshot.messages.filter((message) => message.threadId === thread.id)
  return (
    <div className="space-y-3 bg-[#fbfdfc] p-5">
      {messages.map((message) => (
        <article key={message.id} className="max-w-[76%] rounded-2xl border border-[#dfe8e4] bg-white p-3 shadow-sm">
          <div className="text-xs font-medium text-[#7a8b84]">{message.authorName}</div>
          <p className="mt-1 text-sm leading-6 text-[#24362f]">{message.text}</p>
        </article>
      ))}
    </div>
  )
}
