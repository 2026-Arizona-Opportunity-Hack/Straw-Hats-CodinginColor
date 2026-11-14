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
