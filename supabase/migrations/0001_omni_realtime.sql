-- O-Agent Omni Realtime foundation.
-- Apply this to the existing O-Agent Supabase project before enabling:
-- VITE_OMNI_REALTIME_PROVIDER=supabase

create table if not exists public.omni_pages (
  id text primary key,
  name text not null,
  status text not null check (status in ('active', 'paused', 'archived')),
  brand_group_id text,
  policy_set_id text,
  agent_profile_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.omni_customers (
  id text primary key,
  display_name text not null,
  platform text,
  provider_customer_id text,
  phone text,
  address text,
  contact_json jsonb not null default '{}'::jsonb,
  important_contact_updated_at timestamptz,
  note text,
  match_confidence numeric not null default 0,
  source_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.omni_threads (
  id text primary key,
  provider_thread_id text,
  page_id text not null references public.omni_pages(id),
  platform text not null,
  customer_id text references public.omni_customers(id),
  status text not null check (status in ('open', 'draft_ready', 'needs_approval', 'needs_data', 'auto_sent', 'escalated')),
  intent text not null default 'unknown',
  risk text not null check (risk in ('low', 'medium', 'high')),
  unread_count integer not null default 0,
  message_count integer not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.omni_messages (
  id text primary key,
  thread_id text not null references public.omni_threads(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound', 'system')),
  author_name text not null,
  text text not null,
  provider_message_id text,
  source_ref text,
  created_at timestamptz not null default now()
);

create table if not exists public.omni_orders (
  id text primary key,
  customer_id text references public.omni_customers(id),
  customer_name text,
  customer_phone text,
  customer_email text,
  platform text not null,
  provider_order_id text,
  status text not null,
  approval_status text,
  total_amount numeric not null default 0,
  currency text not null default 'THB',
  payment_method text,
  shipping_method text,
  shipping_address_json jsonb not null default '{}'::jsonb,
  tracking_code text,
  provider_response_json jsonb,
  source_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.omni_payment_requests (
  id text primary key,
  thread_id text references public.omni_threads(id),
  order_id text references public.omni_orders(id),
  provider text not null,
  status text not null check (status in ('draft', 'pending', 'paid', 'failed', 'expired', 'manual_verify', 'cancelled')),
  amount numeric not null,
  currency text not null default 'THB',
  approval_required boolean not null default true,
  provider_ref text,
  source_ref text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.omni_settings (
  id text primary key,
  settings_json jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.omni_ai_decisions (
  id text primary key,
  thread_id text not null references public.omni_threads(id) on delete cascade,
  agent_profile_id text,
  confidence numeric not null default 0,
  action text not null,
  source_ids_json jsonb not null default '[]'::jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.omni_approval_tasks (
  id text primary key,
  thread_id text references public.omni_threads(id),
  kind text not null,
  status text not null check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by text not null,
  reviewed_by text,
  source_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.omni_knowledge_sources (
  id text primary key,
  title text not null,
  type text not null check (type in ('manual', 'website', 'file', 'faq', 'order_policy')),
  scope text not null default 'all_pages',
  status text not null check (status in ('ready', 'training', 'needs_review', 'archived')),
  content text not null,
  tags_json jsonb not null default '[]'::jsonb,
  source_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_omni_threads_page_status on public.omni_threads(page_id, status);
create index if not exists idx_omni_threads_customer on public.omni_threads(customer_id);
create index if not exists idx_omni_messages_thread_created on public.omni_messages(thread_id, created_at);
create index if not exists idx_omni_messages_created on public.omni_messages(created_at);

alter table public.omni_pages replica identity full;
alter table public.omni_customers replica identity full;
alter table public.omni_threads replica identity full;
alter table public.omni_messages replica identity full;
alter table public.omni_orders replica identity full;
alter table public.omni_payment_requests replica identity full;
alter table public.omni_settings replica identity full;
alter table public.omni_ai_decisions replica identity full;
alter table public.omni_approval_tasks replica identity full;
alter table public.omni_knowledge_sources replica identity full;

do $$
declare
  realtime_table text;
begin
  foreach realtime_table in array array[
    'omni_pages',
    'omni_customers',
    'omni_threads',
    'omni_messages',
    'omni_orders',
    'omni_payment_requests',
    'omni_settings',
    'omni_ai_decisions',
    'omni_approval_tasks',
    'omni_knowledge_sources'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = realtime_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', realtime_table);
    end if;
  end loop;
end $$;
