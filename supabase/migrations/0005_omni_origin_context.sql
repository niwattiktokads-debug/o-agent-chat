-- Durable customer origin context for narrower AI replies.
-- Stores ad/post/referral/product hints on threads and messages.

alter table public.omni_threads
  add column if not exists origin_context_json jsonb not null default '{}'::jsonb;

alter table public.omni_messages
  add column if not exists origin_context_json jsonb not null default '{}'::jsonb;

create index if not exists idx_omni_threads_origin_context_gin
  on public.omni_threads using gin (origin_context_json);

create index if not exists idx_omni_messages_origin_context_gin
  on public.omni_messages using gin (origin_context_json);

create or replace function public.omni_ingest_normalized(payload jsonb, ingest_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_secret text;
  customer_count integer := 0;
  thread_count integer := 0;
  message_count integer := 0;
begin
  select settings_json->>'secret'
    into expected_secret
    from public.omni_settings
    where id = '__webhook_ingest';

  if coalesce(expected_secret, '') = '' or ingest_secret is distinct from expected_secret then
    raise exception 'invalid_webhook_ingest_secret' using errcode = '42501';
  end if;

  insert into public.omni_pages (id, name, status, updated_at)
  select distinct
    thread_row."pageId",
    thread_row."pageId",
    'active',
    now()
  from jsonb_to_recordset(coalesce(payload->'threads', '[]'::jsonb)) as thread_row("pageId" text)
  where coalesce(thread_row."pageId", '') <> ''
  on conflict (id) do nothing;

  insert into public.omni_customers (
    id,
    display_name,
    platform,
    provider_customer_id,
    phone,
    address,
    contact_json,
    match_confidence,
    source_ref,
    updated_at
  )
  select
    customer.id,
    coalesce(customer."displayName", 'Customer'),
    customer.platform,
    customer."providerCustomerId",
    customer.phone,
    customer.address,
    coalesce(customer."contactJson", '{}'::jsonb),
    coalesce(customer."matchConfidence", 0),
    customer."sourceRef",
    now()
  from jsonb_to_recordset(coalesce(payload->'customers', '[]'::jsonb)) as customer(
    id text,
    "displayName" text,
    platform text,
    "providerCustomerId" text,
    phone text,
    address text,
    "contactJson" jsonb,
    "matchConfidence" numeric,
    "sourceRef" text
  )
  where coalesce(customer.id, '') <> ''
  on conflict (id) do update set
    display_name = excluded.display_name,
    platform = excluded.platform,
    provider_customer_id = excluded.provider_customer_id,
    phone = coalesce(excluded.phone, public.omni_customers.phone),
    address = coalesce(excluded.address, public.omni_customers.address),
    contact_json = public.omni_customers.contact_json || excluded.contact_json,
    match_confidence = excluded.match_confidence,
    source_ref = excluded.source_ref,
    updated_at = now();
  get diagnostics customer_count = row_count;

  insert into public.omni_threads (
    id,
    provider_thread_id,
    page_id,
    platform,
    customer_id,
    status,
    intent,
    risk,
    unread_count,
    message_count,
    updated_at,
    origin_context_json
  )
  select
    thread.id,
    thread."providerThreadId",
    thread."pageId",
    thread.platform,
    thread."customerId",
    coalesce(thread.status, 'open'),
    coalesce(thread.intent, 'unknown'),
    coalesce(thread.risk, 'medium'),
    coalesce(thread."unreadCount", 1),
    coalesce(thread."messageCount", 1),
    coalesce(thread."updatedAt", now()),
    coalesce(thread."originContext", '{}'::jsonb)
  from jsonb_to_recordset(coalesce(payload->'threads', '[]'::jsonb)) as thread(
    id text,
    "providerThreadId" text,
    "pageId" text,
    platform text,
    "customerId" text,
    status text,
    intent text,
    risk text,
    "unreadCount" integer,
    "messageCount" integer,
    "updatedAt" timestamptz,
    "originContext" jsonb
  )
  where coalesce(thread.id, '') <> ''
  on conflict (id) do update set
    provider_thread_id = excluded.provider_thread_id,
    page_id = excluded.page_id,
    platform = excluded.platform,
    customer_id = excluded.customer_id,
    status = excluded.status,
    intent = excluded.intent,
    risk = excluded.risk,
    unread_count = greatest(public.omni_threads.unread_count, excluded.unread_count),
    message_count = greatest(public.omni_threads.message_count, excluded.message_count),
    updated_at = greatest(public.omni_threads.updated_at, excluded.updated_at),
    origin_context_json = public.omni_threads.origin_context_json || excluded.origin_context_json;
  get diagnostics thread_count = row_count;

  insert into public.omni_messages (
    id,
    thread_id,
    direction,
    author_name,
    text,
    provider_message_id,
    source_ref,
    origin_context_json,
    created_at
  )
  select
    message.id,
    message."threadId",
    coalesce(message.direction, 'inbound'),
    coalesce(message."authorName", 'Customer'),
    coalesce(message.text, ''),
    message."providerMessageId",
    message."sourceRef",
    coalesce(message."originContext", '{}'::jsonb),
    coalesce(message."createdAt", now())
  from jsonb_to_recordset(coalesce(payload->'messages', '[]'::jsonb)) as message(
    id text,
    "threadId" text,
    direction text,
    "authorName" text,
    text text,
    "providerMessageId" text,
    "sourceRef" text,
    "originContext" jsonb,
    "createdAt" timestamptz
  )
  where coalesce(message.id, '') <> ''
    and coalesce(message."threadId", '') <> ''
    and coalesce(message.text, '') <> ''
  on conflict (id) do nothing;
  get diagnostics message_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'source', payload->>'source',
    'customers', customer_count,
    'threads', thread_count,
    'messages', message_count
  );
end;
$$;

revoke all on function public.omni_ingest_normalized(jsonb, text) from public;
grant execute on function public.omni_ingest_normalized(jsonb, text) to anon, authenticated;
