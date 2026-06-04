import { json, readJsonBody, supabaseRest } from '../_omniSupabase.js'

const DEFAULT_SETTINGS = {
  postCf: { enabled: true, autoCreateDrafts: true },
  liveCf: { enabled: true, mode: 'fallback_post_comment_capture' },
  report: { timezone: 'Asia/Bangkok' },
  orderDraft: { enabled: true, approvalRequired: true, createZortOrderOnApprove: true },
  orderAddressIntake: { enabled: true, createConfirmationDraft: true },
  ai: { enabled: true, customerSendEnabled: false },
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const settings = await readSettings()
      return json(res, 200, { ok: true, settings })
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req)
      const before = await readSettings()
      const settings = deepMerge(before, body.settings || {})
      const updatedBy = String(body.updatedBy || 'boss')
      const [row] = await supabaseRest('/rest/v1/omni_settings?on_conflict=id', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify({
          id: 'default',
          settings_json: settings,
          updated_by: updatedBy,
          updated_at: new Date().toISOString(),
        }),
      })
      return json(res, 200, {
        ok: true,
        result: { omniSettings: { inserted: row ? 1 : 0, updated: row ? 1 : 0 } },
        settings: deepMerge(DEFAULT_SETTINGS, row?.settings_json || settings),
      })
    }

    return json(res, 405, { ok: false, error: 'method_not_allowed' })
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'settings_failed' })
  }
}

async function readSettings() {
  const rows = await supabaseRest('/rest/v1/omni_settings?select=*&id=eq.default&limit=1')
  return deepMerge(DEFAULT_SETTINGS, rows?.[0]?.settings_json || {})
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
