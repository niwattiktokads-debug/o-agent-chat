import { normalizeTikTokMessagingWebhookPayload } from '../../../server/src/omni/tiktokMessagingClient.js'
import { getWebhookSecret, json, readJsonBody, supabaseRpc } from '../../_omniSupabase.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' })

  try {
    const secret = getWebhookSecret()
    if (!secret) return json(res, 500, { ok: false, error: 'webhook_ingest_secret_missing' })
    const normalized = normalizeTikTokMessagingWebhookPayload(await readJsonBody(req))
    const result = await supabaseRpc('omni_ingest_normalized', {
      payload: normalized,
      ingest_secret: secret,
    })
    return json(res, 200, { ok: true, result })
  } catch (error) {
    return json(res, 400, { ok: false, error: error.message || 'tiktok_webhook_failed' })
  }
}
