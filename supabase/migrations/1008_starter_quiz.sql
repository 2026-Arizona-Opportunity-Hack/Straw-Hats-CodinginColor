-- 1008 starter quiz: recommends a first course from a student's interests, goals,
-- knowledge, and how they answer (time per question, answer changes).
-- Owner: Shivraj. Append-only after merge. Plain-language design: Handoffs/shivraj-handoff.md.
--
-- Flow: the app reads placement_items (no answers in it), records each answer with
-- its timing and every selection change, and sends them to submit_placement(). The
-- database scores them with the keys in placement_keys (no student can read it),
-- saves the result in placement_results and returns the recommendation.

-- ---------------------------------------------------------------------------
-- 1. Question bank
-- ---------------------------------------------------------------------------
-- kind: rating (rate each subject 1-4), single (pick one), multi (pick any),
--       knowledge (graded, has a key, a subject, a difficulty 1-3, an expected time).
create table placement_items (
  id text primary key,
  position int not null unique,
  kind text not null check (kind in ('rating', 'single', 'multi', 'knowledge')),
  prompt text not null,
  code text,
  choices jsonb not null default '[]'::jsonb,
  subject text check (subject in ('python', 'web', 'ai')),
  difficulty int check (difficulty between 1 and 3),
  expected_ms int check (expected_ms > 0),
  active boolean not null default true
);
alter table placement_items enable row level security;
create policy "signed-in users read quiz questions" on placement_items for select to authenticated using (active);

create table placement_keys (
  item_id text primary key references placement_items (id) on delete cascade,
  answer text not null
);
alter table placement_keys enable row level security; -- no policies: only definer functions read it

create table placement_results (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles (id) on delete cascade,
  skipped boolean not null default false,
  answers jsonb not null default '{}'::jsonb check (pg_column_size(answers) <= 65536),
  result jsonb,
  recommended_course_id uuid references courses (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on placement_results (student_id, created_at desc);
alter table placement_results enable row level security;
create policy "read own quiz results" on placement_results for select
  using (student_id = auth.uid() or current_role_is('admin'));

insert into placement_items (id, position, kind, prompt, code, choices, subject, difficulty, expected_ms) values
  ('interest', 1, 'rating', 'How interested are you in each of these?', null,
   '[{"id":"ai","label":"AI and chatbots"},{"id":"python","label":"Python programming"},{"id":"web","label":"Building websites"}]', null, null, null),
  ('build', 2, 'single', 'What would you most like to build first?', null,
   '[{"id":"ai","label":"A chatbot or an AI helper"},{"id":"python","label":"A game, or a program that does boring work for me"},{"id":"web","label":"A website or an online portfolio"},{"id":"unsure","label":"Not sure yet"}]', null, null, null),
  ('tried', 3, 'multi', 'Which of these have you tried before? Pick all that apply.', null,
   '[{"id":"blocks","label":"Block coding (Scratch, code.org)"},{"id":"python","label":"Python"},{"id":"web","label":"HTML or CSS"},{"id":"ai","label":"AI tools like ChatGPT"},{"id":"none","label":"None of these yet"}]', null, null, null),
  ('time', 4, 'single', 'How much time could you spend learning each week?', null,
   '[{"id":"lt1","label":"Less than 1 hour"},{"id":"1to2","label":"1 to 2 hours"},{"id":"3to4","label":"3 to 4 hours"},{"id":"5plus","label":"5 hours or more"}]', null, null, null),
  ('goal', 5, 'single', 'What is your main reason for learning to code?', null,
   '[{"id":"fun","label":"It looks fun, I want to explore"},{"id":"school","label":"For school or class credit"},{"id":"project","label":"I have a project I want to make"},{"id":"career","label":"I want a tech job someday"}]', null, null, null),
  ('k_py_vars', 6, 'knowledge', 'What does this program print?', E'x = 5\nx = x + 2\nprint(x)',
   '[{"id":"a","label":"5"},{"id":"b","label":"7"},{"id":"c","label":"x + 2"},{"id":"d","label":"52"}]', 'python', 1, 20000),
  ('k_web_html', 7, 'knowledge', 'Which HTML tag makes the biggest heading?', null,
   '[{"id":"a","label":"<h6>"},{"id":"b","label":"<head>"},{"id":"c","label":"<h1>"},{"id":"d","label":"<big>"}]', 'web', 1, 15000),
  ('k_ai_data', 8, 'knowledge', 'An AI model learns to recognize cats by...', null,
   '[{"id":"a","label":"Studying lots of example pictures"},{"id":"b","label":"Being told the rules of what a cat is"},{"id":"c","label":"Searching the internet each time"},{"id":"d","label":"Guessing randomly until it is right"}]', 'ai', 1, 20000),
  ('k_py_loops', 9, 'knowledge', 'What does this program print?', E'for i in range(3):\n    print(i)',
   '[{"id":"a","label":"1 2 3"},{"id":"b","label":"0 1 2 3"},{"id":"c","label":"0 1 2"},{"id":"d","label":"3 3 3"}]', 'python', 2, 30000),
  ('k_web_css', 10, 'knowledge', 'Which CSS property changes the color of text?', null,
   '[{"id":"a","label":"font-color"},{"id":"b","label":"color"},{"id":"c","label":"text-style"},{"id":"d","label":"background"}]', 'web', 2, 20000),
  ('k_ai_bias', 11, 'knowledge', 'An AI is trained only on photos of adults. What will most likely happen with photos of kids?', null,
   '[{"id":"a","label":"It works just as well"},{"id":"b","label":"It makes more mistakes"},{"id":"c","label":"It refuses to run"},{"id":"d","label":"It learns kids on its own"}]', 'ai', 2, 30000),
  ('k_py_func', 12, 'knowledge', 'What does this program print?', E'def double(n):\n    return n * 2\n\nprint(double(double(3)))',
   '[{"id":"a","label":"6"},{"id":"b","label":"9"},{"id":"c","label":"12"},{"id":"d","label":"An error"}]', 'python', 3, 45000);

insert into placement_keys (item_id, answer) values
  ('k_py_vars', 'b'), ('k_web_html', 'c'), ('k_ai_data', 'a'), ('k_py_loops', 'c'),
  ('k_web_css', 'b'), ('k_ai_bias', 'b'), ('k_py_func', 'c');

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------
-- Subject of a course, from its title (same idea as src/student/languages.ts).
create function course_subject(p_title text) returns text
language sql immutable as $$
  select case
    when p_title ~* 'python' then 'python'
    when p_title ~* '(^|[^a-z])ai([^a-z]|$)|machine learning|artificial intelligence' then 'ai'
    when p_title ~* 'web|html|css|javascript' then 'web'
  end
$$;

create function _level_of(p_score numeric) returns course_level
language sql immutable as $$
  select case
    when p_score < 0.35 then 'beginner'
    when p_score < 0.60 then 'intermediate'
    when p_score < 0.85 then 'advanced'
    else 'expert' end::course_level
$$;

create function _level_index(p_level course_level) returns int
language sql immutable as $$
  select array_position(array['beginner', 'intermediate', 'advanced', 'expert']::course_level[], p_level)
$$;

-- Best original, published, self-paced course for a subject at a target level.
create function _course_for(p_subject text, p_level course_level) returns courses
language sql stable security definer set search_path = public as $$
  select c.* from courses c
  where c.published and c.copied_from is null and c.delivery_mode = 'self_paced'
    and course_subject(c.title) = p_subject
  order by abs(_level_index(c.level) - _level_index(p_level)), _level_index(c.level), c.title
  limit 1
$$;

revoke all on function _course_for(text, course_level) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Scoring
-- ---------------------------------------------------------------------------
-- p_answers: {"<item id>": {"value": ..., "events": [{"choice": "<id>", "t": ms}], "time_ms": n, "not_yet": bool}}
--   rating    value = {"ai": 1-4, "python": 1-4, "web": 1-4}
--   single    value = "<choice id>"
--   multi     value = ["<choice id>", ...]
--   knowledge value = "<choice id>" (or not_yet = true)
--
-- Each knowledge answer becomes "evidence" from 0 to 1:
--   right first time, no changes, normal speed  1.00  confident
--   right, changed answers but started right     0.90  careful
--   right after starting wrong                   0.75  worked it out
--   wrong after starting right                   0.35  second-guessed
--   wrong                                        0.10
--   wrong in under a quarter of the expected time 0  probably a guess
--   "I haven't learned this yet"                 0     honest, never counted as a guess
-- Ability per subject = evidence weighted by difficulty (1-3). Level from ability.
-- Interest per subject = 60% rating + 30% "want to build" + 10% "tried before".
create function submit_placement(p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := auth.uid();
  it record;
  a jsonb;
  v_key text;
  v_final text;
  v_first text;
  v_changes int;
  v_time int;
  v_ratio numeric;
  v_e numeric;
  v_not_yet boolean;
  v_subjects text[] := array['python', 'web', 'ai'];
  s text;
  num jsonb := '{"python":0,"web":0,"ai":0}';
  den jsonb := '{"python":0,"web":0,"ai":0}';
  rightc jsonb := '{"python":0,"web":0,"ai":0}';
  totalc jsonb := '{"python":0,"web":0,"ai":0}';
  n_confident int := 0; n_careful int := 0; n_worked int := 0; n_second int := 0;
  n_guess int := 0; n_not_yet int := 0;
  speed_sum numeric := 0; speed_n int := 0;
  v_build text := p_answers -> 'build' ->> 'value';
  v_tried jsonb := coalesce(p_answers -> 'tried' -> 'value', '[]'::jsonb);
  v_time_choice text := p_answers -> 'time' ->> 'value';
  v_goal text := p_answers -> 'goal' ->> 'value';
  v_rating int;
  interest jsonb := '{}';
  ability jsonb := '{}';
  v_overall numeric;
  v_level course_level;
  v_pace text;
  v_commit numeric;
  v_commitment text;
  v_order text[];
  v_top text;
  v_course courses;
  v_alt jsonb := '[]';
  v_reasons jsonb := '[]';
  v_skip_tip boolean := false;
  v_labels jsonb := '{"python":"Python","web":"web development","ai":"AI"}';
  v_result jsonb;
begin
  if not current_role_is('student') then
    raise exception 'STUDENTS_ONLY';
  end if;
  if jsonb_typeof(p_answers) is distinct from 'object' or pg_column_size(p_answers) > 65536 then
    raise exception 'BAD_ANSWERS';
  end if;

  -- Knowledge: evidence per answer.
  for it in
    select i.id, i.subject, i.difficulty, i.expected_ms, k.answer
    from placement_items i join placement_keys k on k.item_id = i.id
    where i.kind = 'knowledge' and i.active
  loop
    a := coalesce(p_answers -> it.id, '{}'::jsonb);
    v_not_yet := coalesce((a ->> 'not_yet')::boolean, false);
    v_final := a ->> 'value';
    v_first := coalesce(a -> 'events' -> 0 ->> 'choice', v_final);
    v_changes := greatest(coalesce(jsonb_array_length(case when jsonb_typeof(a -> 'events') = 'array' then a -> 'events' end), 0) - 1, 0);
    v_time := least(greatest(coalesce((a ->> 'time_ms')::int, 0), 0), 600000);
    v_ratio := v_time::numeric / it.expected_ms;

    if v_not_yet or v_final is null then
      v_e := 0; n_not_yet := n_not_yet + 1;
    elsif v_final = it.answer then
      if v_changes = 0 and v_ratio <= 1.5 then v_e := 1.00; n_confident := n_confident + 1;
      elsif v_first = it.answer then v_e := 0.90; n_careful := n_careful + 1;
      else v_e := 0.75; n_worked := n_worked + 1;
      end if;
      rightc := jsonb_set(rightc, array[it.subject], to_jsonb((rightc ->> it.subject)::int + 1));
    elsif v_first = it.answer then
      v_e := 0.35; n_second := n_second + 1;
    elsif v_ratio < 0.25 then
      v_e := 0; n_guess := n_guess + 1;
    else
      v_e := 0.10;
    end if;

    if not v_not_yet and v_final is not null then
      speed_sum := speed_sum + least(v_ratio, 3); speed_n := speed_n + 1;
    end if;
    totalc := jsonb_set(totalc, array[it.subject], to_jsonb((totalc ->> it.subject)::int + 1));
    num := jsonb_set(num, array[it.subject], to_jsonb((num ->> it.subject)::numeric + v_e * it.difficulty));
    den := jsonb_set(den, array[it.subject], to_jsonb((den ->> it.subject)::numeric + it.difficulty));
  end loop;

  -- Ability and interest per subject.
  foreach s in array v_subjects loop
    ability := ability || jsonb_build_object(s, round(case when (den ->> s)::numeric > 0
      then (num ->> s)::numeric / (den ->> s)::numeric else 0 end, 2));
    v_rating := least(greatest(coalesce((p_answers -> 'interest' -> 'value' ->> s)::int, 2), 1), 4);
    interest := interest || jsonb_build_object(s, round(
        0.6 * (v_rating - 1) / 3.0
      + case when v_build = s then 0.3 else 0 end
      + case when v_tried ? s then 0.1 else 0 end, 2));
  end loop;

  v_overall := round(coalesce((select sum(value::numeric) from jsonb_each_text(num))
    / nullif((select sum(value::numeric) from jsonb_each_text(den)), 0), 0), 2);
  v_level := _level_of(v_overall);

  -- How they answer.
  v_pace := case
    when n_guess >= 2 then 'rushing'
    when n_second >= 2 then 'second_guessing'
    when speed_n > 0 and speed_sum / speed_n <= 0.8 and n_confident >= 3 then 'quick_and_sure'
    when speed_n > 0 and speed_sum / speed_n > 1.5 then 'careful'
    else 'steady' end;

  -- Willingness: time per week plus goal.
  v_commit := case v_time_choice when 'lt1' then 0.25 when '1to2' then 0.5 when '3to4' then 0.75 when '5plus' then 1 else 0.5 end
    + case when v_goal in ('project', 'career') then 0.1 else 0 end;
  v_commitment := case when v_commit < 0.4 then 'light' when v_commit < 0.8 then 'steady' else 'committed' end;

  -- Subjects in order of fit: interest first, then the "build" pick, then least known.
  select array_agg(subj order by (interest ->> subj)::numeric desc,
                   (subj = v_build) desc, (ability ->> subj)::numeric asc)
    into v_order
  from unnest(v_subjects) subj
  where (_course_for(subj, 'beginner')).id is not null;

  if v_order is not null then
    v_top := v_order[1];
    v_course := _course_for(v_top, _level_of((ability ->> v_top)::numeric));
    v_skip_tip := (ability ->> v_top)::numeric >= 0.6
      and _level_index(v_course.level) < _level_index(_level_of((ability ->> v_top)::numeric));

    for i in 2 .. coalesce(array_length(v_order, 1), 1) loop
      v_alt := v_alt || jsonb_build_array(jsonb_build_object(
        'subject', v_order[i],
        'course', (select to_jsonb(c) - 'owner_id' - 'copied_from' from _course_for(v_order[i], _level_of((ability ->> v_order[i])::numeric)) c)));
    end loop;

    -- Plain-language reasons, shown to the student.
    v_reasons := jsonb_build_array(format('You''re most interested in %s.', v_labels ->> v_top));
    v_reasons := v_reasons || jsonb_build_array(case
      when (totalc ->> v_top)::int = 0 then format('This course starts with the basics of %s.', v_labels ->> v_top)
      when (ability ->> v_top)::numeric < 0.35 then format('You''re new to %s, and this course starts from the beginning.', v_labels ->> v_top)
      else format('You got %s of %s %s questions right.', rightc ->> v_top, totalc ->> v_top, v_labels ->> v_top) end);
    v_reasons := v_reasons || jsonb_build_array(case v_pace
      when 'quick_and_sure' then 'You answer quickly and confidently.'
      when 'careful' then 'You take your time and think things through.'
      when 'second_guessing' then 'You sometimes changed a right answer. Trust your first idea!'
      when 'rushing' then 'Some answers were very fast. Slow down on the warm-ups to show what you know.'
      else 'You work at a steady pace.' end);
    if v_skip_tip then
      v_reasons := v_reasons || jsonb_build_array('You already know some of this. Pass a module''s warm-up to skip ahead.');
    end if;
  end if;

  v_result := jsonb_build_object(
    'level', v_level,
    'knowledge', v_overall,
    'ability', ability,
    'interest', interest,
    'pace', v_pace,
    'commitment', v_commitment,
    'signals', jsonb_build_object('confident', n_confident, 'careful', n_careful, 'worked_out', n_worked,
      'second_guessed', n_second, 'guessed', n_guess, 'not_yet', n_not_yet,
      'avg_speed', case when speed_n > 0 then round(speed_sum / speed_n, 2) end),
    'subject', v_top,
    'course', case when v_course.id is not null then
      jsonb_build_object('id', v_course.id, 'title', v_course.title, 'description', v_course.description,
        'level', v_course.level, 'delivery_mode', v_course.delivery_mode) end,
    'reasons', v_reasons,
    'skip_tip', v_skip_tip,
    'alternatives', v_alt);

  insert into placement_results (student_id, answers, result, recommended_course_id)
  values (v_student, p_answers, v_result, v_course.id);

  return v_result;
end
$$;

-- Latest quiz outcome for the signed-in student: null if never taken or skipped.
create function my_placement() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('skipped', r.skipped, 'result', r.result, 'taken_at', r.created_at)
  from placement_results r
  where r.student_id = auth.uid()
  order by r.created_at desc
  limit 1
$$;

-- "Skip for now": remembered so the quiz stops opening automatically.
create function skip_placement() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not current_role_is('student') then
    raise exception 'STUDENTS_ONLY';
  end if;
  if not exists (select 1 from placement_results where student_id = auth.uid()) then
    insert into placement_results (student_id, skipped) values (auth.uid(), true);
  end if;
end
$$;

revoke all on function submit_placement(jsonb) from public, anon;
revoke all on function my_placement() from public, anon;
revoke all on function skip_placement() from public, anon;
grant execute on function submit_placement(jsonb) to authenticated;
grant execute on function my_placement() to authenticated;
grant execute on function skip_placement() to authenticated;
