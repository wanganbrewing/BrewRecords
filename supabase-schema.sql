-- Fermenter's Ledger: commercial-ready starter schema
-- Supabase SQL Editorで一度だけ実行します。

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','brewer','viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.app_snapshots (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  payload jsonb not null default '{"schemaVersion":1,"batches":[],"inventory":[]}'::jsonb,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  device_id text
);

create table if not exists public.sync_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  device_id text,
  revision bigint not null,
  action text not null check (action in ('create','update','restore')),
  created_at timestamptz not null default now()
);

create index if not exists sync_events_org_created_idx
  on public.sync_events (organization_id, created_at desc);

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

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members membership
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
  );
$$;

revoke all on function public.is_organization_member(uuid) from public;
grant execute on function public.is_organization_member(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.app_snapshots enable row level security;
alter table public.sync_events enable row level security;
alter table public.app_snapshot_history enable row level security;
revoke all on table public.app_snapshot_history from anon, authenticated;
grant select on table public.app_snapshot_history to authenticated;
drop policy if exists "members_read_snapshot_history" on public.app_snapshot_history;
create policy "members_read_snapshot_history"
on public.app_snapshot_history for select to authenticated
using (public.is_organization_member(organization_id));

revoke all on table public.organizations from anon, authenticated;
revoke all on table public.organization_members from anon, authenticated;
revoke all on table public.app_snapshots from anon, authenticated;
revoke all on table public.sync_events from anon, authenticated;

grant select on table public.organizations to authenticated;
grant select on table public.organization_members to authenticated;
grant select on table public.app_snapshots to authenticated;
grant select on table public.sync_events to authenticated;

drop policy if exists "members_read_organizations" on public.organizations;
create policy "members_read_organizations"
on public.organizations for select to authenticated
using (public.is_organization_member(id));

drop policy if exists "members_read_memberships" on public.organization_members;
create policy "members_read_memberships"
on public.organization_members for select to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists "members_read_snapshots" on public.app_snapshots;
create policy "members_read_snapshots"
on public.app_snapshots for select to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists "members_read_sync_events" on public.sync_events;
create policy "members_read_sync_events"
on public.sync_events for select to authenticated
using (public.is_organization_member(organization_id));

create or replace function public.create_personal_organization(organization_name text default '個人ワークスペース')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  result_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;

  select membership.organization_id into result_id
  from public.organization_members membership
  where membership.user_id = current_user_id
  order by membership.created_at
  limit 1;

  if result_id is not null then
    return result_id;
  end if;

  insert into public.organizations (name, owner_user_id)
  values (coalesce(nullif(trim(organization_name), ''), '個人ワークスペース'), current_user_id)
  returning id into result_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (result_id, current_user_id, 'owner');

  insert into public.app_snapshots (organization_id, updated_by)
  values (result_id, current_user_id);

  insert into public.sync_events (organization_id, user_id, revision, action)
  values (result_id, current_user_id, 0, 'create');

  return result_id;
end;
$$;

revoke all on function public.create_personal_organization(text) from public;
grant execute on function public.create_personal_organization(text) to authenticated;

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

-- 無料プランの低アクティビティ停止を避けるためのデータ非参照ヘルスチェック。
-- GitHub Actionsの supabase-keepalive.yml から1日3回呼び出します。
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
