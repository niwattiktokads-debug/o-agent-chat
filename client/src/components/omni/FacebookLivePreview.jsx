import React, { useState } from 'react'
import { fetchFacebookConversations, syncFacebookConversations } from '../../lib/omniApi.js'

const PROFILES = [
  { value: 'anna_lynn', label: 'Anna Lynn' },
  { value: 'man_kynd', label: 'MAN KYND' },
  { value: 'page_des', label: 'เพจเดส' },
  { value: 'fb_112154661515664', label: 'Viris Zamara' },
]

export default function FacebookLivePreview({ onSynced }) {
  const [profile, setProfile] = useState('anna_lynn')
  const [state, setState] = useState({ status: 'idle', rows: [], error: '', summary: '' })

  const load = async () => {
    setState({ status: 'loading', rows: [], error: '', summary: '' })
    try {
      const data = await fetchFacebookConversations(profile)
      setState({ status: 'loaded', rows: data.threads.slice(0, 5), error: '', summary: `${data.threads.length} live threads` })
    } catch (error) {
      setState({ status: 'error', rows: [], error: error.message, summary: '' })
    }
  }

  const sync = async () => {
    setState((current) => ({ ...current, status: 'syncing', error: '', summary: '' }))
    try {
      const result = await syncFacebookConversations(profile)
      onSynced?.(result.snapshot)
      setState({
        status: 'synced',
        rows: result.snapshot.threads.filter((thread) => thread.platform === 'facebook' && thread.pageId === result.page.omniPageId).slice(0, 5),
        error: '',
        summary: `${result.threads.inserted} inserted, ${result.threads.updated} updated`,
      })
    } catch (error) {
      setState((current) => ({ ...current, status: 'error', error: error.message, summary: '' }))
    }
  }

  return (
    <section className="border-b border-[#dfe8e4] p-4">
      <h2 className="text-sm font-semibold text-[#24362f]">Facebook Live Preview</h2>
      <div className="mt-3 flex gap-2">
        <select className="min-w-0 flex-1 rounded-lg border border-[#dfe8e4] bg-white px-2 py-1 text-xs text-[#24362f]" value={profile} onChange={(event) => setProfile(event.target.value)}>
          {PROFILES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <button type="button" className="rounded-lg bg-[#e8faf6] px-3 py-1 text-xs font-semibold text-[#0f8f7b]" onClick={load} disabled={state.status === 'loading'}>
          {state.status === 'loading' ? 'Loading' : 'Load'}
        </button>
        <button type="button" className="rounded-lg bg-[#0f8f7b] px-3 py-1 text-xs font-semibold text-white" onClick={sync} disabled={state.status === 'syncing'}>
          {state.status === 'syncing' ? 'Syncing' : 'Sync'}
        </button>
      </div>
      {state.error ? <p className="mt-2 text-xs text-rose-600">{state.error}</p> : null}
      {state.summary ? <p className="mt-2 text-xs text-[#0f8f7b]">{state.summary}</p> : null}
      <div className="mt-3 space-y-2">
        {state.rows.map((thread) => (
          <div key={thread.id} className="rounded-xl border border-[#dfe8e4] bg-white p-2 text-xs text-[#50635c] shadow-sm">
            <div className="flex justify-between gap-2">
              <span>{thread.platform}</span>
              <span>{thread.unreadCount} unread</span>
            </div>
            <div className="mt-1 truncate text-[#7a8b84]">{thread.providerThreadId}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
