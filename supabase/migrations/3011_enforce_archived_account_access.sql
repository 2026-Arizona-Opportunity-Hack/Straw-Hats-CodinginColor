-- Archived profiles retain their records for reporting. Check the current row on
-- every authorization decision so a token issued before an archive grants no access.
create function curriculum_private.active_profile() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and archived_at is null
  )
$$;
revoke all on function curriculum_private.active_profile() from public, anon, authenticated;
grant execute on function curriculum_private.active_profile() to authenticated;

-- Restrictive policies also cover the existing ownership and self-read policies.
-- Separate permissive policies continue to determine what each active role may do.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'courses', 'modules', 'lessons', 'activities', 'classes',
    'class_instructors', 'enrollments', 'class_modules', 'activity_attempts',
    'api_keys', 'activity_keys', 'course_enrollments', 'module_rules',
    'module_unlocks', 'placement_items', 'placement_results', 'class_students',
    'assignments', 'assignment_submissions', 'program_settings',
    'instructor_issues', 'job_applications'
  ] loop
    execute format(
      'create policy "active CIC account" on public.%I as restrictive for all to authenticated
        using ((select curriculum_private.active_profile()))
        with check ((select curriculum_private.active_profile()))',
      table_name
    );
  end loop;

  -- These tables are added by the curriculum isolation change when it is present.
  foreach table_name in array array['local_curricula', 'curriculum_block_comments'] loop
    if to_regclass('public.' || table_name) is not null then
      execute format(
        'create policy "active CIC account" on public.%I as restrictive for all to authenticated
          using ((select curriculum_private.active_profile()))
          with check ((select curriculum_private.active_profile()))',
        table_name
      );
    end if;
  end loop;
end;
$$;

create policy "active CIC account for submission files" on storage.objects
  as restrictive for all to authenticated
  using (bucket_id <> 'submission-files' or (select curriculum_private.active_profile()))
  with check (bucket_id <> 'submission-files' or (select curriculum_private.active_profile()));

-- These helpers also run inside RPCs that intentionally bypass table policies.
create or replace function public.current_role_is(r public.user_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = r and archived_at is null
  )
$$;

create or replace function public.teaches_class(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.class_instructors ci
    join public.profiles p on p.id = ci.instructor_id
    where ci.class_id = c and p.id = (select auth.uid())
      and p.role in ('instructor', 'admin') and p.archived_at is null
  )
$$;

create or replace function public.can_manage_class(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.archived_at is null
      and p.role in ('instructor', 'admin')
      and (p.role = 'admin' or public.teaches_class(c) or exists (
        select 1 from public.classes where id = c and created_by = p.id
      ))
  )
$$;

-- Preserve the catalog's independent visibility rules while adding the account
-- gate. The unguarded implementation is no longer callable by clients.
alter function public.catalog_modules() set schema curriculum_private;
revoke all on function curriculum_private.catalog_modules() from public, anon, authenticated;

create function public.catalog_modules()
returns table (course_id uuid, module_position int, module_title text, module_concept text)
language sql stable security definer set search_path = '' as $$
  select * from curriculum_private.catalog_modules()
  where (select curriculum_private.active_profile())
  order by course_id, module_position
$$;
revoke all on function public.catalog_modules() from public, anon;
grant execute on function public.catalog_modules() to authenticated;

-- The course catalog has the same security-definer boundary as its module list.
alter function public.catalog_courses() set schema curriculum_private;
revoke all on function curriculum_private.catalog_courses() from public, anon, authenticated;

create function public.catalog_courses()
returns table (id uuid, title text, description text, level public.course_level, delivery_mode public.delivery_mode)
language sql stable security definer set search_path = '' as $$
  select * from curriculum_private.catalog_courses()
  where (select curriculum_private.active_profile())
  order by title, id
$$;
revoke all on function public.catalog_courses() from public, anon;
grant execute on function public.catalog_courses() to authenticated;

-- Reuse the active-role check in the user-facing RPCs that read or write as
-- their owner. Other student writes already call current_role_is.
alter function public.my_courses() set schema curriculum_private;
revoke all on function curriculum_private.my_courses() from public, anon, authenticated;

create function public.my_courses()
returns table (
  course_id uuid, title text, description text, level public.course_level,
  delivery_mode public.delivery_mode, source text, class_id uuid, class_name text
)
language sql stable security definer set search_path = '' as $$
  select * from curriculum_private.my_courses()
  where (select public.current_role_is('student'))
$$;
revoke all on function public.my_courses() from public, anon;
grant execute on function public.my_courses() to authenticated;

create or replace function public.my_course_progress(p_course_id uuid)
returns table (
  module_id uuid, module_position int, module_title text, module_concept text,
  state text, locked_reason text, tested_out boolean,
  required_count int, done_count int,
  pretest_score numeric, posttest_best numeric, posttest_tries int,
  pass_mark numeric, max_tries int
)
language sql stable security definer set search_path = public as $$
  select * from _course_state(auth.uid(), p_course_id)
  where (select current_role_is('student'))
$$;

alter function public.my_module_activities(uuid) set schema curriculum_private;
revoke all on function curriculum_private.my_module_activities(uuid) from public, anon, authenticated;

create function public.my_module_activities(p_module_id uuid)
returns table (activity_id uuid, submitted boolean, best_score numeric, tries int, last_submitted_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select * from curriculum_private.my_module_activities(p_module_id)
  where (select public.current_role_is('student'))
$$;
revoke all on function public.my_module_activities(uuid) from public, anon;
grant execute on function public.my_module_activities(uuid) to authenticated;

alter function public.my_next_activity(uuid) set schema curriculum_private;
revoke all on function curriculum_private.my_next_activity(uuid) from public, anon, authenticated;

create function public.my_next_activity(p_course_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.current_role_is('student')
    then curriculum_private.my_next_activity(p_course_id) end
$$;
revoke all on function public.my_next_activity(uuid) from public, anon;
grant execute on function public.my_next_activity(uuid) to authenticated;

create or replace function public.my_placement() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('skipped', r.skipped, 'result', r.result, 'taken_at', r.created_at)
  from placement_results r
  where r.student_id = auth.uid() and (select current_role_is('student'))
  order by r.created_at desc
  limit 1
$$;

create or replace function public.my_activity_response(p_activity_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select t.response
  from activity_attempts t
  join activities a on a.id = t.activity_id
  join lessons l on l.id = a.lesson_id
  join modules m on m.id = l.module_id
  where t.activity_id = p_activity_id and t.student_id = auth.uid()
    and (select current_role_is('student'))
    and t.class_id is not distinct from _class_for(auth.uid(), m.course_id)
  order by t.attempt_no desc
  limit 1
$$;

create or replace function public.my_check_answer(p_activity_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select k.key ->> 'answer'
  from activity_keys k
  join activities a on a.id = k.activity_id
  where k.activity_id = p_activity_id and (select current_role_is('student'))
    and a.type in ('check', 'exit')
    and exists (
      select 1 from activity_attempts t
      where t.activity_id = p_activity_id and t.student_id = auth.uid())
$$;

create or replace function public.reserve_curriculum_image(p_draft_id uuid, p_expires_at timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  remaining integer;
begin
  if not (public.current_role_is('instructor') or public.current_role_is('admin')) then
    raise exception 'Instructor or admin required' using errcode = '42501';
  end if;
  if p_draft_id is null or p_expires_at is null or p_expires_at <= now()
    or p_expires_at > now() + interval '8 hours 5 minutes' then
    raise exception 'A current draft is required' using errcode = '22023';
  end if;

  delete from public.curriculum_image_quota where owner_id = caller and expires_at <= now();
  insert into public.curriculum_image_quota as quota (owner_id, draft_id, expires_at, attempts)
  values (caller, p_draft_id, p_expires_at, 1)
  on conflict (owner_id, draft_id) do update set attempts = quota.attempts + 1,
    expires_at = greatest(quota.expires_at, excluded.expires_at)
  where quota.attempts < 5
  returning 5 - quota.attempts into remaining;
  return remaining;
end;
$$;

create or replace function public.generate_module_assessment(p_module_id uuid, p_ai jsonb default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_course uuid;
  v_forms jsonb;
  v_source text := 'ai';
begin
  if not curriculum_private.active_profile() then
    raise exception 'NOT_ALLOWED';
  end if;
  select course_id into v_course from modules where id = p_module_id;
  if v_course is null then
    raise exception 'MODULE_NOT_FOUND';
  end if;
  if not can_edit_course(v_course) then
    raise exception 'NOT_ALLOWED';
  end if;
  v_forms := case when p_ai is null then null else _ai_assessment(p_ai) end;
  if v_forms is null then
    v_forms := _fallback_assessment(p_module_id);
    v_source := 'checks';
  end if;
  if v_forms is null then
    return jsonb_build_object('source', null, 'written', false);
  end if;
  return jsonb_build_object('source', v_source,
    'written', _write_assessment(p_module_id, v_forms -> 'pretest', v_forms -> 'posttest', v_source),
    'pretest', jsonb_array_length(v_forms -> 'pretest'), 'posttest', jsonb_array_length(v_forms -> 'posttest'));
end
$$;

-- Both defaults read the same policy-protected settings as the app. Their
-- internal callers keep their original privileges.
alter function public.program_default_pass_mark() security invoker;
alter function public.program_default_max_tries() security invoker;

-- Used only inside the enrollment RPCs.
revoke all on function public.course_family(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
