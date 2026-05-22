import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const DEFAULT_HELPER = process.env.META_INBOX_HELPER || '/Users/babycuca/.codex/bin/meta-inbox-api'

export const FACEBOOK_PAGE_PROFILES = {
  man_kynd: { pageId: '189971841184132', pageName: 'MAN KYND', omniPageId: 'page_mankynd' },
  anna_lynn: { pageId: '122106446570001676', pageName: 'Anna Lynn', omniPageId: 'page_annalynn' },
  page_des: { pageId: '1137894522741329', pageName: 'Niwatha และ AI ชื่อเดส', omniPageId: 'page_des' },
  fb_112154661515664: { pageId: '112154661515664', pageName: 'VZ by viris zamara.', omniPageId: 'page_fb_112154661515664' },
}

async function defaultRunner(args) {
  const { stdout } = await execFileAsync(DEFAULT_HELPER, args, {
    maxBuffer: 1024 * 1024 * 8,
    env: process.env,
  })
  return JSON.parse(stdout)
}

function getCustomerSender(senders = [], pageId) {
  return senders.find((sender) => sender.id !== pageId) || senders[0] || null
}

export function normalizeMetaConversations({ pageProfile, response }) {
  const profile = FACEBOOK_PAGE_PROFILES[pageProfile]
  if (!profile) throw new Error(`unknown_facebook_page:${pageProfile}`)

  const conversations = response?.data || []
  const customers = []
  const threads = []
  const messages = []

  for (const conversation of conversations) {
    const customer = getCustomerSender(conversation.senders?.data, profile.pageId)
    const customerId = customer?.id ? `fb_customer_${customer.id}` : `fb_customer_unknown_${conversation.id}`
    const threadId = `fb_${conversation.id}`
    const latestText = conversation.snippet || ''

    customers.push({
      id: customerId,
      displayName: customer?.name || 'Facebook Customer',
      platform: 'facebook',
      providerCustomerId: customer?.id || null,
      matchConfidence: customer?.id ? 1 : 0.2,
    })

    threads.push({
      id: threadId,
      providerThreadId: conversation.id,
      pageId: profile.omniPageId,
      platform: 'facebook',
      customerId,
      status: conversation.unread_count > 0 ? 'open' : 'draft_ready',
      intent: 'unknown',
      risk: 'medium',
      unreadCount: conversation.unread_count || 0,
      messageCount: conversation.message_count || 0,
      updatedAt: conversation.updated_time || null,
      link: conversation.link || null,
    })

    if (latestText) {
      messages.push({
        id: `fb_preview_${conversation.id}`,
        threadId,
        direction: 'inbound',
        authorName: customer?.name || 'Facebook Customer',
        text: latestText,
        createdAt: conversation.updated_time || null,
        providerMessageId: `${conversation.id}:snippet`,
      })
    }
  }

  return { page: profile, threads, customers, messages }
}

export async function listFacebookConversations({ pageProfile = 'anna_lynn', runner = defaultRunner } = {}) {
  if (!FACEBOOK_PAGE_PROFILES[pageProfile]) throw new Error(`unknown_facebook_page:${pageProfile}`)
  const payload = await runner(['list-conversations', `--page=${pageProfile}`])
  if (!payload?.ok) throw new Error(payload?.error || 'meta_inbox_failed')
  return normalizeMetaConversations({ pageProfile, response: payload.response })
}
