-- 第1段階の安全性強化。既存プロジェクト用。新規作成は supabase-schema.sql を使用。
-- 事前に現状のバックアップを取得し、検証環境で確認してから適用してください。
begin;

-- 保存前の版をサーバー側で保持。クライアントから履歴の更新・削除は許可しない。
create table if not exists public.app_snapshot_history (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  revision bigint not null,
  payload jsonb not null,
  updated_at timestamptz not null,
  updated_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz not null default now(),
  archived_by uuid references auth.users(id) on delete set null,
  primary key (organization_id, revision)
);

alter table public.app_snapshot_history enable row level security;
revoke all on table public.app_snapshot_history from anon, authenticated;
grant select on table public.app_snapshot_history to authenticated;
drop policy if exists "members_read_snapshot_history" on public.app_snapshot_history;
create policy "members_read_snapshot_history"
on public.app_snapshot_history for select to authenticated
using (public.is_organization_member(organization_id));

create or replace function public.save_app_snapshot(
  target_organization_id uuid,
  snapshot_payload jsonb,
  expected_revision bigint,
  source_device_id text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_revision bigint;
  next_revision bigint;
  member_role text;
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;
  select membership.role into member_role
  from public.organization_members membership
  where membership.organization_id = target_organization_id
    and membership.user_id = current_user_id
  for share;
  if member_role is null or member_role not in ('owner', 'admin', 'brewer') then
    raise exception 'permission_denied';
  end if;
  if snapshot_payload is null or jsonb_typeof(snapshot_payload) <> 'object' then
    raise exception 'invalid_snapshot';
  end if;
  if jsonb_typeof(snapshot_payload->'batches') is distinct from 'array'
     or jsonb_typeof(snapshot_payload->'inventory') is distinct from 'array' then
    raise exception 'invalid_snapshot';
  end if;

  select snapshot.revision into current_revision
  from public.app_snapshots snapshot
  where snapshot.organization_id = target_organization_id
  for update;

  if current_revision is null then
    raise exception 'snapshot_not_found';
  end if;
  if current_revision <> coalesce(expected_revision, 0) then
    raise exception 'sync_conflict:%', current_revision;
  end if;

  next_revision := current_revision + 1;
  insert into public.app_snapshot_history
    (organization_id, revision, payload, updated_at, updated_by, archived_by)
  select organization_id, revision, payload, updated_at, updated_by, current_user_id
  from public.app_snapshots
  where organization_id = target_organization_id;

  update public.app_snapshots
  set payload = snapshot_payload,
      revision = next_revision,
      updated_at = now(),
      updated_by = current_user_id,
      device_id = left(source_device_id, 200)
  where organization_id = target_organization_id;

  insert into public.sync_events (organization_id, user_id, device_id, revision, action)
  values (target_organization_id, current_user_id, left(source_device_id, 200), next_revision, 'update');

  return next_revision;
end;
$$;

revoke all on function public.save_app_snapshot(uuid, jsonb, bigint, text) from public, anon;
grant execute on function public.save_app_snapshot(uuid, jsonb, bigint, text) to authenticated;


commit;
