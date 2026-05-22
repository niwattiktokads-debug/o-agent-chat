import React, { useState } from 'react'
import { fetchFacebookConversations, syncFacebookConversations } from '../../lib/omniApi.js'

const PROFILES = [
  { value: 'anna_lynn', label: 'Anna Lynn' },
  { value: 'man_kynd', label: 'MAN KYND' },
  { value: 'page_des', label: 'เพจเดส' },
  { value: 'fb_112154661515664', label: 'Facebook Page 112154661515664' },
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
    <section className="border-b border-slate-800 p-4">
      <h2 className="text-sm font-semibold">Facebook Live Preview</h2>
      <div className="mt-3 flex gap-2">
        <select className="min-w-0 flex-1 rounded bg-slate-900 px-2 py-1 text-xs text-slate-100" value={profile} onChange={(event) => setProfile(event.target.value)}>
          {PROFILES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <button type="button" className="rounded bg-cyan-950 px-3 py-1 text-xs text-cyan-100" onClick={load} disabled={state.status === 'loading'}>
          {state.status === 'loading' ? 'Loading' : 'Load'}
        </button>
        <button type="button" className="rounded bg-emerald-950 px-3 py-1 text-xs text-emerald-100" onClick={sync} disabled={state.status === 'syncing'}>
          {state.status === 'syncing' ? 'Syncing' : 'Sync'}
        </button>
      </div>
      {state.error ? <p className="mt-2 text-xs text-rose-300">{state.error}</p> : null}
      {state.summary ? <p className="mt-2 text-xs text-emerald-300">{state.summary}</p> : null}
      <div className="mt-3 space-y-2">
        {state.rows.map((thread) => (
          <div key={thread.id} className="rounded bg-slate-900 p-2 text-xs text-slate-300">
            <div className="flex justify-between gap-2">
              <span>{thread.platform}</span>
              <span>{thread.unreadCount} unread</span>
            </div>
            <div className="mt-1 truncate text-slate-500">{thread.providerThreadId}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
