import { fetchKnowledgeSourcesFromSupabase, json } from '../_omniSupabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' })
  try {
    const sources = await fetchKnowledgeSourcesFromSupabase({
      query: req.query.q,
      type: req.query.type,
      status: req.query.status,
    })
    return json(res, 200, { ok: true, sources })
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'knowledge_sources_failed' })
  }
}
