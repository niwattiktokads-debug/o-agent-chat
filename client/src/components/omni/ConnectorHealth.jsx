import React from 'react'

export default function ConnectorHealth({ health }) {
  return (
    <section className="border-b border-[#dfe8e4] p-4">
      <h2 className="text-sm font-semibold text-[#24362f]">Connector Health</h2>
      <div className="mt-3 space-y-2">
        {health.map((item) => (
          <div key={item.id || item.provider} className="flex justify-between rounded-xl border border-[#dfe8e4] bg-white px-3 py-2 text-xs text-[#50635c] shadow-sm">
            <span>{item.provider}</span>
            <span className={item.status === 'healthy' ? 'font-semibold text-[#0f8f7b]' : 'font-semibold text-[#b7791f]'}>{item.status}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
