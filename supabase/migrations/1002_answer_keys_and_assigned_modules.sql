-- 1002 answer keys move out of activity content automatically; classroom
-- students see only the modules assigned to their class.
-- Owner: Shivraj. Append-only after merge.

-- ---------------------------------------------------------------------------
-- 1. Answers never stay in activities.content
-- ---------------------------------------------------------------------------
-- Any writer (course builder, seed, importer) may put answers in content. A
-- BEFORE trigger copies them into activity_keys and strips them from content,
-- so students, who can read activities, never see them.
--
-- activity_keys.key shape (superset of 1001):
--   answer            check / exit: right choice id
--   answers           pretest / posttest: {"<item id>": "<choice id>"}
--   solution          code: python source (teachers only)
--   question_answers  course builder's questions[].answer, by position
-- To show answers in the builder, read activity_keys and put these back.
--
-- Only non-null answers are stored, and they are merged into the existing key.
-- A save without answers (reordering, or a builder that hasn't loaded the key)
-- never erases stored answers. Changing an answer works; clearing one to
-- "no answer" does not (set a different answer instead).

-- Lets the BEFORE INSERT trigger write the key before the activity row exists.
alter table activity_keys drop constraint activity_keys_activity_id_fkey,
  add constraint activity_keys_activity_id_fkey foreign key (activity_id)
    references activities (id) on delete cascade deferrable initially deferred;

create function move_answers_to_keys() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c jsonb := coalesce(new.content, '{}'::jsonb);
  has_items boolean := jsonb_typeof(c -> 'items') = 'array';
  has_questions boolean := jsonb_typeof(c -> 'questions') = 'array';
  k jsonb := '{}'::jsonb;
  carries_answers boolean;
begin
  carries_answers := c ? 'answer' or c ? 'solution'
    or (has_items and exists (select 1 from jsonb_array_elements(c -> 'items') i where i ? 'answer'))
    or (has_questions and exists (select 1 from jsonb_array_elements(c -> 'questions') q where q ? 'answer'));
  if not carries_answers then
    return new;
  end if;

  if c ? 'answer' and jsonb_typeof(c -> 'answer') <> 'null' then
    k := k || jsonb_build_object('answer', c -> 'answer');
  end if;
  if c ? 'solution' and jsonb_typeof(c -> 'solution') <> 'null' then
    k := k || jsonb_build_object('solution', c -> 'solution');
  end if;
  if has_items then
    k := k || coalesce((
      select jsonb_build_object('answers', jsonb_object_agg(i ->> 'id', i -> 'answer'))
      from jsonb_array_elements(c -> 'items') i
      where i ? 'id' and jsonb_typeof(i -> 'answer') <> 'null'
      having count(*) > 0
    ), '{}'::jsonb);
    c := jsonb_set(c, '{items}', (
      select coalesce(jsonb_agg(i - 'answer' order by n), '[]'::jsonb)
      from jsonb_array_elements(c -> 'items') with ordinality as t(i, n)));
  end if;
  if has_questions and exists (
    select 1 from jsonb_array_elements(c -> 'questions') q where jsonb_typeof(q -> 'answer') <> 'null'
  ) then
    k := k || jsonb_build_object('question_answers', (
      select jsonb_agg(coalesce(q -> 'answer', 'null'::jsonb) order by n)
      from jsonb_array_elements(c -> 'questions') with ordinality as t(q, n)));
  end if;
  if has_questions then
    c := jsonb_set(c, '{questions}', (
      select coalesce(jsonb_agg(q - 'answer' order by n), '[]'::jsonb)
      from jsonb_array_elements(c -> 'questions') with ordinality as t(q, n)));
  end if;

  new.content := c - 'answer' - 'solution';

  if k <> '{}'::jsonb then
    insert into activity_keys (activity_id, key, updated_at)
    values (new.id, k, now())
    on conflict (activity_id) do update set
      key = activity_keys.key || excluded.key || case
        when excluded.key ? 'answers'
          then jsonb_build_object('answers', coalesce(activity_keys.key -> 'answers', '{}'::jsonb) || (excluded.key -> 'answers'))
        else '{}'::jsonb end,
      updated_at = now();
  end if;
  return new;
end
$$;

create trigger activities_move_answers before insert or update of content on activities
  for each row execute function move_answers_to_keys();

-- Move answers already in the database.
update activities set content = content
where content ? 'answer' or content ? 'solution' or content ? 'items' or content ? 'questions';

-- ---------------------------------------------------------------------------
-- 2. Classroom students see only assigned modules (class_modules)
-- ---------------------------------------------------------------------------
-- Same as 1001 except the module list: for a class it is the published modules
-- assigned to that class (assigning = releasing). locked_reason is now only
-- previous_not_passed; unassigned modules are not returned at all.
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

revoke all on function _course_state(uuid, uuid) from public, anon, authenticated;
revoke all on function move_answers_to_keys() from public, anon, authenticated;
