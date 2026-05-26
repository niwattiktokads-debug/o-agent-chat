import { normalizeMetaWebhookPayload } from '../../server/src/omni/metaWebhook.js'
import { getWebhookSecret, json, readJsonBody, supabaseRpc } from '../_omniSupabase.js'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const query = req.query || Object.fromEntries(new URL(req.url, 'https://omni.local').searchParams)
    const mode = query['hub.mode']
    const token = query['hub.verify_token']
    const challenge = query['hub.challenge']
    if (mode === 'subscribe' && challenge && token === process.env.META_VERIFY_TOKEN) {
      res.statusCode = 200
      return res.end(String(challenge))
    }
    return json(res, 403, { ok: false, error: 'invalid_meta_webhook_challenge' })
  }

  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' })

  try {
    const secret = getWebhookSecret()
    if (!secret) return json(res, 500, { ok: false, error: 'webhook_ingest_secret_missing' })
    const normalized = normalizeMetaWebhookPayload(await readJsonBody(req))
    const result = await supabaseRpc('omni_ingest_normalized', {
      payload: normalized,
      ingest_secret: secret,
    })
    return json(res, 200, { ok: true, result })
  } catch (error) {
    return json(res, 400, { ok: false, error: error.message || 'meta_webhook_failed' })
  }
}
