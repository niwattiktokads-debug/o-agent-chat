import { createAiReplyEngine } from '../../../../server/src/omni/aiReplyEngine.js'
import { fetchOmniSnapshotFromSupabase, json } from '../../../_omniSupabase.js'

const PAGE_POLICY_FALLBACKS = {
  page_annalynn: 'policy_annalynn',
  page_annalynn_tiktok: 'policy_annalynn',
  page_mankynd: 'policy_mankynd',
  page_des: 'policy_page_des',
}

const DEFAULT_SETTINGS = {
  ai: { enabled: true },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' })

  try {
    const threadId = String(req.query.threadId || '').trim()
    if (!threadId) return json(res, 400, { ok: false, error: 'thread_id_required' })

    const snapshot = await fetchOmniSnapshotFromSupabase()
    const settings = settingsFromSnapshot(snapshot)
    if (settings.ai?.enabled === false) return json(res, 409, { ok: false, error: 'ai_disabled' })

    const thread = (snapshot.threads || []).find((item) => item.id === threadId)
    if (!thread) return json(res, 404, { ok: false, error: 'thread_not_found' })

    const policy = policyForThread(snapshot, thread)
    const engine = createAiReplyEngine({
      provider: process.env.OMNI_AI_PROVIDER || 'local_rules',
      model: process.env.OMNI_AI_MODEL || 'dex-local-rules-v1',
    })
    const decision = await engine.draft({ thread, snapshot, policy })
    if (!decision.ok) return json(res, 400, decision)

    return json(res, 200, {
      ok: true,
      decision,
      recorded: null,
      sent: false,
      runtime: 'vercel_serverless',
      recording: 'not_recorded_without_supabase_write_role',
    })
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'ai_draft_failed' })
  }
}

function settingsFromSnapshot(snapshot) {
  const row = (snapshot.omniSettings || []).find((item) => item.id === 'default')
  return deepMerge(DEFAULT_SETTINGS, row?.settings || {})
}

function policyForThread(snapshot, thread) {
  const page = (snapshot.pages || []).find((item) => item.id === thread.pageId)
  const policyId = page?.policySetId || PAGE_POLICY_FALLBACKS[thread.pageId]
  return (snapshot.policySets || []).find((item) => item.id === policyId) || { autoSend: {} }
}

function deepMerge(base, patch) {
  const output = clone(base || {})
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      output[key] = deepMerge(output[key] || {}, value)
    } else {
      output[key] = value
    }
  }
  return output
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}
