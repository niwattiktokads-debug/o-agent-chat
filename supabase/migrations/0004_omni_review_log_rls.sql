-- Review-log storage for Vercel draft-only AI replies.
-- Keeps browser clients read-only while allowing guarded serverless review logs.

create table if not exists public.omni_action_audits (
  id text primary key,
  thread_id text references public.omni_threads(id) on delete set null,
  action text not null,
  actor_type text not null check (actor_type in ('human', 'ai', 'system')),
  actor_id text,
  before_json jsonb,
  after_json jsonb,
  approval_task_id text references public.omni_approval_tasks(id) on delete set null,
  source_ref text,
  created_at timestamptz not null default now()
);

create index if not exists idx_omni_action_audits_thread_created
  on public.omni_action_audits(thread_id, created_at desc);

create index if not exists idx_omni_ai_decisions_thread_created
  on public.omni_ai_decisions(thread_id, created_at desc);

alter table public.omni_action_audits replica identity full;
alter table public.omni_action_audits enable row level security;
alter table public.omni_ai_decisions enable row level security;

grant select on public.omni_action_audits to anon, authenticated;
grant insert on public.omni_action_audits to anon, authenticated;
grant insert on public.omni_ai_decisions to anon, authenticated;

drop policy if exists omni_realtime_read on public.omni_action_audits;
create policy omni_realtime_read
  on public.omni_action_audits
  for select
  to anon, authenticated
  using (true);

drop policy if exists omni_review_log_insert on public.omni_action_audits;
create policy omni_review_log_insert
  on public.omni_action_audits
  for insert
  to anon, authenticated
  with check (
    actor_type in ('ai', 'human', 'system')
    and action in (
      'ai_reply_draft_created',
      'ai_reply_draft_failed',
      'manual_reply_draft_created',
      'customer_message_sent',
      'payment_request_created',
      'order_draft_created',
      'order_draft_approved_zort_created',
      'order_draft_approved',
      'omni_settings_updated',
      'page_runtime_settings_updated',
      'page_auto_reply_enabled',
      'page_auto_reply_disabled'
    )
  );

drop policy if exists omni_ai_decision_insert on public.omni_ai_decisions;
create policy omni_ai_decision_insert
  on public.omni_ai_decisions
  for insert
  to anon, authenticated
  with check (
    action in ('draft_ready', 'needs_approval', 'needs_data', 'auto_sent', 'escalated')
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'omni_action_audits'
  ) then
    alter publication supabase_realtime add table public.omni_action_audits;
  end if;
end $$;
