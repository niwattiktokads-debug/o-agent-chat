import { fetchOmniSnapshotFromSupabase, json } from '../_omniSupabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' })
  try {
    const snapshot = await fetchOmniSnapshotFromSupabase()
    return json(res, 200, { ok: true, snapshot })
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'snapshot_failed' })
  }
}
