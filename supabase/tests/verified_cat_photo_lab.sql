begin;
insert into auth.users (id) values ('81000000-0000-0000-0000-000000000001'), ('81000000-0000-0000-0000-000000000002');
insert into profiles (id, role, display_name) values
 ('81000000-0000-0000-0000-000000000001', 'student', 'Test learner'),
 ('81000000-0000-0000-0000-000000000002', 'student', 'Unenrolled learner')
on conflict (id) do update set role = excluded.role;
insert into courses (id, title, published) values ('82000000-0000-0000-0000-000000000001', 'Cat lab QA', true);
insert into modules (id, course_id, position, title, concept, published) values
 ('83000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', 1, 'QA', 'HTML', true);
insert into lessons (id, module_id, position, title) values
 ('84000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', 1, 'QA');
insert into activities (id, lesson_id, position, type, concept, content) values
 ('85000000-0000-0000-0000-000000000001', '84000000-0000-0000-0000-000000000001', 1, 'code', 'HTML', '{"lab":{"verifier":"cat-photo-v1"}}');
insert into course_enrollments (course_id, student_id) values
 ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
do $$ begin
  if has_function_privilege(current_user, 'public.record_cat_photo_pass(uuid,uuid,text)', 'execute') then
    raise exception 'A student can write a verified completion';
  end if;
  begin
    perform public.submit_attempt('85000000-0000-0000-0000-000000000001', '{}', 0);
    raise exception 'An ordinary attempt bypassed the required lab check';
  exception when raise_exception then
    if sqlerrm <> 'CAT_PHOTO_CHECK_REQUIRED' then raise; end if;
  end;
end $$;

reset role;
set local role service_role;
do $$ begin
  begin
    perform public.record_cat_photo_pass('81000000-0000-0000-0000-000000000002', '85000000-0000-0000-0000-000000000001', 'QA');
    raise exception 'An unenrolled learner received completion';
  exception when raise_exception then
    if sqlerrm <> 'LAB_UNAVAILABLE' then raise; end if;
  end;
end $$;
select public.record_cat_photo_pass('81000000-0000-0000-0000-000000000001', '85000000-0000-0000-0000-000000000001', '<p>Verified in the Edge Function</p>');
select public.record_cat_photo_pass('81000000-0000-0000-0000-000000000001', '85000000-0000-0000-0000-000000000001', '<p>Verified in the Edge Function</p>');

reset role;
set local role authenticated;
do $$ begin
  if not exists (
    select 1 from public.my_module_activities('83000000-0000-0000-0000-000000000001')
    where submitted and best_score = 1 and tries = 1
  ) then raise exception 'Verified completion did not persist exactly once'; end if;
end $$;
rollback;
