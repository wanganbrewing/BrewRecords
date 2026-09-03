begin;
set local lock_timeout = '5s';
lock table public.organizations, public.organization_members, public.app_snapshots, public.sync_events in share mode;
create schema ledger_safety_backup_20260903;
revoke all on schema ledger_safety_backup_20260903 from public, anon, authenticated;
create table ledger_safety_backup_20260903.organizations as table public.organizations;
create table ledger_safety_backup_20260903.organization_members as table public.organization_members;
create table ledger_safety_backup_20260903.app_snapshots as table public.app_snapshots;
create table ledger_safety_backup_20260903.sync_events as table public.sync_events;
create table ledger_safety_backup_20260903.save_function as
select pg_get_functiondef('public.save_app_snapshot(uuid,jsonb,bigint,text)'::regprocedure) as definition;
create table ledger_safety_backup_20260903.policies as
select * from pg_policies where schemaname='public';
revoke all on all tables in schema ledger_safety_backup_20260903 from public, anon, authenticated;
alter table ledger_safety_backup_20260903.organizations enable row level security;
alter table ledger_safety_backup_20260903.organization_members enable row level security;
alter table ledger_safety_backup_20260903.app_snapshots enable row level security;
alter table ledger_safety_backup_20260903.sync_events enable row level security;
alter table ledger_safety_backup_20260903.save_function enable row level security;
alter table ledger_safety_backup_20260903.policies enable row level security;
commit;
select 'backup_created' as status, count(*) as snapshots, sum(jsonb_array_length(payload->'batches')) as batches from ledger_safety_backup_20260903.app_snapshots;
