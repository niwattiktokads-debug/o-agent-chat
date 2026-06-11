import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import { loadPageRegistry } from './pageRegistry.js'

const execFileAsync = promisify(execFile)
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v23.0'
const FACEBOOK_GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

const FB_PAGE_TOKEN_ENV = {
  man_kynd: ['META_PAGE_TOKEN_MAN_KYND'],
  anna_lynn: ['META_PAGE_TOKEN_ANNA_LYNN'],
  page_des: ['META_PAGE_TOKEN_PAGE_DES'],
  tangtob: ['META_PAGE_TOKEN_TANGTOB'],
  fb_112154661515664: ['META_PAGE_TOKEN_112154661515664'],
  vz_viris_zamara: ['META_PAGE_TOKEN_VZ_VIRIS_ZAMARA'],
}

function pageProfiles() {
  return loadPageRegistry()
}

function fbPageAccessToken(pageProfile) {
  const candidates = [...(FB_PAGE_TOKEN_ENV[pageProfile] || []), 'META_PAGE_ACCESS_TOKEN']
  const envName = candidates.find((name) => process.env[name])
  return envName
    ? { ok: true, value: process.env[envName], source: envName }
    : { ok: false, source: candidates }
}

function helperPath() {
  return process.env.META_INBOX_HELPER || ''
}

function parseArgs(args = []) {
  const options = { command: args[0] || '' }
  for (let index = 1; index < args.length; index += 1) {
    const arg = String(args[index] || '')
    if (!arg.startsWith('--')) continue
    const [rawKey, ...rawValueParts] = arg.slice(2).split('=')
    const key = rawKey.replace(/-([a-z])/g, (_match, char) => char.toUpperCase())
    if (rawValueParts.length) {
      options[key] = rawValueParts.join('=')
    } else if (index + 1 < args.length && !String(args[index + 1]).startsWith('--')) {
      options[key] = String(args[index + 1])
      index += 1
    } else {
      options[key] = true
    }
  }
  return options
}

function safeLimit(value, fallback = 10) {
  return Math.min(100, Math.max(1, Number(value) || fallback))
}

async function fetchFacebookGraph({ path, token, params = {} }) {
  const url = new URL(`${FACEBOOK_GRAPH_BASE}/${path}`)
  url.searchParams.set('access_token', token)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }

  let response
  try {
    response = await fetch(url)
  } catch (networkError) {
    return { ok: false, error: 'meta_graph_network_error', detail: networkError.message }
  }

  const text = await response.text()
  const payload = text ? JSON.parse(text) : {}
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: payload?.error?.message || payload?.error || 'meta_graph_error',
      response: payload,
    }
  }
  return { ok: true, status: response.status, response: payload }
}

async function graphRunner(args) {
  const options = parseArgs(args)
  const pageProfile = String(options.page || 'man_kynd')
  const profile = pageProfiles()[pageProfile]
  if (!profile || profile.platform !== 'facebook') {
    return { ok: false, error: 'unknown_facebook_page', pageProfile }
  }

  if (options.command === 'list-live-comments') {
    return { ok: false, error: 'meta_live_comments_not_available_in_cloud_runtime', pageProfile }
  }

  const token = fbPageAccessToken(pageProfile)
  if (!token.ok) {
    return { ok: false, error: 'meta_page_token_missing', pageProfile, expectedEnv: token.source }
  }

  if (options.command === 'list-posts') {
    const result = await fetchFacebookGraph({
      path: `${encodeURIComponent(profile.pageId)}/posts`,
      token: token.value,
      params: {
        fields: 'id,message,story,created_time,permalink_url,comments.limit(3).summary(true){id,message,from,created_time,comment_count,like_count}',
        limit: safeLimit(options.limit, 10),
      },
    })
    return { ...result, page_id: profile.pageId }
  }

  if (options.command === 'list-comments') {
    if (!options.objectId) return { ok: false, error: 'object_id_required' }
    const result = await fetchFacebookGraph({
      path: `${encodeURIComponent(options.objectId)}/comments`,
      token: token.value,
      params: {
        fields: 'id,message,from,created_time,comment_count,like_count',
        summary: 'true',
        limit: safeLimit(options.limit, 50),
      },
    })
    return { ...result, page_id: profile.pageId }
  }

  return { ok: false, error: 'unsupported_meta_social_command', command: options.command }
}

async function defaultRunner(args) {
  const configuredHelper = helperPath()
  if (!configuredHelper) return graphRunner(args)
  if (!existsSync(configuredHelper)) {
    return { ok: false, error: 'meta_inbox_helper_not_available', helperPath: configuredHelper }
  }
  try {
    const { stdout } = await execFileAsync(configuredHelper, args, {
      maxBuffer: 1024 * 1024 * 8,
      env: process.env,
    })
    return JSON.parse(stdout)
  } catch (error) {
    if (error.stdout) {
      try { return JSON.parse(error.stdout) } catch {}
    }
    throw error
  }
}

function normalizePost(post = {}) {
  return {
    id: post.id,
    message: post.message || post.story || '',
    createdTime: post.created_time || null,
    permalinkUrl: post.permalink_url || null,
    commentCount: post.comments?.summary?.total_count ?? post.comment_count ?? 0,
    commentsPreview: (post.comments?.data || []).map(normalizeComment),
  }
}

function normalizeComment(comment = {}) {
  return {
    id: comment.id,
    message: comment.message || '',
    from: comment.from || null,
    createdTime: comment.created_time || null,
    commentCount: comment.comment_count || 0,
    likeCount: comment.like_count || 0,
  }
}

export function createMetaSocialRuntime({ runner = defaultRunner } = {}) {
  return {
    async listPagePosts({ pageProfile = 'man_kynd', limit = 10 } = {}) {
      const payload = await runner(['list-posts', `--page=${pageProfile}`, `--limit=${String(limit)}`])
      if (!payload?.ok) throw new Error(payload?.error || 'meta_posts_failed')
      return {
        ok: true,
        pageProfile,
        pageId: payload.page_id || null,
        posts: (payload.response?.data || []).map(normalizePost),
        paging: payload.response?.paging || null,
      }
    },
    async listPostComments({ objectId, pageProfile = 'man_kynd', limit = 50 } = {}) {
      if (!objectId) throw new Error('object_id_required')
      const payload = await runner(['list-comments', `--page=${pageProfile}`, `--object-id=${objectId}`, `--limit=${String(limit)}`])
      if (!payload?.ok) throw new Error(payload?.error || 'meta_comments_failed')
      return {
        ok: true,
        objectId,
        pageProfile,
        comments: (payload.response?.data || []).map(normalizeComment),
        summary: payload.response?.summary || null,
        paging: payload.response?.paging || null,
      }
    },
    async listLiveCommentSources({ pageProfile = 'man_kynd', limit = 10 } = {}) {
      const liveCommand = ['list-live-comments', `--page=${pageProfile}`, `--limit=${String(limit)}`]
      let liveAttempt = null
      try {
        const payload = await runner(liveCommand)
        if (payload?.ok) {
          return {
            ok: true,
            mode: 'meta_live_comment_stream',
            pageProfile,
            pageId: payload.page_id || null,
            comments: (payload.response?.data || payload.comments || []).map(normalizeComment),
            paging: payload.response?.paging || null,
          }
        }
        liveAttempt = { ok: false, error: payload?.error || payload?.reason || 'meta_live_comments_failed', response: payload }
      } catch (error) {
        liveAttempt = { ok: false, error: error.message || 'meta_live_comments_failed' }
      }
      const posts = await this.listPagePosts({ pageProfile, limit })
      return {
        ok: true,
        mode: 'fallback_live_post_comment_capture',
        blocker: liveAttempt?.error || 'meta_live_comment_stream_not_available_in_current_helper',
        blockerEvidence: {
          command: liveCommand[0],
          args: liveCommand.slice(1),
          ...liveAttempt,
        },
        posts: posts.posts,
      }
    },
  }
}
