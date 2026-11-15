-- Run locally after all migrations. Fictional fixtures, rolled back.
begin;
create temporary table isolation_ids (name text primary key, id uuid not null);
insert into isolation_ids select 'person' || n, ('81000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid from generate_series(1,7) n;
insert into auth.users(id) select id from isolation_ids;
insert into profiles(id, role, display_name)
select id, (case name when 'person1' then 'admin' when 'person2' then 'instructor'
 when 'person3' then 'instructor' when 'person4' then 'instructor' when 'person7' then 'reviewer' else 'student' end)::user_role,
 'Fictional isolation ' || name from isolation_ids
on conflict(id) do update set role=excluded.role;
insert into courses(id,title,is_library,published,delivery_mode) values
 ('82000000-0000-0000-0000-000000000001','Global fixture',true,true,'self_paced');
insert into modules(id,course_id,position,title,concept,published) values
 ('83000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001',1,'Global module','Fixture',true);
insert into lessons(id,module_id,position,title) values
 ('84000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000001',1,'Global lesson');
insert into activities(id,lesson_id,position,type,concept,content) values
 ('85000000-0000-0000-0000-000000000001','84000000-0000-0000-0000-000000000001',1,'content','Fixture','{"markdown":"Original global text"}');
insert into activity_keys(activity_id,key) values ('85000000-0000-0000-0000-000000000001','{"solution":"fictional"}');
-- Simulate a pre-existing non-library global original owned by an instructor.
insert into courses(id,title,owner_id,published) values
 ('82000000-0000-0000-0000-000000000004','Existing global original','81000000-0000-0000-0000-000000000002',true);
delete from local_curricula where course_id='82000000-0000-0000-0000-000000000004';
grant all on isolation_ids to authenticated;
create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', message; end if; end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000002',true);
select pg_temp.assert(not public.can_edit_course('82000000-0000-0000-0000-000000000004'),'Instructor owner can edit a non-library global original');
-- Newly authored instructor content is local before it is attached to a class.
insert into courses(id,title,owner_id,published) values
 ('82000000-0000-0000-0000-000000000003','New instructor draft',auth.uid(),true);
select pg_temp.assert(public.can_edit_course('82000000-0000-0000-0000-000000000003'),'New instructor author cannot edit before attachment');
select pg_temp.assert(exists(select 1 from local_curricula where course_id='82000000-0000-0000-0000-000000000003'),'New instructor course not classified local');
insert into isolation_ids values ('copy',copy_library_course('82000000-0000-0000-0000-000000000001'));
insert into isolation_ids select 'module',id from modules where course_id=(select id from isolation_ids where name='copy');
insert into isolation_ids select 'activity',a.id from activities a join lessons l on l.id=a.lesson_id where l.module_id=(select id from isolation_ids where name='module');
insert into classes(id,name,school,course_id,join_code,created_by)
select '86000000-0000-0000-0000-000000000001','Fictional class','Same editable school label',id,'ISOLATION-ONLY','81000000-0000-0000-0000-000000000002' from isolation_ids where name='copy';
-- A second class needs its own copy, even when the same teacher owns both.
do $$ begin
 begin
  insert into classes(name,school,course_id,join_code,created_by)
  select 'Second class','Different school label',id,'ISOLATION-SECOND',auth.uid() from isolation_ids where name='copy';
  raise exception 'Second local attachment succeeded';
 exception when raise_exception then if sqlerrm not like 'LOCAL_CURRICULUM_ALREADY_ATTACHED:%' then raise; end if; end;
end $$;
update classes set name='Renamed fictional class',course_id=course_id
  where id='86000000-0000-0000-0000-000000000001';
select pg_temp.assert(exists(select 1 from classes where name='Renamed fictional class'),'Harmless class edit failed');
insert into isolation_ids values ('second-copy',copy_library_course('82000000-0000-0000-0000-000000000001'));
insert into classes(name,school,course_id,join_code,created_by)
select 'Independent second class','Different school label',id,'ISOLATION-INDEPENDENT',auth.uid() from isolation_ids where name='second-copy';
reset role;
select set_config('request.jwt.claim.sub','',true);
insert into class_instructors(class_id,instructor_id) values ('86000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000003');
insert into enrollments(class_id,student_id) values ('86000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000005');
-- Simulate a self-enrollment made through the old vulnerable RPC.
insert into course_enrollments(student_id,course_id) select '81000000-0000-0000-0000-000000000006',id from isolation_ids where name='copy';
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000004',true);
select pg_temp.assert(not exists(select 1 from courses where id=(select id from isolation_ids where name='copy')),'Unrelated instructor sees private course');
select pg_temp.assert(not exists(select 1 from modules where id=(select id from isolation_ids where name='module')),'Unrelated instructor sees private module');
select pg_temp.assert(not exists(select 1 from activity_keys where activity_id=(select id from isolation_ids where name='activity')),'Unrelated instructor sees private answer key');
select pg_temp.assert(exists(select 1 from activities where id='85000000-0000-0000-0000-000000000001'),'Published global content is hidden');
do $$ begin
 begin
  insert into classes(name,school,course_id,join_code,created_by)
  select 'Hijack','Same editable school label',id,'ISOLATION-HIJACK',auth.uid() from isolation_ids where name='copy';
  raise exception 'Hijack succeeded';
 exception when raise_exception then if sqlerrm <> 'COURSE_NOT_AVAILABLE' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000003',true);
select pg_temp.assert(public.can_edit_course((select id from isolation_ids where name='copy')),'Co-teacher cannot edit');
update activities set content='{"markdown":"School-specific text"}' where id=(select id from isolation_ids where name='activity');
select pg_temp.assert(exists(select 1 from activity_keys where activity_id=(select id from isolation_ids where name='activity')),'Co-teacher cannot read answer key');
do $$ begin
 begin
  update courses set is_library=true where id=(select id from isolation_ids where name='copy');
  raise exception 'Promotion succeeded';
 exception when raise_exception then if sqlerrm <> 'COURSE_SCOPE_ADMIN_ONLY' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000001',true);
update activities set content='{"markdown":"Updated global text"}' where id='85000000-0000-0000-0000-000000000001';
select pg_temp.assert((select content->>'markdown'='School-specific text' from activities where id=(select id from isolation_ids where name='activity')),'Global update overwrote copy');
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000005',true);
select pg_temp.assert(exists(select 1 from activities where id=(select id from isolation_ids where name='activity')),'Enrolled student cannot read local content');
select pg_temp.assert(not exists(select 1 from activity_keys where activity_id=(select id from isolation_ids where name='activity')),'Student sees answer key');
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000006',true);
select pg_temp.assert(not exists(select 1 from my_courses() where course_id=(select id from isolation_ids where name='copy')),'Legacy self-enrollment leaks class');
select pg_temp.assert(not exists(select 1 from my_module_activities((select id from isolation_ids where name='module'))),'Activities RPC leaks local block IDs');
select pg_temp.assert(not exists(select 1 from my_course_progress((select id from isolation_ids where name='copy'))),'Progress RPC leaks class');
select pg_temp.assert(not exists(select 1 from activities where id=(select id from isolation_ids where name='activity')),'Unenrolled student sees local content');
do $$ begin
 begin
  perform enroll_in_course((select id from isolation_ids where name='copy'));
  raise exception 'Enrollment succeeded';
 exception when raise_exception then if sqlerrm <> 'COURSE_NOT_AVAILABLE' then raise; end if; end;
end $$;
select enroll_in_course('82000000-0000-0000-0000-000000000001');
select pg_temp.assert(exists(select 1 from activities where id='85000000-0000-0000-0000-000000000001'),'Global self-paced enrollment broken');
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000007',true);
select pg_temp.assert(not exists(select 1 from activities where id=(select id from isolation_ids where name='activity')),'Reviewer sees private content');
select pg_temp.assert(exists(select 1 from activities where id='85000000-0000-0000-0000-000000000001'),'Reviewer cannot read global content');
-- Local scope survives removal of the last class and the original template.
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000001',true);
delete from classes where id='86000000-0000-0000-0000-000000000001';
delete from courses where id='82000000-0000-0000-0000-000000000001';
select pg_temp.assert((select content->>'markdown'='School-specific text' from activities where id=(select id from isolation_ids where name='activity')),'Source deletion removed local content');
select pg_temp.assert(exists(select 1 from local_curricula where course_id=(select id from isolation_ids where name='copy')),'Local scope disappeared');
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000004',true);
select pg_temp.assert(not exists(select 1 from courses where id=(select id from isolation_ids where name='copy')),'Orphaned local course became global');
-- Ownership does not preserve staff privileges after a role demotion.
reset role;
update profiles set role='reviewer' where id='81000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000002',true);
select pg_temp.assert(not exists(select 1 from courses where id=(select id from isolation_ids where name='copy')),'Demoted reviewer owner sees orphan local course');
select pg_temp.assert(not public.can_edit_course((select id from isolation_ids where name='copy')),'Demoted reviewer owner can edit');
reset role;
update profiles set role='student' where id='81000000-0000-0000-0000-000000000002';
set local role authenticated;
select pg_temp.assert(not exists(select 1 from courses where id=(select id from isolation_ids where name='copy')),'Demoted student owner sees orphan local course');
reset role;
set local role anon;
select pg_temp.assert(not exists(select 1 from courses where title='Global fixture'),'Anonymous access unexpectedly allowed');
rollback;
