begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $test$
declare
  org_id uuid;
  actor_id uuid;
  saved_payload jsonb;
  rev bigint;
  next_rev bigint;
  initial_history bigint;
  role_name text;
  blocked boolean;
begin
  select s.organization_id, m.user_id, s.payload, s.revision
  into org_id, actor_id, saved_payload, rev
  from public.app_snapshots s
  join public.organization_members m on m.organization_id=s.organization_id
  where m.role='owner' order by s.organization_id limit 1;
  if org_id is null then raise exception 'test_fixture_missing'; end if;
  select count(*) into initial_history from public.app_snapshot_history where organization_id=org_id;
  perform set_config('request.jwt.claim.sub', actor_id::text, true);

  foreach role_name in array array['owner','admin','brewer'] loop
    update public.organization_members set role=role_name where organization_id=org_id and user_id=actor_id;
    execute 'set local role authenticated';
    next_rev := public.save_app_snapshot(org_id, saved_payload, rev, 'safety-rollback-test');
    execute 'reset role';
    if next_rev<>rev+1 then raise exception 'revision_increment_failed'; end if;
    if not exists(select 1 from public.app_snapshot_history where organization_id=org_id and revision=rev and payload=saved_payload) then
      raise exception 'history_payload_failed';
    end if;
    rev:=next_rev;
  end loop;

  update public.organization_members set role='viewer' where organization_id=org_id and user_id=actor_id;
  execute 'set local role authenticated';
  blocked:=false;
  begin perform public.save_app_snapshot(org_id,saved_payload,rev,'viewer-test');
  exception when others then
    if sqlerrm='permission_denied' then blocked:=true; else raise; end if;
  end;
  if not blocked then raise exception 'viewer_write_not_blocked'; end if;
  if (select count(*) from public.app_snapshot_history where organization_id=org_id)<>initial_history+3 then
    raise exception 'viewer_history_read_failed';
  end if;
  execute 'reset role';

  update public.organization_members set role='owner' where organization_id=org_id and user_id=actor_id;
  execute 'set local role authenticated';
  blocked:=false;
  begin perform public.save_app_snapshot(org_id,saved_payload,rev-1,'conflict-test');
  exception when others then
    if sqlerrm like 'sync_conflict:%' then blocked:=true; else raise; end if;
  end;
  if not blocked then raise exception 'conflict_not_blocked'; end if;
  blocked:=false;
  begin perform public.save_app_snapshot(org_id,'{"batches":null,"inventory":[]}'::jsonb,rev,'invalid-test');
  exception when others then
    if sqlerrm='invalid_snapshot' then blocked:=true; else raise; end if;
  end;
  if not blocked then raise exception 'invalid_payload_not_blocked'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  execute 'set local role authenticated';
  if (select count(*) from public.app_snapshots)<>0 or (select count(*) from public.app_snapshot_history)<>0 then
    raise exception 'nonmember_read_not_blocked';
  end if;
  blocked:=false;
  begin perform public.save_app_snapshot(org_id,saved_payload,rev,'nonmember-test');
  exception when others then
    if sqlerrm='permission_denied' then blocked:=true; else raise; end if;
  end;
  if not blocked then raise exception 'nonmember_write_not_blocked'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub','',true);
  blocked:=false;
  begin perform public.save_app_snapshot(org_id,saved_payload,rev,'unauthenticated-test');
  exception when others then
    if sqlerrm='authentication_required' then blocked:=true; else raise; end if;
  end;
  if not blocked then raise exception 'unauthenticated_write_not_blocked'; end if;

  if has_function_privilege('anon','public.save_app_snapshot(uuid,jsonb,bigint,text)','EXECUTE') then
    raise exception 'anon_rpc_privilege';
  end if;
  if has_table_privilege('authenticated','public.app_snapshot_history','INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated','public.app_snapshots','INSERT,UPDATE,DELETE')
    or has_schema_privilege('authenticated','ledger_safety_backup_20260903','USAGE')
    or has_schema_privilege('anon','ledger_safety_backup_20260903','USAGE') then
    raise exception 'direct_write_or_backup_access';
  end if;
  if (select count(*) from public.app_snapshot_history where organization_id=org_id)<>initial_history+3 then
    raise exception 'failed_operations_changed_history';
  end if;
end
$test$;
rollback;
select 'all_server_checks_passed_and_rolled_back' as status,
       (select count(*) from public.app_snapshot_history) as history_after_rollback,
       s.revision, md5(s.payload::text) as payload_hash,
       s.payload=b.payload and s.revision=b.revision as unchanged_from_backup
from public.app_snapshots s
join ledger_safety_backup_20260903.app_snapshots b using (organization_id);
