import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const execFileAsync = promisify(execFile)
const DEFAULT_HELPER = process.env.LINE_SUDA_OAGENT_HELPER || '/Users/babycuca/.codex/bin/line-suda-oagent'
const DEFAULT_RULES_FILE = process.env.LINE_SUDA_GROUP_RULES_FILE || '/Users/babycuca/Documents/O-Agent workspace/finance/staging/line_suda_group_rules.json'
const DEFAULT_REGISTRY_LOG = process.env.LINE_SUDA_GROUP_REGISTRY_LOG || '/Users/babycuca/Documents/O-Agent workspace/finance/staging/line_suda_group_registry.jsonl'
const DEFAULT_CAPTURE_LOG = process.env.LINE_SUDA_OAGENT_CAPTURE_LOG || '/Users/babycuca/Documents/O-Agent workspace/finance/staging/line_suda_oagent_capture_events.jsonl'

function parseHelperOutput(stdout, fallbackError = 'line_suda_oagent_failed') {
  try {
    return JSON.parse(stdout || '{}')
  } catch {
    return { ok: false, error: fallbackError, raw: stdout }
  }
}

function responseStatus(payload = {}) {
  if (payload.ok) return 200
  if (String(payload.error || payload.reason || '').includes('missing_target_group_id')) return 409
  if (String(payload.error || payload.reason || '').includes('target_group_mismatch')) return 409
  if (String(payload.error || payload.reason || '').includes('group_usage_rules_required_before_send')) return 409
  return 400
}

function readJson(file, fallback) {
  if (!existsSync(file)) return fallback
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
}

function appendJsonl(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  appendFileSync(file, `${JSON.stringify(value)}\n`)
}

function readJsonl(file, limit = 500) {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .slice(-limit)
    .map((line) => {
      try { return JSON.parse(line) } catch { return null }
    })
    .filter(Boolean)
}

function normalizeRules(input = {}) {
  return {
    duty: String(input.duty || '').trim(),
    questionPattern: String(input.questionPattern || '').trim(),
    defaultReply: String(input.defaultReply || '').trim(),
    replyRules: String(input.replyRules || '').trim(),
  }
}

function rulesComplete(rules = {}) {
  const normalizedRules = normalizeRules(rules)
  return ['duty', 'questionPattern', 'defaultReply', 'replyRules']
    .every((field) => Boolean(normalizedRules[field]))
}

function rulesStatus(rules = {}, fallback = 'pending_boss_instruction') {
  const normalizedRules = normalizeRules(rules)
  if (rulesComplete(normalizedRules)) return 'response_rules_recorded'
  if (Object.values(normalizedRules).some(Boolean)) return 'pending_group_usage_rules'
  return fallback
}

function collectKnownGroupIds(store, registryLog, captureLog) {
  const ids = new Set(Object.keys(store.groups || {}))
  for (const row of readJsonl(registryLog)) if (row.groupId) ids.add(row.groupId)
  for (const row of readJsonl(captureLog)) if (row.groupId) ids.add(row.groupId)
  return Array.from(ids)
}

function sortGroups(groups) {
  return groups.slice().sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || String(a.groupName || '').localeCompare(String(b.groupName || '')))
}

export function createLineSudaOagentNotifier({
  helper = DEFAULT_HELPER,
  runner,
  rulesFile = DEFAULT_RULES_FILE,
  registryLog = DEFAULT_REGISTRY_LOG,
  captureLog = DEFAULT_CAPTURE_LOG,
} = {}) {
  async function run(args) {
    if (runner) return runner(args)
    try {
      const { stdout } = await execFileAsync(helper, args, {
        maxBuffer: 1024 * 1024,
        env: process.env,
      })
      return parseHelperOutput(stdout)
    } catch (error) {
      const payload = parseHelperOutput(error.stdout, error.message || 'line_suda_oagent_failed')
      return {
        ...payload,
        ok: false,
        error: payload.error || payload.reason || error.message || 'line_suda_oagent_failed',
      }
    }
  }

  return {
    helper,
    responseStatus,
    async verify() {
      return run(['verify'])
    },
    async chatUrl() {
      return run(['chat-url'])
    },
    async setGroupId(groupId) {
      if (!groupId) return { ok: false, error: 'missing_group_id' }
      return run(['set-group-id', '--group-id', groupId])
    },
    async sendTaskSummary({ dryRun = false } = {}) {
      if (dryRun) {
        const verify = await run(['verify'])
        return {
          ok: true,
          dryRun: true,
          wouldRun: `${helper} send-task-summary`,
          verify,
        }
      }
      return run(['send-task-summary'])
    },
    async listGroupRules() {
      const store = readJson(rulesFile, { version: 1, groups: {} })
      const ids = collectKnownGroupIds(store, registryLog, captureLog)
      const groups = []
      for (const groupId of ids) {
        const existing = store.groups?.[groupId] || {}
        let details = null
        if (!existing.groupName || existing.memberCount == null) {
          details = await run(['group-details', '--group-id', groupId, '--member-limit', '0'])
        }
        groups.push({
          groupId,
          groupIdMasked: existing.groupIdMasked || details?.groupIdMasked || '',
          groupName: existing.groupName || details?.groupName || '',
          memberCount: existing.memberCount ?? details?.memberCount ?? null,
          memberNamesReadable: existing.memberNamesReadable || [],
          responseRules: normalizeRules(existing.responseRules || existing),
          status: rulesStatus(existing.responseRules || existing, existing.status || 'pending_boss_instruction'),
          updatedAt: existing.updatedAt || null,
          sourceMessageText: existing.sourceMessageText || '',
          detailError: details?.ok === false ? details.error : null,
        })
      }
      return {
        ok: true,
        groups: sortGroups(groups),
        rulesFile,
        registryLog,
      }
    },
    async saveGroupRules(groupId, rules = {}) {
      if (!groupId) return { ok: false, error: 'missing_group_id' }
      const store = readJson(rulesFile, { version: 1, groups: {} })
      const current = store.groups?.[groupId] || {}
      const details = await run(['group-details', '--group-id', groupId, '--member-limit', '0'])
      if (details?.ok === false) return details
      const nextRules = { ...normalizeRules(current.responseRules || current), ...normalizeRules(rules) }
      const group = {
        groupId,
        groupIdMasked: current.groupIdMasked || details.groupIdMasked || '',
        groupName: details.groupName || current.groupName || '',
        memberCount: details.memberCount ?? current.memberCount ?? null,
        memberNamesReadable: current.memberNamesReadable || [],
        responseRules: nextRules,
        status: rulesStatus(nextRules),
        updatedAt: new Date().toISOString(),
        updatedByUserId: 'omni_settings',
        sourceMessageText: current.sourceMessageText || '',
      }
      const nextStore = { version: 1, groups: { ...(store.groups || {}), [groupId]: group } }
      writeJson(rulesFile, nextStore)
      appendJsonl(registryLog, {
        recordedAt: group.updatedAt,
        type: 'group_response_rules_saved_from_settings',
        groupId,
        groupIdMasked: group.groupIdMasked,
        groupName: group.groupName,
        memberCount: group.memberCount,
        ...nextRules,
        responseRules: nextRules,
        status: group.status,
        helperResult: { ok: true, source: 'omni_settings' },
      })
      return { ok: true, group, rulesFile, registryLog }
    },
  }
}
