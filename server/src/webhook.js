import { normalizeMetaWebhookPayload } from './omni/metaWebhook.js'

const seen = new Set()

export function mountWebhook(app, hub, room, options = {}) {
  const omni = options.omni || null
  const metaVerifyToken = options.metaVerifyToken || process.env.META_VERIFY_TOKEN || ''

  app.post('/webhook/telegram', (req, res) => {
    const { update_id, message } = req.body || {}
    if (!update_id || !message?.text) {
      return res.status(400).json({ ok: false, error: 'invalid_update' })
    }
    if (seen.has(update_id)) return res.json({ ok: true, dedup: true })
    seen.add(update_id)
    const msg = room.addMessage({ sender: 'Boss', text: message.text })
    hub.broadcast('message', room.snapshot())
    res.json({ ok: true, message: msg })
  })

  app.get('/webhook/meta', (req, res) => {
    const mode = req.query['hub.mode']
    const token = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']
    if (mode === 'subscribe' && token && token === metaVerifyToken && challenge) {
      return res.status(200).send(String(challenge))
    }
    res.status(403).json({ ok: false, error: 'invalid_meta_webhook_challenge' })
  })

  app.post('/webhook/meta', (req, res) => {
    if (!omni) return res.status(503).json({ ok: false, error: 'omni_service_unavailable' })
    const normalized = normalizeMetaWebhookPayload(req.body || {})
    const result = omni.syncFacebookWebhookEvents(normalized)
    hub.broadcast('omni', result.snapshot)
    res.json({ ok: true, result: { customers: result.customers, threads: result.threads, messages: result.messages } })
  })
}
