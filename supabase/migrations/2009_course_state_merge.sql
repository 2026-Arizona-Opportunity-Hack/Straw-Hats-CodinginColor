-- Owner: Shivraj (in Ruthvik's range on purpose, so it runs after 2006).
--
-- 1009 (student unlock fixes) and 2006 (program default pass mark) each replaced
-- _course_state, so whichever ran last won. Live ran 1009 last; a fresh database runs 2006
-- last. This copy has both and runs after both:
--   1009: a class with no released modules shows the whole course, and a final check
--         with no questions or key counts as passed.
--   2006: a class without module_rules falls back to program_default_pass_mark() and
--         program_default_max_tries().
-- Change _course_state only in a newer migration that starts from this copy.

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
      pass_mark := coalesce(pass_mark, program_default_pass_mark());
      max_tries := coalesce(max_tries, program_default_max_tries());
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

notify pgrst, 'reload schema';
