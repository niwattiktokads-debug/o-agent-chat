-- O-Agent Omnichannel Inbox durable memory schema.
-- SQLite-first DDL with table shapes kept portable for a later Postgres/Supabase migration.

CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'archived')),
  brand_group_id TEXT,
  policy_set_id TEXT,
  agent_profile_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_accounts (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES pages(id),
  platform TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'disabled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS brand_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  inventory_source TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS policy_sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tone TEXT,
  auto_send_json TEXT NOT NULL DEFAULT '{}',
  forbidden_json TEXT NOT NULL DEFAULT '[]',
  source_ref TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  role TEXT NOT NULL,
  fallback_agent_id TEXT REFERENCES agent_profiles(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  platform TEXT,
  provider_customer_id TEXT,
  phone TEXT,
  address TEXT,
  contact_json TEXT NOT NULL DEFAULT '{}',
  important_contact_updated_at TEXT,
  note TEXT,
  match_confidence REAL NOT NULL DEFAULT 0,
  source_ref TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  provider_thread_id TEXT,
  page_id TEXT NOT NULL REFERENCES pages(id),
  platform TEXT NOT NULL,
  customer_id TEXT REFERENCES customers(id),
  status TEXT NOT NULL CHECK (status IN ('open', 'draft_ready', 'needs_approval', 'needs_data', 'auto_sent', 'escalated')),
  intent TEXT NOT NULL DEFAULT 'unknown',
  risk TEXT NOT NULL CHECK (risk IN ('low', 'medium', 'high')),
  unread_count INTEGER NOT NULL DEFAULT 0,
  message_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'system')),
  author_name TEXT NOT NULL,
  text TEXT NOT NULL,
  provider_message_id TEXT,
  source_ref TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS retention_policies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  target TEXT NOT NULL CHECK (target IN ('chat_messages')),
  enabled INTEGER NOT NULL DEFAULT 1,
  delete_after_days INTEGER NOT NULL DEFAULT 180,
  preserve_customer_profile INTEGER NOT NULL DEFAULT 1,
  preserve_fields_json TEXT NOT NULL DEFAULT '[]',
  mode TEXT NOT NULL CHECK (mode IN ('delete_messages_keep_customer_profile')),
  source_ref TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS retention_runs (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL REFERENCES retention_policies(id),
  target TEXT NOT NULL,
  dry_run INTEGER NOT NULL DEFAULT 1,
  cutoff_at TEXT NOT NULL,
  delete_after_days INTEGER NOT NULL,
  messages_deleted INTEGER NOT NULL DEFAULT 0,
  threads_touched INTEGER NOT NULL DEFAULT 0,
  customers_updated INTEGER NOT NULL DEFAULT 0,
  source_ref TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id),
  platform TEXT NOT NULL,
  provider_order_id TEXT,
  status TEXT NOT NULL,
  total_amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'THB',
  tracking_code TEXT,
  source_ref TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_links (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  link_reason TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  source_ref TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_snapshots (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL,
  source TEXT NOT NULL,
  available INTEGER NOT NULL DEFAULT 0,
  source_ref TEXT,
  checked_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_requests (
  id TEXT PRIMARY KEY,
  thread_id TEXT REFERENCES threads(id),
  order_id TEXT REFERENCES orders(id),
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'pending', 'paid', 'failed', 'expired', 'manual_verify', 'cancelled')),
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'THB',
  approval_required INTEGER NOT NULL DEFAULT 1,
  provider_ref TEXT,
  source_ref TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_events (
  id TEXT PRIMARY KEY,
  payment_request_id TEXT NOT NULL REFERENCES payment_requests(id),
  type TEXT NOT NULL,
  source TEXT NOT NULL,
  source_ref TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS omni_settings (
  id TEXT PRIMARY KEY,
  settings_json TEXT NOT NULL DEFAULT '{}',
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_decisions (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id),
  agent_profile_id TEXT REFERENCES agent_profiles(id),
  confidence REAL NOT NULL DEFAULT 0,
  action TEXT NOT NULL,
  source_ids_json TEXT NOT NULL DEFAULT '[]',
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS action_audits (
  id TEXT PRIMARY KEY,
  thread_id TEXT REFERENCES threads(id),
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('human', 'ai', 'system')),
  actor_id TEXT,
  before_json TEXT,
  after_json TEXT,
  approval_task_id TEXT,
  source_ref TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS approval_tasks (
  id TEXT PRIMARY KEY,
  thread_id TEXT REFERENCES threads(id),
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by TEXT NOT NULL,
  reviewed_by TEXT,
  source_ref TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS connector_health (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'disabled')),
  last_checked_at TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS knowledge_sources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('manual', 'website', 'file', 'faq', 'order_policy')),
  scope TEXT NOT NULL DEFAULT 'all_pages',
  status TEXT NOT NULL CHECK (status IN ('ready', 'training', 'needs_review', 'archived')),
  content TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  source_ref TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_threads_page_status ON threads(page_id, status);
CREATE INDEX IF NOT EXISTS idx_threads_customer ON threads(customer_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread_created ON messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_retention_runs_policy_created ON retention_runs(policy_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_thread ON payment_requests(thread_id);
CREATE INDEX IF NOT EXISTS idx_omni_settings_updated ON omni_settings(updated_at);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_thread ON ai_decisions(thread_id);
CREATE INDEX IF NOT EXISTS idx_action_audits_thread ON action_audits(thread_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_status ON knowledge_sources(status);
