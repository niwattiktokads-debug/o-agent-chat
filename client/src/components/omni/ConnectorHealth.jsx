import React from 'react'

export default function ConnectorHealth({ health }) {
  return (
    <section className="border-b border-slate-800 p-4">
      <h2 className="text-sm font-semibold">Connector Health</h2>
      <div className="mt-3 space-y-2">
        {health.map((item) => (
          <div key={item.id || item.provider} className="flex justify-between rounded bg-slate-900 px-3 py-2 text-xs">
            <span>{item.provider}</span>
            <span>{item.status}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
