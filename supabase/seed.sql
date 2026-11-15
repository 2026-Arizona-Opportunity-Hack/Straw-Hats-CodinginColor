-- Demo data for local dev and the hackathon demo. NOT for production. Owner: Aryan.
-- Matches supabase/migrations/0001_core_schema.sql and tells the same story as src/admin/mocks.ts.
-- Every demo account's password is "cic-learn-demo".
--
--   CIC Admin          admin@cic.demo
--   Instructors        teacher@cic.demo (Maryvale) · ana.lopez@cic.demo (Desert Edge, Carl Hayden)
--   External Reviewer  reviewer@cic.demo
--
-- 16 students with generated progress over the last three weeks: finished, part-way, stuck
-- (3 failed coding tries, then idle) and not started. Deterministic (setseed).

select setseed(0.42);

create or replace function pg_temp.demo_user(p_id uuid, p_email text, p_name text, p_role text, p_school text default null)
returns void language plpgsql as $$
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt('cic-learn-demo', extensions.gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('display_name', p_name), now() - interval '30 days', now(), '', '', '', '');
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (p_id::text, p_id, jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now());
  -- The core schema has no signup trigger, so create the profile here.
  insert into public.profiles (id, role, display_name, school) values (p_id, p_role::user_role, p_name, p_school)
  on conflict (id) do update set role = excluded.role, display_name = excluded.display_name, school = excluded.school;
end $$;

-- ───────── Staff ─────────
select pg_temp.demo_user('00000000-0000-0000-0000-0000000000a1', 'admin@cic.demo', 'Dana Whitfield', 'admin');
select pg_temp.demo_user('00000000-0000-0000-0000-0000000000b1', 'teacher@cic.demo', 'Marcus Rivera', 'instructor', 'Maryvale High School');
select pg_temp.demo_user('00000000-0000-0000-0000-0000000000b2', 'ana.lopez@cic.demo', 'Ana Lopez', 'instructor', 'Desert Edge High School');
select pg_temp.demo_user('00000000-0000-0000-0000-0000000000c1', 'reviewer@cic.demo', 'Riley Chen', 'reviewer');

-- ───────── Curriculum: Intro to Python (CIC library course, self-paced) ─────────
insert into courses (id, title, description, level, delivery_mode, is_library, owner_id, published) values
  ('30000000-0000-0000-0000-000000000001', 'Intro to Python',
   'Start from zero: store data, make decisions, repeat work, and package code into functions.',
   'beginner', 'self_paced', true, '00000000-0000-0000-0000-0000000000a1', true);

-- Each module follows the CIC template: pretest → video → check → worksheet → code → exit → post-test.
do $$
declare
  m record;
  l uuid;
begin
  for m in select * from (values
    (1, '40000000-0000-0000-0000-000000000001'::uuid, 'Variables & Data Types', 'variables', true),
    (2, '40000000-0000-0000-0000-000000000002'::uuid, 'Making Decisions', 'conditionals', true),
    (3, '40000000-0000-0000-0000-000000000003'::uuid, 'Loops', 'loops', true),
    (4, '40000000-0000-0000-0000-000000000004'::uuid, 'Functions', 'functions', false)
  ) as t(pos, id, title, concept, published)
  loop
    insert into modules (id, course_id, position, title, concept, published)
    values (m.id, '30000000-0000-0000-0000-000000000001', m.pos, m.title, m.concept, m.published);
    insert into lessons (module_id, position, title, is_checkpoint) values (m.id, 1, m.title, true) returning id into l;
    insert into activities (lesson_id, position, type, concept, points, content) values
      (l, 1, 'pretest', m.concept, 5, jsonb_build_object('title', 'What do you already know?', 'questions', jsonb_build_array())),
      (l, 2, 'video', m.concept, 1, jsonb_build_object('url', 'https://www.youtube.com/watch?v=kqtD5dpn9C8', 'caption', m.title || ' in 4 minutes')),
      (l, 3, 'check', m.concept, 1, jsonb_build_object('prompt', 'What will this print?',
        'choices', jsonb_build_array(jsonb_build_object('id', 'a', 'label', '3'), jsonb_build_object('id', 'b', 'label', '33')))),
      (l, 4, 'worksheet', m.concept, 3, jsonb_build_object('title', m.title || ' worksheet', 'fields', jsonb_build_array(
        jsonb_build_object('id', 'w1', 'kind', 'long_answer', 'prompt', 'Where would you use ' || m.concept || ' in an app you use?')))),
      (l, 5, 'code', m.concept, 3, jsonb_build_object('prompt', 'Finish the program so it prints the right answer.', 'starter_code', '# your code here', 'tests', jsonb_build_array())),
      (l, 6, 'exit', m.concept, 1, jsonb_build_object('prompt', 'What is one thing you learned today?', 'choices', jsonb_build_array())),
      (l, 7, 'posttest', m.concept, 5, jsonb_build_object('title', 'Show what you learned', 'questions', jsonb_build_array()));
  end loop;
end $$;

-- Fresh projects seed after migrations. Install the scored demo forms before creating
-- the class fixtures so they do not depend on migration 1010 seeing existing seed rows.
create or replace function pg_temp.mcq(p_id text, p_concept text, p_prompt text, p_choices text[], p_right int)
returns jsonb language sql immutable as $$
  select jsonb_build_object('id', p_id, 'concept', p_concept, 'prompt', p_prompt,
    'choices', (select jsonb_agg(jsonb_build_object('id', chr(96 + n::int), 'label', c) order by n)
                from unnest(p_choices) with ordinality as t(c, n)),
    'answer', chr(96 + p_right))
$$;

-- Builder view of the same items: choice labels plus the right answer's index.
create or replace function pg_temp.builder_questions(p_items jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'prompt', i ->> 'prompt', 'concept', i ->> 'concept',
      'choices', (select jsonb_agg(c ->> 'label' order by n) from jsonb_array_elements(i -> 'choices') with ordinality as t(c, n)),
      'answer', ascii(i ->> 'answer') - 97) order by k), '[]'::jsonb)
  from jsonb_array_elements(p_items) with ordinality as x(i, k)
$$;

create or replace function pg_temp.set_module(p_module_title text, p_check jsonb, p_pre jsonb, p_post jsonb)
returns void language plpgsql as $$
begin
  -- Quick question: code to read, choices, right answer.
  update activities a set content = (a.content - 'questions') || p_check || jsonb_build_object(
      'questions', jsonb_build_array(jsonb_build_object(
        'prompt', p_check ->> 'prompt', 'concept', a.concept,
        'choices', (select jsonb_agg(c ->> 'label' order by n) from jsonb_array_elements(p_check -> 'choices') with ordinality as t(c, n)),
        'answer', ascii(p_check ->> 'answer') - 97)))
  from lessons l join modules m on m.id = l.module_id
  where a.lesson_id = l.id and a.type = 'check' and m.title = p_module_title
    and m.course_id = '30000000-0000-0000-0000-000000000001';

  update activities a set content = jsonb_build_object(
      'title', 'What do you already know?', 'items', p_pre, 'questions', pg_temp.builder_questions(p_pre))
  from lessons l join modules m on m.id = l.module_id
  where a.lesson_id = l.id and a.type = 'pretest' and m.title = p_module_title
    and m.course_id = '30000000-0000-0000-0000-000000000001';

  update activities a set content = jsonb_build_object(
      'title', 'Show what you learned', 'items', p_post, 'questions', pg_temp.builder_questions(p_post))
  from lessons l join modules m on m.id = l.module_id
  where a.lesson_id = l.id and a.type = 'posttest' and m.title = p_module_title
    and m.course_id = '30000000-0000-0000-0000-000000000001';
end
$$;

-- 1. Variables & Data Types
select pg_temp.set_module('Variables & Data Types',
  jsonb_build_object('prompt', 'What will this print?',
    'markdown', E'```python\na = "3"\nprint(a + a)\n```\n\nHint: the quotes make `a` text, not a number.',
    'choices', '[{"id":"a","label":"6"},{"id":"b","label":"33"},{"id":"c","label":"3"}]'::jsonb, 'answer', 'b'),
  jsonb_build_array(
    pg_temp.mcq('v1', 'variables', 'Which line stores the number 10 in a variable called score?', array['score = 10', '10 = score', 'score == 10', 'int score 10'], 1),
    pg_temp.mcq('v2', 'data types', 'What type of value is "hello"?', array['str (text)', 'int (whole number)', 'float (decimal)', 'bool (True/False)'], 1),
    pg_temp.mcq('v3', 'variables', 'x = 4, then x = x + 1. What is x now?', array['4', '5', 'x + 1', '41'], 2)),
  jsonb_build_array(
    pg_temp.mcq('v1', 'variables', 'Which is a valid Python variable name?', array['my_score', '2score', 'my-score', 'my score'], 1),
    pg_temp.mcq('v2', 'data types', 'What type of value is 3.5?', array['float (decimal)', 'int (whole number)', 'str (text)', 'bool (True/False)'], 1),
    pg_temp.mcq('v3', 'variables', 'name = "Ana". What does print("Hi " + name) show?', array['Hi Ana', 'Hi name', 'Hi + name', 'An error'], 1)));

-- 2. Making Decisions
select pg_temp.set_module('Making Decisions',
  jsonb_build_object('prompt', 'What will this print?',
    'markdown', E'```python\nage = 15\nif age >= 16:\n    print("drive")\nelse:\n    print("wait")\n```',
    'choices', '[{"id":"a","label":"drive"},{"id":"b","label":"wait"},{"id":"c","label":"Nothing"}]'::jsonb, 'answer', 'b'),
  jsonb_build_array(
    pg_temp.mcq('d1', 'comparisons', 'Which symbol checks whether two values are equal?', array['==', '=', '!=', '=>'], 1),
    pg_temp.mcq('d2', 'conditions', 'x = 7. Is (x > 5 and x < 10) True or False?', array['True', 'False'], 1),
    pg_temp.mcq('d3', 'if/else', 'Which keyword runs code when the if condition is False?', array['else', 'then', 'otherwise', 'stop'], 1)),
  jsonb_build_array(
    pg_temp.mcq('d1', 'comparisons', 'Which symbol means "not equal"?', array['!=', '==', '<>', '=!'], 1),
    pg_temp.mcq('d2', 'conditions', 'temp = 30. What does print("hot" if temp > 25 else "cool") show?', array['hot', 'cool', 'True', 'An error'], 1),
    pg_temp.mcq('d3', 'if/else', 'Which keyword checks another condition after if?', array['elif', 'elseif', 'else if', 'or'], 1)));

-- 3. Loops
select pg_temp.set_module('Loops',
  jsonb_build_object('prompt', 'How many times does this print "hi"?',
    'markdown', E'```python\nfor i in range(3):\n    print("hi")\n```',
    'choices', '[{"id":"a","label":"2"},{"id":"b","label":"3"},{"id":"c","label":"4"}]'::jsonb, 'answer', 'b'),
  jsonb_build_array(
    pg_temp.mcq('l1', 'range', 'Which numbers does range(4) give?', array['0, 1, 2, 3', '1, 2, 3, 4', '0, 1, 2, 3, 4', 'Just 4'], 1),
    pg_temp.mcq('l2', 'while loops', 'Which loop repeats as long as a condition is True?', array['while', 'for', 'repeat', 'loop'], 1),
    pg_temp.mcq('l3', 'for loops', 'total = 0, then for n in [1, 2, 3]: total = total + n. What is total?', array['6', '3', '5', '123'], 1)),
  jsonb_build_array(
    pg_temp.mcq('l1', 'range', 'How many times does for i in range(5) run?', array['5', '4', '6', '0'], 1),
    pg_temp.mcq('l2', 'while loops', 'Which word stops a loop early?', array['break', 'stop', 'exit', 'end'], 1),
    pg_temp.mcq('l3', 'for loops', 'count = 3, then while count > 0: count = count - 1. What is count after the loop?', array['0', '-1', '1', '3'], 1)));

-- 4. Functions
select pg_temp.set_module('Functions',
  jsonb_build_object('prompt', 'What will this print?',
    'markdown', E'```python\ndef greet(name):\n    return "Hi " + name\n\nprint(greet("Sam"))\n```',
    'choices', '[{"id":"a","label":"Hi Sam"},{"id":"b","label":"greet"},{"id":"c","label":"Hi name"},{"id":"d","label":"An error"}]'::jsonb, 'answer', 'a'),
  jsonb_build_array(
    pg_temp.mcq('f1', 'defining functions', 'Which keyword starts a function definition?', array['def', 'func', 'function', 'define'], 1),
    pg_temp.mcq('f2', 'return values', 'What does return do inside a function?', array['Sends a value back to where the function was called', 'Prints the value', 'Stops Python completely', 'Runs the function again'], 1),
    pg_temp.mcq('f3', 'calling functions', 'def add(a, b): return a + b. What is add(2, 3)?', array['5', '23', 'a + b', '6'], 1)),
  jsonb_build_array(
    pg_temp.mcq('f1', 'defining functions', 'In def area(w, h):, what are w and h?', array['Parameters (inputs)', 'Return values', 'Loops', 'Variables outside the function'], 1),
    pg_temp.mcq('f2', 'return values', 'def double(n): return n * 2. What is double(double(2))?', array['8', '4', '6', '16'], 1),
    pg_temp.mcq('f3', 'calling functions', 'Why do programmers write functions?', array['To reuse code instead of copying it', 'To make code run slower', 'To store numbers', 'Only for math'], 1)));

-- ───────── Classes ─────────
insert into classes (id, name, school, course_id, join_code, created_by, created_at) values
  ('20000000-0000-0000-0000-000000000001', 'Maryvale Period 3', 'Maryvale High School',
   '30000000-0000-0000-0000-000000000001', 'MARY-P3', '00000000-0000-0000-0000-0000000000a1', now() - interval '25 days'),
  ('20000000-0000-0000-0000-000000000002', 'Desert Edge Period 5', 'Desert Edge High School',
   '30000000-0000-0000-0000-000000000001', 'DEHS-P5', '00000000-0000-0000-0000-0000000000a1', now() - interval '25 days'),
  ('20000000-0000-0000-0000-000000000003', 'Carl Hayden After School', 'Carl Hayden Community High School',
   '30000000-0000-0000-0000-000000000001', 'CHCHS-AS', '00000000-0000-0000-0000-0000000000a1', now() - interval '25 days');

insert into class_instructors values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b2'),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000b2');

-- Each class starts with every published module of its course assigned.
insert into class_modules (class_id, module_id)
select c.id, m.id from classes c join modules m on m.course_id = c.course_id and m.published;

-- ───────── Students + generated progress ─────────
do $$
declare
  s record;
  sid uuid;
  act record;
  i int := 0;
  n int;
  stop_at int;
  skill numeric;
  t timestamptz;
  sc numeric;
  minutes int;
begin
  for s in select * from (values
    ('20000000-0000-0000-0000-000000000001'::uuid, 'Jayla Brooks', 'done'), ('20000000-0000-0000-0000-000000000001'::uuid, 'Andre Thomas', 'done'),
    ('20000000-0000-0000-0000-000000000001'::uuid, 'Sofia Ramirez', 'mid'), ('20000000-0000-0000-0000-000000000001'::uuid, 'Malik Johnson', 'stuck'),
    ('20000000-0000-0000-0000-000000000001'::uuid, 'Priya Nair', 'mid'), ('20000000-0000-0000-0000-000000000001'::uuid, 'Diego Hernandez', 'none'),
    ('20000000-0000-0000-0000-000000000001'::uuid, 'Imani Carter', 'mid'),
    ('20000000-0000-0000-0000-000000000002'::uuid, 'Lena Okafor', 'done'), ('20000000-0000-0000-0000-000000000002'::uuid, 'Marcus Lee', 'mid'),
    ('20000000-0000-0000-0000-000000000002'::uuid, 'Grace Kim', 'mid'), ('20000000-0000-0000-0000-000000000002'::uuid, 'Elijah Watson', 'stuck'),
    ('20000000-0000-0000-0000-000000000002'::uuid, 'Camila Torres', 'none'),
    ('20000000-0000-0000-0000-000000000003'::uuid, 'Xavier Brown', 'done'), ('20000000-0000-0000-0000-000000000003'::uuid, 'Aaliyah Davis', 'done'),
    ('20000000-0000-0000-0000-000000000003'::uuid, 'Mateo Garcia', 'mid'), ('20000000-0000-0000-0000-000000000003'::uuid, 'Nia Robinson', 'stuck')
  ) as v(class_id, name, profile)
  loop
    i := i + 1;
    sid := ('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid;
    perform pg_temp.demo_user(sid, 'student' || i || '@students.cic.invalid', s.name, 'student',
      (select school from classes where id = s.class_id));
    insert into enrollments (class_id, student_id, joined_at) values (s.class_id, sid, now() - interval '24 days');
    continue when s.profile = 'none';

    skill := 0.45 + random() * 0.45;
    stop_at := case s.profile when 'done' then 999 when 'mid' then 8 + floor(random() * 6)::int else 5 end;
    t := now() - case s.profile when 'mid' then interval '5 days' else interval '22 days' end;
    n := 0;
    for act in
      select a.*, m.position as mpos from activities a
      join lessons l on l.id = a.lesson_id join modules m on m.id = l.module_id
      where m.published order by m.position, l.position, a.position
    loop
      n := n + 1;
      exit when n > stop_at;
      t := t + (interval '25 minutes' + random() * interval '50 minutes')
             + case when act.type = 'pretest' and act.mpos > 1 then interval '1 day' else interval '0' end;
      minutes := case act.type when 'video' then 4 when 'worksheet' then 12 when 'code' then 15
                               when 'pretest' then 7 when 'posttest' then 8 else 2 end;
      if s.profile = 'stuck' and act.type = 'code' then
        t := now() - interval '9 days' - random() * interval '5 days';
        for k in 1..3 loop
          insert into activity_attempts (student_id, activity_id, class_id, score, is_correct, started_at, submitted_at, time_on_task_ms, attempt_no)
          values (sid, act.id, s.class_id, 0, false, t - interval '10 minutes', t, minutes * 60000, k);
          t := t + interval '12 minutes';
        end loop;
        exit;
      end if;
      sc := case act.type
        when 'pretest' then round(least(1, greatest(0, skill * 0.55 + (random() - 0.5) * 0.3)) * 5) / 5
        when 'posttest' then round(least(1, skill * 0.55 + 0.25 + random() * 0.25) * 5) / 5
        when 'check' then case when random() < skill + 0.15 then 1 else 0 end
        when 'video' then 1 when 'exit' then 1
        else round((0.55 + random() * 0.45)::numeric, 2)
      end;
      if act.type = 'posttest' and sc < 0.7 then
        insert into activity_attempts (student_id, activity_id, class_id, score, is_correct, started_at, submitted_at, time_on_task_ms, attempt_no)
        values (sid, act.id, s.class_id, sc, false, t - interval '8 minutes', t, minutes * 60000, 1);
        t := t + interval '1 day';
        sc := 0.8;
        insert into activity_attempts (student_id, activity_id, class_id, score, is_correct, started_at, submitted_at, time_on_task_ms, attempt_no)
        values (sid, act.id, s.class_id, sc, true, t - interval '7 minutes', t, minutes * 60000, 2);
        continue;
      end if;
      insert into activity_attempts (student_id, activity_id, class_id, score, is_correct, started_at, submitted_at, time_on_task_ms, attempt_no)
      values (sid, act.id, s.class_id, sc, sc >= 0.7, t - interval '6 minutes', t, (minutes * 60 + random() * 120)::int * 1000, 1);
    end loop;
  end loop;
end $$;
