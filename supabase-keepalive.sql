-- GitHub Actionsからデータを読み書きせず、DBへの安全な稼働確認だけを行います。
-- Supabase SQL Editorで一度だけ実行してください。

create or replace function public.keep_project_active()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('ok', true, 'checked_at', now());
$$;

revoke all on function public.keep_project_active() from public;
grant execute on function public.keep_project_active() to anon, authenticated;

comment on function public.keep_project_active() is
  'Data-free health check used by the scheduled GitHub Actions keepalive.';
