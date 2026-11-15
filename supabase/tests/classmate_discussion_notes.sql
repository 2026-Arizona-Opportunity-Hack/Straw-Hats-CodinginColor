begin;
insert into auth.users (id)
select ('91000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 22) n;
update profiles set role = 'instructor' where id in ('91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002');
insert into courses (id, title, published) values
 ('92000000-0000-0000-0000-000000000001', 'Discussion QA Web', true),
 ('92000000-0000-0000-0000-000000000002', 'Discussion QA Python', true);
-- The same global template is intentionally assigned to both classes.
update courses set is_library=true where id='92000000-0000-0000-0000-000000000002';
insert into modules (id, course_id, position, title, concept, published) values
 ('93000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 1, 'QA', 'HTML', true);
insert into lessons (id, module_id, position, title) values
 ('94000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', 1, 'QA');
insert into activities (id, lesson_id, position, type, concept, content) values
 ('95000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001', 1, 'worksheet', 'HTML',
  '{"discussion_enabled":true,"fields":[{"id":"f0","kind":"long_answer","prompt":"Pitch your page"}]}');
insert into classes (id, name, school, course_id, join_code, created_by) values
 ('96000000-0000-0000-0000-000000000001', 'Cohort A', 'QA', '92000000-0000-0000-0000-000000000002', 'QA-NOTES-A', '91000000-0000-0000-0000-000000000001'),
 ('96000000-0000-0000-0000-000000000002', 'Cohort B', 'QA', '92000000-0000-0000-0000-000000000002', 'QA-NOTES-B', '91000000-0000-0000-0000-000000000002');
insert into enrollments (class_id, student_id)
select case when id = '91000000-0000-0000-0000-000000000004' then '96000000-0000-0000-0000-000000000002'::uuid
 else '96000000-0000-0000-0000-000000000001'::uuid end, id from profiles where id::text like '91000000-%' and role = 'student';
insert into course_enrollments (student_id, course_id)
select id, '92000000-0000-0000-0000-000000000001' from profiles where id::text like '91000000-%' and role = 'student';
insert into curriculum_private.discussion_audiences values
 ('95000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000001');

set local role authenticated;
do $$
declare
  activity_id constant uuid := '95000000-0000-0000-0000-000000000001';
  uid text;
  notes jsonb;
  hidden_id uuid;
begin
  for n in 4..22 loop
    uid := '91000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0');
    perform set_config('request.jwt.claim.sub', uid, true);
    perform public.submit_attempt(activity_id,
      jsonb_build_object('fields', jsonb_build_object('f0', 'Response ' || n, 'extra', 'Private extra field'), 'share_discussion', true), 0);
  end loop;
  if public.my_discussion_notes(activity_id) -> 'enabled' is distinct from 'true'::jsonb then
    raise exception 'Enrolled cohort member cannot use the reflection';
  end if;
  perform set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000004', true);
  if public.my_discussion_notes(activity_id) is distinct from '{"enabled":false,"shared":false,"notes":[]}'::jsonb then
    raise exception 'A student from another class can read notes';
  end if;
  perform set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000003', true);
  perform public.submit_attempt(activity_id, '{"fields":{"f0":"My previous private work"}}', 0);
  if public.my_discussion_notes(activity_id) is distinct from '{"enabled":true,"shared":false,"notes":[]}'::jsonb then
    raise exception 'Notes leaked before a shared answer was submitted';
  end if;
  perform public.submit_attempt(activity_id, '{"fields":{"f0":"My shared response"},"share_discussion":true}', 0);
  notes := public.my_discussion_notes(activity_id) -> 'notes';
  if jsonb_array_length(notes) <> 15 or notes::text like '%Private extra%' or notes::text like '%My shared response%'
     or exists (select 1 from jsonb_array_elements(notes) n where n ? 'student_id' or n ? 'className') then
    raise exception 'Class notes exceed the cap or contain private information';
  end if;
  hidden_id := (notes -> 0 ->> 'id')::uuid;
  perform set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000002', true);
  if public.review_discussion_notes(activity_id) <> '[]'::jsonb then raise exception 'Teacher from another class can see notes'; end if;
  perform set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
  perform public.review_discussion_notes(activity_id, hidden_id);
  perform set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000003', true);
  if (public.my_discussion_notes(activity_id) -> 'notes') @> jsonb_build_array(jsonb_build_object('id', hidden_id)) then
    raise exception 'Hidden note remained visible to a student';
  end if;
end $$;
rollback;
