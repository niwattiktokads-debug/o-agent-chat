import React from 'react'

const knowledgeRows = [
  { title: 'Return and exchange policy', source: 'Manual note', status: 'Ready', updated: 'Today 08:20' },
  { title: 'Anna Lynn product FAQ', source: 'Product sheet', status: 'Ready', updated: 'Today 08:12' },
  { title: 'Shipping and payment answers', source: 'Messenger playbook', status: 'Training', updated: 'Today 07:58' },
]

const navItems = [
  ['Inbox', '12'],
  ['AI Chatbot', ''],
  ['Customers', ''],
  ['Broadcast', ''],
  ['Analytics', ''],
  ['Settings', ''],
]

const trainMenu = ['Overview', 'Instructions', 'Knowledge Source', 'Testing', 'Deploy']

export default function AiKnowledgeSourcePage({ onOpenInbox, onOpenChat }) {
  return (
    <div className="flex h-full bg-[#f6f8fb] text-[#17211e]">
      <aside className="flex w-[68px] flex-col items-center border-r border-[#e5e9ef] bg-white py-4">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#0f8f7b] text-sm font-bold text-white shadow-sm">OA</div>
        <div className="mt-8 flex flex-1 flex-col gap-5 text-[#9aa5b1]">
          {['⌂', '▦', '○', '✦', '↗', '⚙'].map((item) => (
            <button key={item} type="button" className="grid h-9 w-9 place-items-center rounded-xl text-lg hover:bg-[#f1f5f7]">{item}</button>
          ))}
        </div>
        <div className="grid h-9 w-9 place-items-center rounded-full bg-[#ffe9db] text-sm">B</div>
      </aside>

      <aside className="w-[248px] border-r border-[#e5e9ef] bg-white px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#9aa5b1]">Workspace</p>
            <h1 className="mt-1 text-lg font-bold text-[#17211e]">O Agent</h1>
          </div>
          <button type="button" className="grid h-9 w-9 place-items-center rounded-xl border border-[#e5e9ef] text-[#66737f]">⌕</button>
        </div>

        <nav className="mt-7 space-y-1">
          {navItems.map(([label, badge]) => (
            <button
              key={label}
              type="button"
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${label === 'AI Chatbot' ? 'bg-[#e8faf6] text-[#0f8f7b]' : 'text-[#52606b] hover:bg-[#f6f8fb]'}`}
            >
              <span>{label}</span>
              {badge ? <span className="rounded-full bg-[#ecf1f4] px-2 py-0.5 text-xs text-[#66737f]">{badge}</span> : null}
            </button>
          ))}
        </nav>

        <div className="mt-8 rounded-2xl border border-[#dcefe9] bg-[#f1fbf8] p-4">
          <p className="text-sm font-bold text-[#153d35]">AI training status</p>
          <p className="mt-1 text-xs leading-5 text-[#5f746e]">3 sources connected. Auto-retrain is enabled for new customer answers.</p>
          <div className="mt-3 h-2 rounded-full bg-white">
            <div className="h-2 w-[72%] rounded-full bg-[#0f8f7b]" />
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="flex h-[72px] items-center justify-between border-b border-[#e5e9ef] bg-white px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#9aa5b1]">AI Chatbot</p>
            <h2 className="text-xl font-bold">Train knowledge source</h2>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="rounded-xl border border-[#dce3e8] bg-white px-4 py-2 text-sm font-semibold text-[#52606b]" onClick={onOpenInbox}>Inbox</button>
            <button type="button" className="rounded-xl border border-[#dce3e8] bg-white px-4 py-2 text-sm font-semibold text-[#52606b]" onClick={onOpenChat}>Chat</button>
            <button type="button" className="rounded-xl bg-[#0f8f7b] px-4 py-2 text-sm font-bold text-white shadow-sm">Add source</button>
          </div>
        </header>

        <div className="grid h-[calc(100%-72px)] grid-cols-[260px_1fr]">
          <aside className="border-r border-[#e5e9ef] bg-[#fbfcfd] p-5">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[#9aa5b1]">Training</p>
            <div className="space-y-1">
              {trainMenu.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${item === 'Knowledge Source' ? 'bg-white text-[#0f8f7b] shadow-sm ring-1 ring-[#e5e9ef]' : 'text-[#66737f] hover:bg-white'}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </aside>

          <section className="overflow-y-auto p-7">
            <div className="mx-auto max-w-5xl">
              <div className="rounded-3xl border border-[#e5e9ef] bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-bold tracking-tight">Knowledge Source</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-[#66737f]">
                      Add trusted information for the AI chatbot to answer customers across Facebook, TikTok, Shopee, and order chats.
                    </p>
                  </div>
                  <button type="button" className="rounded-xl bg-[#0f8f7b] px-4 py-2.5 text-sm font-bold text-white shadow-sm">+ New knowledge</button>
                </div>

                <div className="mt-6 grid grid-cols-3 gap-3">
                  {[
                    ['Knowledge items', '3'],
                    ['Ready to answer', '2'],
                    ['Needs review', '1'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-[#e5e9ef] bg-[#fbfcfd] p-4">
                      <p className="text-xs font-semibold text-[#8a96a3]">{label}</p>
                      <p className="mt-2 text-2xl font-bold">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 rounded-3xl border border-[#e5e9ef] bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-[#eef2f5] px-5 py-4">
                  <div className="flex rounded-xl bg-[#f3f6f8] p-1 text-sm font-semibold text-[#66737f]">
                    <button type="button" className="rounded-lg bg-white px-4 py-2 text-[#17211e] shadow-sm">All</button>
                    <button type="button" className="px-4 py-2">Website</button>
                    <button type="button" className="px-4 py-2">Files</button>
                    <button type="button" className="px-4 py-2">Manual</button>
                  </div>
                  <input className="h-10 w-72 rounded-xl border border-[#dce3e8] px-3 text-sm outline-none focus:border-[#0f8f7b]" placeholder="Search knowledge" />
                </div>

                <div className="divide-y divide-[#eef2f5]">
                  {knowledgeRows.map((row) => (
                    <article key={row.title} className="grid grid-cols-[1fr_160px_120px_150px] items-center gap-4 px-5 py-4">
                      <div>
                        <p className="font-bold text-[#17211e]">{row.title}</p>
                        <p className="mt-1 text-sm text-[#8a96a3]">{row.source}</p>
                      </div>
                      <span className="text-sm text-[#66737f]">{row.updated}</span>
                      <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${row.status === 'Ready' ? 'bg-[#e8faf6] text-[#0f8f7b]' : 'bg-[#fff3df] text-[#b7791f]'}`}>{row.status}</span>
                      <div className="flex justify-end gap-2">
                        <button type="button" className="rounded-lg border border-[#dce3e8] px-3 py-1.5 text-sm font-semibold text-[#52606b]">Edit</button>
                        <button type="button" className="rounded-lg border border-[#dce3e8] px-3 py-1.5 text-sm font-semibold text-[#52606b]">Test</button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
