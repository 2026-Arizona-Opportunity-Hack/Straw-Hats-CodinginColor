-- The framed Cat Photo lab only records successful, server-verified work.
create function curriculum_private.require_verified_cat_photo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('curriculum.cat_photo_verified', true) is distinct from 'yes'
     and exists (
       select 1 from public.activities a where a.id = new.activity_id and a.type = 'code'
         and a.content #>> '{lab,verifier}' = 'cat-photo-v1'
     ) then
    raise exception 'CAT_PHOTO_CHECK_REQUIRED';
  end if;
  return new;
end;
$$;
revoke all on function curriculum_private.require_verified_cat_photo() from public, anon, authenticated;

create trigger require_verified_cat_photo before insert on public.activity_attempts
for each row execute function curriculum_private.require_verified_cat_photo();

create function public.record_cat_photo_pass(p_student_id uuid, p_activity_id uuid, p_source text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target record;
  class_id_for_course uuid;
begin
  if p_source is null or octet_length(p_source) > 48000 then raise exception 'INVALID_LAB_SOURCE'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_student_id and p.role = 'student' and p.archived_at is null) then
    raise exception 'STUDENTS_ONLY';
  end if;
  select m.id as module_id, c.id as course_id, c.published as course_published into target
  from public.activities a join public.lessons l on l.id = a.lesson_id
  join public.modules m on m.id = l.module_id join public.courses c on c.id = m.course_id
  where a.id = p_activity_id and a.type = 'code' and m.published
    and a.content #>> '{lab,verifier}' = 'cat-photo-v1'
  for share of a;
  if not found then raise exception 'LAB_UNAVAILABLE'; end if;
  class_id_for_course := public._class_for(p_student_id, target.course_id);
  if (not target.course_published and class_id_for_course is null) or not exists (
    select 1 from public._course_state(p_student_id, target.course_id) s
    where s.module_id = target.module_id and s.state in ('available', 'completed')
  ) then raise exception 'LAB_UNAVAILABLE'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text || ':' || p_activity_id::text, 0));
  if exists (
    select 1 from public.activity_attempts t where t.student_id = p_student_id and t.activity_id = p_activity_id
      and t.class_id is not distinct from class_id_for_course and t.score = 1
  ) then return; end if;

  perform set_config('curriculum.cat_photo_verified', 'yes', true);
  insert into public.activity_attempts (student_id, activity_id, class_id, response, score, is_correct, submitted_at, attempt_no)
  select p_student_id, p_activity_id, class_id_for_course, jsonb_build_object('code', p_source),
    1, true, now(), coalesce(max(t.attempt_no), 0) + 1
  from public.activity_attempts t
  where t.student_id = p_student_id and t.activity_id = p_activity_id and t.class_id is not distinct from class_id_for_course;
  perform set_config('curriculum.cat_photo_verified', '', true);
end;
$$;
revoke all on function public.record_cat_photo_pass(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_cat_photo_pass(uuid, uuid, text) to service_role;
