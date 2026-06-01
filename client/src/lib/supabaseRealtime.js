import { createClient } from '@supabase/supabase-js'
import { supabaseConfig } from './runtimeConfig.js'

let client = null

const OMNI_REALTIME_TABLES = [
  'omni_threads',
  'omni_messages',
  'omni_customers',
  'omni_orders',
  'omni_payment_requests',
  'omni_ai_decisions',
  'omni_approval_tasks',
  'omni_settings',
  'omni_knowledge_sources',
]

function getClient() {
  const config = supabaseConfig()
  if (!config.enabled) return null
  if (!client) {
    client = createClient(config.url, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return client
}

export function isSupabaseRealtimeEnabled() {
  return Boolean(getClient())
}

export function subscribeOmniDatabaseChanges(onChange) {
  const supabase = getClient()
  if (!supabase) return null

  let pending = false
  const notify = (payload) => {
    if (pending) return
    pending = true
    window.setTimeout(() => {
      pending = false
      onChange(payload)
    }, 150)
  }

  const channel = supabase.channel('omni-db-changes')
  for (const table of OMNI_REALTIME_TABLES) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, notify)
  }
  channel.subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
