-- 2005 program settings and per-class module rules. Owner: Ruthvik. Append-only after merge.
--
-- Every threshold the app shows numbers against now lives in the database:
--   * program_settings: one row of CIC-wide settings (when a student counts as inactive,
--     what counts as a low assignment score, and the default pass mark and post-test tries).
--   * class_module_settings: the pass mark and post-test tries that apply to every module of
--     every class, with module_rules overrides resolved against the program defaults.
-- The student-side functions from 1001/1002 (_course_state, submit_attempt) read the same
-- defaults instead of repeating 0.70 and 3, so grading and dashboards cannot drift apart.

-- ---------------------------------------------------------------------------
-- 1. Program settings: exactly one row
-- ---------------------------------------------------------------------------
create table program_settings (
  id boolean primary key default true check (id),
  -- A student with no submitted work for more than this many days needs a check-in.
  inactive_days int not null default 3 check (inactive_days between 1 and 365),
  -- A graded assignment under this percentage is flagged as a low score.
  low_score_pct int not null default 60 check (low_score_pct between 0 and 100),
  -- Used when a class has no module_rules row for a module.
  default_pass_mark numeric not null default 0.70 check (default_pass_mark between 0 and 1),
  default_max_posttest_tries int not null default 3 check (default_max_posttest_tries between 1 and 20),
  updated_at timestamptz not null default now()
);
insert into program_settings (id) values (true) on conflict (id) do nothing;

create trigger program_settings_touch before update on program_settings
  for each row execute function touch_updated_at();

alter table program_settings enable row level security;
-- No insert or delete policy: the single row is created here and never removed.
create policy "signed-in users read program settings" on program_settings for select to authenticated
  using (true);
create policy "admin updates program settings" on program_settings for update to authenticated
  using (current_role_is('admin')) with check (current_role_is('admin'));

-- Defaults as functions, so column defaults and the grading functions share one source.
create function program_default_pass_mark() returns numeric
language sql stable security definer set search_path = public as $$
  select default_pass_mark from program_settings where id
$$;
create function program_default_max_tries() returns int
language sql stable security definer set search_path = public as $$
  select default_max_posttest_tries from program_settings where id
$$;
revoke all on function program_default_pass_mark() from public, anon;
revoke all on function program_default_max_tries() from public, anon;
grant execute on function program_default_pass_mark() to authenticated;
grant execute on function program_default_max_tries() to authenticated;

-- A new module_rules row starts from the program defaults, not from numbers fixed in 1001.
alter table module_rules
  alter column pass_mark set default program_default_pass_mark(),
  alter column max_posttest_tries set default program_default_max_tries();

-- ---------------------------------------------------------------------------
-- 2. Resolved rules for every module of every class
-- ---------------------------------------------------------------------------
-- One row per (class, module of the class's course), assigned or not, so a module an
-- instructor assigns later already has its rules. security_invoker: the reader's own
-- policies on classes, modules and module_rules decide which rows come back.
create view class_module_settings with (security_invoker = true) as
select cl.id as class_id,
       m.id as module_id,
       coalesce(r.pass_mark, s.default_pass_mark) as pass_mark,
       coalesce(r.max_posttest_tries, s.default_max_posttest_tries) as max_posttest_tries
from classes cl
join modules m on m.course_id = cl.course_id
cross join program_settings s
left join module_rules r on r.class_id = cl.id and r.module_id = m.id;

revoke all on class_module_settings from public, anon;
grant select on class_module_settings to authenticated;

-- 1001 lets teachers, enrolled students and admins read module_rules. Anyone who manages the
-- class (2001 can_manage_class, which adds the class creator) must see its overrides too,
-- or the view above would silently show them the program default instead.
create policy "class managers read module rules" on module_rules for select
  using (can_manage_class(class_id));

-- ---------------------------------------------------------------------------
-- 3. Student-side functions read the program defaults
-- ---------------------------------------------------------------------------
-- Copied from 1002 (_course_state) and 1001 (submit_attempt); the only change in each is
-- the fallback used when a class has no module_rules row.
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

  for m in
    select mo.id, mo.position, mo.title, mo.concept
    from modules mo
    where mo.course_id = p_course and mo.published
      and (v_class is null or exists (
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
          or posttest_tries >= max_tries));
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

create or replace function submit_attempt(
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
    v_counts := v_attempt_no <= coalesce(v_max_tries, program_default_max_tries());
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

revoke all on function _course_state(uuid, uuid) from public, anon, authenticated;
revoke all on function submit_attempt(uuid, jsonb, int, numeric) from public, anon;
grant execute on function submit_attempt(uuid, jsonb, int, numeric) to authenticated;

notify pgrst, 'reload schema';
