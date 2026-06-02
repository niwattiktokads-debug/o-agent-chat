const API_BASE_URL = (import.meta.env.VITE_OMNI_API_BASE_URL || 'https://omni-server-production.up.railway.app').replace(/\/$/, '')
const WS_BASE_URL = (import.meta.env.VITE_OMNI_WS_BASE_URL || 'wss://omni-server-production.up.railway.app').replace(/\/$/, '')
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const SUPABASE_REALTIME_ENABLED = import.meta.env.VITE_OMNI_REALTIME_PROVIDER === 'supabase'

export function apiUrl(path) {
  if (!API_BASE_URL) return path
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

export function apiFetch(path, options = {}) {
  return fetch(apiUrl(path), {
    ...options,
    credentials: 'include',
  })
}

export function wsUrl(path) {
  if (WS_BASE_URL) return `${WS_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${path.startsWith('/') ? path : `/${path}`}`
}

export function supabaseConfig() {
  return {
    enabled: Boolean(SUPABASE_REALTIME_ENABLED && SUPABASE_URL && SUPABASE_ANON_KEY),
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
  }
}
