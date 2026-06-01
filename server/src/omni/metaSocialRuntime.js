import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const DEFAULT_HELPER = process.env.META_INBOX_HELPER || '/Users/babycuca/.codex/bin/meta-inbox-api'

async function defaultRunner(args) {
  try {
    const { stdout } = await execFileAsync(DEFAULT_HELPER, args, {
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
