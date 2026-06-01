-- Allow the browser client to receive Supabase Realtime postgres_changes
-- without granting anonymous write access.

grant usage on schema public to anon, authenticated;

do $$
declare
  omni_table text;
begin
  foreach omni_table in array array[
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
    execute format('alter table public.%I enable row level security', omni_table);
    execute format('grant select on public.%I to anon, authenticated', omni_table);
    execute format('drop policy if exists omni_realtime_read on public.%I', omni_table);
    execute format(
      'create policy omni_realtime_read on public.%I for select to anon, authenticated using (true)',
      omni_table
    );
  end loop;
end $$;
