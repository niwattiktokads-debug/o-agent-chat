import React from 'react'

export default function ConnectorHealth({ health }) {
  return (
    <section className="border-b border-[#dfe8e4] p-4">
      <h2 className="text-sm font-semibold text-[#24362f]">Connector Health</h2>
      <div className="mt-3 space-y-2">
        {health.map((item) => (
          <div key={item.id || item.provider} className="rounded-xl border border-[#dfe8e4] bg-white px-3 py-2 text-xs text-[#50635c] shadow-sm">
            <div className="flex justify-between gap-3">
              <span className="font-semibold text-[#24362f]">{item.provider}</span>
              <span className={item.status === 'healthy' ? 'font-semibold text-[#0f8f7b]' : 'font-semibold text-[#b7791f]'}>{item.status}</span>
            </div>
            {item.summary || item.userMessage ? (
              <div className={`mt-1 rounded-md px-2 py-1 ${item.status === 'healthy' ? 'bg-[#ecfdf7] text-[#0f8f7b]' : 'bg-[#fff7ed] text-[#9a5b00]'}`}>
                {item.summary || item.userMessage}
              </div>
            ) : null}
            {Array.isArray(item.pages) && item.pages.length ? (
              <div className="mt-2 space-y-1">
                {item.pages.map((page) => (
                  <div key={page.pageProfile} className="rounded-md border border-[#edf2ef] bg-[#f8fbf9] px-2 py-1">
                    <div className="flex justify-between gap-2">
                      <span className="truncate font-semibold text-[#24362f]">{page.pageName || page.pageProfile}</span>
                      <span className={page.status === 'healthy' ? 'text-[#0f8f7b]' : 'text-[#b7791f]'}>{page.status}</span>
                    </div>
                    {page.userMessage ? <div className="mt-0.5 text-[#6b4f16]">{page.userMessage}</div> : null}
                    {page.tokenSource ? <div className="mt-0.5 text-[10px] text-[#6f7f79]">env: {page.tokenSource}</div> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}
