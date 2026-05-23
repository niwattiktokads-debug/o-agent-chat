import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url))

export const REQUIRED_OMNI_TABLES = [
  'pages',
  'platform_accounts',
  'brand_groups',
  'policy_sets',
  'agent_profiles',
  'customers',
  'threads',
  'messages',
  'orders',
  'order_links',
  'inventory_snapshots',
  'payment_requests',
  'payment_events',
  'ai_decisions',
  'action_audits',
  'approval_tasks',
  'connector_health',
  'knowledge_sources',
]

export function loadOmniSchemaSql() {
  return readFileSync(schemaPath, 'utf8')
}

export function getOmniSchemaSummary() {
  const sql = loadOmniSchemaSql()
  return {
    dialect: 'sqlite_first_postgres_compatible',
    tableCount: REQUIRED_OMNI_TABLES.length,
    tables: REQUIRED_OMNI_TABLES,
    hasPaymentApprovalGuard: /approval_required\s+INTEGER\s+NOT NULL\s+DEFAULT\s+1/.test(sql),
    hasAuditLog: /CREATE TABLE IF NOT EXISTS action_audits/.test(sql),
    hasSourceRefs: /source_ref/.test(sql),
  }
}
