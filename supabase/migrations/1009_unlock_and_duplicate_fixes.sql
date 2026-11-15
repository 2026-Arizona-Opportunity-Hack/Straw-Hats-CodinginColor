-- 1009 fixes found in testing: modules stayed locked, empty classes, duplicate courses,
-- and students couldn't see their own saved answers.
-- Owner: Shivraj. Append-only after merge.
--
-- 1. A final check that can't be scored (no questions or no answer key) counts as passed
--    once submitted, so it no longer blocks the next module in a class.
-- 2. A class with no assigned modules shows the whole course. Once a teacher assigns
--    modules, only those show (1002's rule).
-- 3. Teachers' copies of a course belong to the same "course family" as the original.
--    A student can't add one on their own if their class already uses that family, and
--    existing duplicates are removed.
-- 4. my_activity_response(): the student's latest saved answer for an activity.

-- ---------------------------------------------------------------------------
-- 1 + 2. Module states
-- ---------------------------------------------------------------------------
create or replace function _course_state(p_student uuid, p_course uuid)
returns table (
  module_id uuid,
  module_position int,
  module_title text,
  module_concept text,
  state text,              -- locked | available | completed
  locked_reason text,      -- null | previous_not_passed
  tested_out boolean,
  required_count int,
  done_count int,
  pretest_score numeric,   -- first try, 0..1
  posttest_best numeric,   -- best of the tries that count, 0..1
  posttest_tries int,
  pass_mark numeric,       -- null for self-chosen courses
  max_tries int            -- null for self-chosen courses
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_class uuid := _class_for(p_student, p_course);
  v_assigned_only boolean;
  v_prev_completed boolean := true;
  v_has_posttest boolean;
  v_manual boolean;
  v_available boolean;
  v_passed boolean;
  m record;
begin
  if not _is_enrolled(p_student, p_course) then
    return;
  end if;
  -- A class shows only its assigned modules, unless the teacher assigned none.
  v_assigned_only := v_class is not null and exists (
    select 1 from class_modules cm where cm.class_id = v_class and cm.released_at <= now());

  for m in
    select mo.id, mo.position, mo.title, mo.concept
    from modules mo
    where mo.course_id = p_course and mo.published
      and (not v_assigned_only or exists (
        select 1 from class_modules cm
        where cm.class_id = v_class and cm.module_id = mo.id and cm.released_at <= now()))
    order by mo.position
  loop
    module_id := m.id;
    module_position := m.position;
    module_title := m.title;
    module_concept := m.concept;

    select count(*)::int,
           count(*) filter (where exists (
             select 1 from activity_attempts t
             where t.activity_id = a.id and t.student_id = p_student
               and t.class_id is not distinct from v_class))::int
      into required_count, done_count
    from activities a join lessons l on l.id = a.lesson_id
    where l.module_id = m.id and a.counts_toward_unlock;

    if v_class is null then
      pass_mark := null;
      max_tries := null;
    else
      select r.pass_mark, r.max_posttest_tries into pass_mark, max_tries
      from module_rules r where r.class_id = v_class and r.module_id = m.id;
      pass_mark := coalesce(pass_mark, 0.70);
      max_tries := coalesce(max_tries, 3);
    end if;

    select avg(first_try.score) into pretest_score
    from activities a
    join lessons l on l.id = a.lesson_id
    cross join lateral (
      select t.score from activity_attempts t
      where t.activity_id = a.id and t.student_id = p_student
        and t.class_id is not distinct from v_class
      order by t.attempt_no limit 1
    ) first_try
    where l.module_id = m.id and a.type = 'pretest';

    select exists (
      select 1 from activities a join lessons l on l.id = a.lesson_id
      where l.module_id = m.id and a.type = 'posttest'
    ) into v_has_posttest;

    select count(*)::int, max(t.score) filter (where max_tries is null or t.attempt_no <= max_tries)
      into posttest_tries, posttest_best
    from activity_attempts t
    join activities a on a.id = t.activity_id
    join lessons l on l.id = a.lesson_id
    where l.module_id = m.id and a.type = 'posttest'
      and t.student_id = p_student and t.class_id is not distinct from v_class;

    tested_out := v_class is not null and pretest_score is not null and pretest_score >= pass_mark;
    if v_class is null then
      v_passed := done_count = required_count;
    else
      v_passed := tested_out or (
        done_count = required_count and (
          not v_has_posttest
          or coalesce(posttest_best, 0) >= pass_mark
          or posttest_tries >= max_tries
          -- Submitted but unscorable (no questions or no key): nothing to pass, so it counts.
          or (posttest_tries > 0 and posttest_best is null)));
    end if;

    v_manual := v_class is not null and exists (
      select 1 from module_unlocks u
      where u.class_id = v_class and u.student_id = p_student and u.module_id = m.id);
    v_available := v_manual or v_prev_completed;

    state := case
      when not v_available then 'locked'
      when v_passed then 'completed'
      else 'available' end;
    locked_reason := case when v_available then null else 'previous_not_passed' end;

    v_prev_completed := state = 'completed';
    return next;
  end loop;
end
$$;

revoke all on function _course_state(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Course families: an original and every teacher's copy of it
-- ---------------------------------------------------------------------------
create function course_family(p_course uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(copied_from, id) from courses where id = p_course
$$;

-- True when one of the student's classes already uses this course or a copy of it.
create function _class_has_family(p_student uuid, p_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from enrollments e join classes k on k.id = e.class_id
    where e.student_id = p_student and course_family(k.course_id) = course_family(p_course))
$$;

revoke all on function _class_has_family(uuid, uuid) from public, anon, authenticated;

create or replace function enroll_in_course(p_course_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not current_role_is('student') then
    raise exception 'STUDENTS_ONLY';
  end if;
  if not exists (
    select 1 from courses
    where id = p_course_id and published and delivery_mode = 'self_paced'
  ) then
    raise exception 'COURSE_NOT_AVAILABLE';
  end if;
  if _class_has_family(auth.uid(), p_course_id) then
    raise exception 'ALREADY_IN_CLASS';
  end if;
  insert into course_enrollments (student_id, course_id)
  values (auth.uid(), p_course_id)
  on conflict do nothing;
end
$$;

-- Joining a class also drops any self-added copy of the same course family.
create or replace function _join_class(p_student uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_class classes%rowtype;
begin
  select * into v_class from classes where upper(join_code) = upper(trim(coalesce(p_code, '')));
  if not found then
    raise exception 'BAD_CLASS_CODE';
  end if;
  if exists (select 1 from enrollments where class_id = v_class.id and student_id = p_student) then
    raise exception 'ALREADY_IN_CLASS';
  end if;
  if _class_for(p_student, v_class.course_id) is not null then
    raise exception 'COURSE_ALREADY_IN_ANOTHER_CLASS';
  end if;

  insert into enrollments (class_id, student_id) values (v_class.id, p_student);

  update activity_attempts t set class_id = v_class.id
  from activities a
  join lessons l on l.id = a.lesson_id
  join modules m on m.id = l.module_id
  where t.activity_id = a.id and t.student_id = p_student and t.class_id is null
    and m.course_id = v_class.course_id;
  delete from course_enrollments ce
  where ce.student_id = p_student and course_family(ce.course_id) = course_family(v_class.course_id);

  return jsonb_build_object('class_id', v_class.id, 'class_name', v_class.name, 'course_id', v_class.course_id);
end
$$;

revoke all on function _join_class(uuid, text) from public, anon, authenticated;

-- Remove existing duplicates: self-added courses in the same family as a class course.
delete from course_enrollments ce
where _class_has_family(ce.student_id, ce.course_id);

-- ---------------------------------------------------------------------------
-- 4. The student's own latest answer, to show it again after "answer once"
-- ---------------------------------------------------------------------------
create function my_activity_response(p_activity_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select t.response
  from activity_attempts t
  join activities a on a.id = t.activity_id
  join lessons l on l.id = a.lesson_id
  join modules m on m.id = l.module_id
  where t.activity_id = p_activity_id and t.student_id = auth.uid()
    and t.class_id is not distinct from _class_for(auth.uid(), m.course_id)
  order by t.attempt_no desc
  limit 1
$$;

revoke all on function my_activity_response(uuid) from public, anon;
grant execute on function my_activity_response(uuid) to authenticated;
