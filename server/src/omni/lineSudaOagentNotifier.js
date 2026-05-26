import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const DEFAULT_HELPER = process.env.LINE_SUDA_OAGENT_HELPER || '/Users/babycuca/.codex/bin/line-suda-oagent'

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
  return 400
}

export function createLineSudaOagentNotifier({ helper = DEFAULT_HELPER, runner } = {}) {
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
  }
}
