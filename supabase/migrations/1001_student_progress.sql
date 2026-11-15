-- 1001 student progress: hidden answer keys, server-side grading, unlock rules.
-- Owner: Shivraj. Append-only after merge.
--
-- Rules implemented here:
--   * Answer keys live in activity_keys. Students can never read them.
--   * Students submit work ONLY through submit_attempt(), which grades it.
--   * Self-chosen course (course_enrollments): next module opens when the
--     previous one is completed.
--   * Classroom course (enrollments): next module opens when it is released
--     (instructor-led only), the previous module is completed, and either the
--     post-test pass mark is met or the post-test tries are used up.
--     Scoring >= pass mark on the first pretest try tests out of a module.
--     An instructor can open any module for a student (module_unlocks).
--   * Pretest counts try #1. Post-test counts the best of the first N tries.
--     Later tries are saved as practice.

-- ---------------------------------------------------------------------------
-- 1. Answer keys (staff-only)
-- ---------------------------------------------------------------------------
-- key shape per activity type:
--   check, exit         {"answer": "<choice id>"}
--   pretest, posttest   {"answers": {"<item id>": "<choice id>"}}
--   code                {"solution": "<python source>"}
create table activity_keys (
  activity_id uuid primary key references activities (id) on delete cascade,
  key jsonb not null default '{}'::jsonb check (pg_column_size(key) <= 65536),
  updated_at timestamptz not null default now()
);

-- True when the current user owns the course this activity belongs to, or is an admin.
create function can_edit_activity(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select current_role_is('admin') or exists (
    select 1
    from activities ac
    join lessons l on l.id = ac.lesson_id
    join modules m on m.id = l.module_id
    join courses c on c.id = m.course_id
    where ac.id = a and c.owner_id = auth.uid()
  )
$$;

alter table activity_keys enable row level security;
create policy "staff and reviewers read keys" on activity_keys for select
  using (current_role_is('instructor') or current_role_is('admin') or current_role_is('reviewer'));
create policy "course owner writes keys" on activity_keys for all
  using (can_edit_activity(activity_id)) with check (can_edit_activity(activity_id));

-- ---------------------------------------------------------------------------
-- 2. Self-chosen courses
-- ---------------------------------------------------------------------------
alter table activity_attempts alter column class_id drop not null; -- null = self-chosen course

create table course_enrollments (
  student_id uuid not null references profiles (id) on delete cascade,
  course_id uuid not null references courses (id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  primary key (student_id, course_id)
);
alter table course_enrollments enable row level security;
create policy "read own course enrollments" on course_enrollments for select
  using (student_id = auth.uid() or current_role_is('admin'));
-- Inserts go through enroll_in_course(), which checks the rules.

-- 0001 gave enrollments no select policy, so students could not see their own class.
create policy "read enrollments" on enrollments for select
  using (student_id = auth.uid() or teaches_class(class_id) or current_role_is('admin'));

create function in_class(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from enrollments where class_id = c and student_id = auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- 3. Classroom rules and manual unlocks (instructor writes, student reads)
-- ---------------------------------------------------------------------------
-- No row = defaults: pass mark 70%, 3 post-test tries.
create table module_rules (
  class_id uuid not null references classes (id) on delete cascade,
  module_id uuid not null references modules (id) on delete cascade,
  pass_mark numeric not null default 0.70 check (pass_mark between 0 and 1),
  max_posttest_tries int not null default 3 check (max_posttest_tries between 1 and 20),
  primary key (class_id, module_id)
);
alter table module_rules enable row level security;
create policy "read module rules" on module_rules for select
  using (in_class(class_id) or teaches_class(class_id) or current_role_is('admin'));
create policy "teacher writes module rules" on module_rules for all
  using (teaches_class(class_id) or current_role_is('admin'))
  with check (teaches_class(class_id) or current_role_is('admin'));

create table module_unlocks (
  class_id uuid not null references classes (id) on delete cascade,
  student_id uuid not null references profiles (id) on delete cascade,
  module_id uuid not null references modules (id) on delete cascade,
  unlocked_by uuid not null default auth.uid() references profiles (id),
  unlocked_at timestamptz not null default now(),
  primary key (class_id, student_id, module_id)
);
alter table module_unlocks enable row level security;
create policy "read module unlocks" on module_unlocks for select
  using (student_id = auth.uid() or teaches_class(class_id) or current_role_is('admin'));
create policy "teacher writes module unlocks" on module_unlocks for all
  using (teaches_class(class_id) or current_role_is('admin'))
  with check (teaches_class(class_id) or current_role_is('admin'));

-- ---------------------------------------------------------------------------
-- 4. Attempts: no direct writes from students any more
-- ---------------------------------------------------------------------------
drop policy "student writes own attempts" on activity_attempts;
create index on activity_attempts (student_id, activity_id);

-- ---------------------------------------------------------------------------
-- 5. Internal helpers (not callable from the app)
-- ---------------------------------------------------------------------------
-- The class through which a student takes a course, or null for self-chosen.
create function _class_for(p_student uuid, p_course uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select e.class_id
  from enrollments e join classes c on c.id = e.class_id
  where e.student_id = p_student and c.course_id = p_course
  order by e.joined_at
  limit 1
$$;

create function _is_enrolled(p_student uuid, p_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select _class_for(p_student, p_course) is not null
      or exists (select 1 from course_enrollments where student_id = p_student and course_id = p_course)
$$;

-- One row per published module, in order, with the student's state in it.
create function _course_state(p_student uuid, p_course uuid)
returns table (
  module_id uuid,
  module_position int,
  module_title text,
  module_concept text,
  state text,              -- locked | available | completed
  locked_reason text,      -- null | not_released | previous_not_passed
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
  v_mode delivery_mode;
  v_prev_completed boolean := true;
  v_has_posttest boolean;
  v_released boolean;
  v_manual boolean;
  v_available boolean;
  v_passed boolean;
  m record;
begin
  if not _is_enrolled(p_student, p_course) then
    return;
  end if;
  select c.delivery_mode into v_mode from courses c where c.id = p_course;

  for m in
    select mo.id, mo.position, mo.title, mo.concept
    from modules mo
    where mo.course_id = p_course and mo.published
    order by mo.position
  loop
    module_id := m.id;
    module_position := m.position;
    module_title := m.title;
    module_concept := m.concept;

    -- Required activities and how many have a submitted attempt.
    select count(*)::int,
           count(*) filter (where exists (
             select 1 from activity_attempts t
             where t.activity_id = a.id and t.student_id = p_student
               and t.class_id is not distinct from v_class))::int
      into required_count, done_count
    from activities a join lessons l on l.id = a.lesson_id
    where l.module_id = m.id and a.counts_toward_unlock;

    -- Classroom rules (defaults when the instructor set none).
    if v_class is null then
      pass_mark := null;
      max_tries := null;
    else
      select r.pass_mark, r.max_posttest_tries into pass_mark, max_tries
      from module_rules r where r.class_id = v_class and r.module_id = m.id;
      pass_mark := coalesce(pass_mark, 0.70);
      max_tries := coalesce(max_tries, 3);
    end if;

    -- Pretest: first try only.
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

    -- Post-test: tries used, and best score among the tries that count.
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

    -- Is this module passed?
    tested_out := v_class is not null and pretest_score is not null and pretest_score >= pass_mark;
    if v_class is null then
      v_passed := done_count = required_count;
    else
      v_passed := tested_out or (
        done_count = required_count and (
          not v_has_posttest
          or coalesce(posttest_best, 0) >= pass_mark
          or posttest_tries >= max_tries));
    end if;

    -- Is this module open?
    v_released := v_class is null or v_mode = 'self_paced' or exists (
      select 1 from class_modules cm
      where cm.class_id = v_class and cm.module_id = m.id and cm.released_at <= now());
    v_manual := v_class is not null and exists (
      select 1 from module_unlocks u
      where u.class_id = v_class and u.student_id = p_student and u.module_id = m.id);
    v_available := v_manual or (v_released and v_prev_completed);

    state := case
      when not v_available then 'locked'
      when v_passed then 'completed'
      else 'available' end;
    locked_reason := case
      when v_available then null
      when not v_prev_completed then 'previous_not_passed'
      else 'not_released' end;

    v_prev_completed := state = 'completed';
    return next;
  end loop;
end
$$;

revoke all on function _class_for(uuid, uuid) from public, anon, authenticated;
revoke all on function _is_enrolled(uuid, uuid) from public, anon, authenticated;
revoke all on function _course_state(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Student API (called from src/api/student via supabase.rpc)
-- ---------------------------------------------------------------------------

-- Courses the student is in: through a class, or self-chosen.
create function my_courses()
returns table (
  course_id uuid, title text, description text, level course_level,
  delivery_mode delivery_mode, source text, class_id uuid, class_name text
)
language sql stable security definer set search_path = public as $$
  select c.id, c.title, c.description, c.level, c.delivery_mode, 'class', cl.id, cl.name
  from enrollments e
  join classes cl on cl.id = e.class_id
  join courses c on c.id = cl.course_id
  where e.student_id = auth.uid()
  union all
  select c.id, c.title, c.description, c.level, c.delivery_mode, 'self', null, null
  from course_enrollments ce
  join courses c on c.id = ce.course_id
  where ce.student_id = auth.uid() and c.published
$$;

-- Pick a course on your own. Self-paced, published, and not already in your class.
create function enroll_in_course(p_course_id uuid) returns void
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
  if _class_for(auth.uid(), p_course_id) is not null then
    raise exception 'ALREADY_IN_CLASS';
  end if;
  insert into course_enrollments (student_id, course_id)
  values (auth.uid(), p_course_id)
  on conflict do nothing;
end
$$;

-- Module map for one course: state of every module for the signed-in student.
create function my_course_progress(p_course_id uuid)
returns table (
  module_id uuid, module_position int, module_title text, module_concept text,
  state text, locked_reason text, tested_out boolean,
  required_count int, done_count int,
  pretest_score numeric, posttest_best numeric, posttest_tries int,
  pass_mark numeric, max_tries int
)
language sql stable security definer set search_path = public as $$
  select * from _course_state(auth.uid(), p_course_id)
$$;

-- Per-activity status inside one module (checkmarks, best score, tries).
create function my_module_activities(p_module_id uuid)
returns table (activity_id uuid, submitted boolean, best_score numeric, tries int, last_submitted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id,
         count(t.id) > 0,
         max(t.score),
         count(t.id)::int,
         max(t.submitted_at)
  from activities a
  join lessons l on l.id = a.lesson_id
  join modules m on m.id = l.module_id
  left join activity_attempts t
    on t.activity_id = a.id and t.student_id = auth.uid()
   and t.class_id is not distinct from _class_for(auth.uid(), m.course_id)
  where l.module_id = p_module_id
  group by a.id, l.position, a.position
  order by l.position, a.position
$$;

-- Where to continue: first open module that is not completed, first required
-- activity in it with no attempt. If all are done but the pass mark is not met,
-- point at the post-test. Null when the course is finished or nothing is open.
create function my_next_activity(p_course_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_class uuid := _class_for(auth.uid(), p_course_id);
  v_module uuid;
  v_activity uuid;
begin
  select s.module_id into v_module
  from _course_state(auth.uid(), p_course_id) s
  where s.state = 'available'
  order by s.module_position
  limit 1;
  if v_module is null then
    return null;
  end if;

  select a.id into v_activity
  from activities a join lessons l on l.id = a.lesson_id
  where l.module_id = v_module and a.counts_toward_unlock
    and not exists (
      select 1 from activity_attempts t
      where t.activity_id = a.id and t.student_id = auth.uid()
        and t.class_id is not distinct from v_class)
  order by l.position, a.position
  limit 1;

  if v_activity is null then
    select a.id into v_activity
    from activities a join lessons l on l.id = a.lesson_id
    where l.module_id = v_module and a.type = 'posttest'
    order by l.position, a.position
    limit 1;
  end if;

  return jsonb_build_object('module_id', v_module, 'activity_id', v_activity);
end
$$;

-- Submit work for one activity. Grades it, saves it, returns the result.
--   p_response shapes:
--     check, exit         {"choice_id": "b"}
--     pretest, posttest   {"answers": {"<item id>": "<choice id>"}}
--     worksheet           {"fields": {"<field id>": "<text or choice id>"}}
--     code                {"code": "...", "passed": 3, "total": 4}   + p_client_score
--     interactive_html    {}                                         + p_client_score
--     content, video      {}
create function submit_attempt(
  p_activity_id uuid,
  p_response jsonb,
  p_time_on_task_ms int,
  p_client_score numeric default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := auth.uid();
  v_activity activities%rowtype;
  v_module uuid;
  v_course uuid;
  v_class uuid;
  v_key jsonb;
  v_response jsonb := coalesce(p_response, '{}'::jsonb);
  v_score numeric;
  v_correct boolean;
  v_total int;
  v_right int;
  v_concepts jsonb;
  v_attempt_no int;
  v_max_tries int;
  v_counts boolean;
  v_time int := least(greatest(coalesce(p_time_on_task_ms, 0), 0), 4 * 3600 * 1000);
  v_id uuid;
begin
  if not current_role_is('student') then
    raise exception 'STUDENTS_ONLY';
  end if;
  if jsonb_typeof(v_response) <> 'object' or pg_column_size(v_response) > 65536 then
    raise exception 'BAD_RESPONSE';
  end if;

  select * into v_activity from activities where id = p_activity_id;
  if not found then
    raise exception 'ACTIVITY_NOT_FOUND';
  end if;
  select l.module_id, m.course_id into v_module, v_course
  from lessons l join modules m on m.id = l.module_id
  where l.id = v_activity.lesson_id;

  if not _is_enrolled(v_student, v_course) then
    raise exception 'NOT_ENROLLED';
  end if;
  v_class := _class_for(v_student, v_course);

  if not exists (
    select 1 from _course_state(v_student, v_course) s
    where s.module_id = v_module and s.state <> 'locked'
  ) then
    raise exception 'MODULE_LOCKED';
  end if;

  select k.key into v_key from activity_keys k where k.activity_id = p_activity_id;
  v_key := coalesce(v_key, '{}'::jsonb);

  -- Grade.
  case v_activity.type
    when 'check', 'exit' then
      if v_key ? 'answer' then
        v_correct := (v_response ->> 'choice_id') = (v_key ->> 'answer');
        v_score := case when v_correct then 1 else 0 end;
      end if;

    when 'pretest', 'posttest' then
      select count(*)::int,
             count(*) filter (where v_response -> 'answers' ->> (i ->> 'id') = v_key -> 'answers' ->> (i ->> 'id'))::int
        into v_total, v_right
      from jsonb_array_elements(coalesce(v_activity.content -> 'items', '[]'::jsonb)) i
      where (v_key -> 'answers') ? (i ->> 'id');

      if v_total > 0 then
        v_score := round(v_right::numeric / v_total, 3);
        v_correct := v_right = v_total;
        select jsonb_object_agg(concept, score) into v_concepts
        from (
          select coalesce(nullif(i ->> 'concept', ''), v_activity.concept) as concept,
                 round(avg(case when v_response -> 'answers' ->> (i ->> 'id')
                                   = v_key -> 'answers' ->> (i ->> 'id') then 1 else 0 end), 3) as score
          from jsonb_array_elements(v_activity.content -> 'items') i
          where (v_key -> 'answers') ? (i ->> 'id')
          group by 1
        ) per_concept;
        v_response := v_response || jsonb_build_object('concept_scores', v_concepts);
      end if;

    when 'code', 'interactive_html' then
      if p_client_score is not null then
        v_score := round(least(greatest(p_client_score, 0), 1), 3);
        v_correct := v_score = 1;
      end if;

    else
      null; -- content, video, worksheet: completion only, no score
  end case;

  -- Save.
  select coalesce(max(t.attempt_no), 0) + 1 into v_attempt_no
  from activity_attempts t
  where t.activity_id = p_activity_id and t.student_id = v_student
    and t.class_id is not distinct from v_class;

  insert into activity_attempts
    (student_id, activity_id, class_id, response, score, is_correct, started_at, submitted_at, time_on_task_ms, attempt_no)
  values
    (v_student, p_activity_id, v_class, v_response, v_score, v_correct,
     now() - make_interval(secs => v_time / 1000.0), now(), v_time, v_attempt_no)
  returning id into v_id;

  -- Does this try count (or is it practice)?
  if v_activity.type = 'pretest' then
    v_counts := v_attempt_no = 1;
  elsif v_activity.type = 'posttest' and v_class is not null then
    select r.max_posttest_tries into v_max_tries
    from module_rules r where r.class_id = v_class and r.module_id = v_module;
    v_counts := v_attempt_no <= coalesce(v_max_tries, 3);
  else
    v_counts := true;
  end if;

  return jsonb_build_object(
    'attempt_id', v_id,
    'attempt_no', v_attempt_no,
    'score', v_score,
    'is_correct', v_correct,
    'counts', v_counts
  );
end
$$;

revoke all on function my_courses() from public, anon;
revoke all on function enroll_in_course(uuid) from public, anon;
revoke all on function my_course_progress(uuid) from public, anon;
revoke all on function my_module_activities(uuid) from public, anon;
revoke all on function my_next_activity(uuid) from public, anon;
revoke all on function submit_attempt(uuid, jsonb, int, numeric) from public, anon;
grant execute on function my_courses() to authenticated;
grant execute on function enroll_in_course(uuid) to authenticated;
grant execute on function my_course_progress(uuid) to authenticated;
grant execute on function my_module_activities(uuid) to authenticated;
grant execute on function my_next_activity(uuid) to authenticated;
grant execute on function submit_attempt(uuid, jsonb, int, numeric) to authenticated;
