-- Give students a restricted view of published quizzes. The assignment table
-- still contains teacher-only answer keys and keeps its staff-only policy.
alter table public.assignment_submissions
  add column attempt_count integer not null default 1 check (attempt_count > 0);

create function curriculum_private.enrolled_quizzes()
returns table (quiz public.assignments, class_name text, roster_id uuid)
language sql stable set search_path = '' as $$
  select a, c.name, roster.id
  from public.enrollments e
  join public.classes c on c.id = e.class_id and c.archived_at is null
  join public.class_students roster on roster.class_id = c.id and roster.profile_id = e.student_id
  join public.assignments a on a.class_id = c.id and a.published and a.kind = 'quiz'
  where e.student_id = (select auth.uid()) and (select public.current_role_is('student'))
    and not exists (select 1 from curriculum_private.assignment_activities linked where linked.assignment_id = a.id)
$$;

create function curriculum_private.quiz_blocks(content jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(content->'blocks') = 'array' then content->'blocks' else coalesce((
    select jsonb_agg(jsonb_build_object('id', 'legacy-question-' || pos, 'type', 'question', 'question', question) order by pos)
    from jsonb_array_elements(case when jsonb_typeof(content #> '{quiz,questions}') = 'array'
      then content #> '{quiz,questions}' else '[]'::jsonb end) with ordinality as old(question, pos)
  ), '[]'::jsonb) end
$$;

-- The teacher gradebook compares JavaScript Numbers, which are IEEE doubles.
create function curriculum_private.quiz_number_matches(answer text, expected text, tolerance text)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if answer is null or length(answer) > 64
    or answer !~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]{1,3})?$'
  then return false; end if;
  return coalesce(abs(answer::double precision - expected::double precision) <= tolerance::double precision, false);
exception when numeric_value_out_of_range or invalid_text_representation then
  return false;
end
$$;

-- Keep the score in sync with the teacher gradebook without exposing the key.
create function curriculum_private.quiz_score(content jsonb, responses jsonb, manual_scores jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  with blocks as (
    select b, b->'question' as q, responses->(b->>'id') as answer, manual_scores->(b->>'id') as manual
    from jsonb_array_elements(curriculum_private.quiz_blocks(content)) b
  ), points as (
    select *, case
      when b->>'type' = 'question' then coalesce((q->>'points')::numeric, 0)
      when b->>'type' in ('written', 'code', 'file') and jsonb_typeof(b->'rubric') = 'array'
        and b->'rubric' <> '[]'::jsonb then (
          select coalesce(sum(coalesce(top.points, 0)), 0)
          from jsonb_array_elements(b->'rubric') criterion
          cross join lateral (select max((rating->>'points')::numeric) as points
            from jsonb_array_elements(criterion->'ratings') rating) top
        )
      else coalesce((b->>'points')::numeric, 0) end as possible
    from blocks
  ), scores as (
    select possible, case
      when jsonb_typeof(manual) = 'number' then (manual #>> '{}')::numeric
      when b->>'type' = 'question' then case when (
        case q->>'kind'
          when 'short' then exists (
            select 1 from jsonb_array_elements_text(q->'accepted') text_key
            where jsonb_typeof(answer) = 'string' and strip.normalized <> ''
              and lower(regexp_replace(text_key, '^\s+|\s+$', '', 'g')) = lower(strip.normalized)
          )
          when 'numeric' then jsonb_typeof(answer) = 'string'
            and curriculum_private.quiz_number_matches(strip.normalized, q->>'answer', q->>'tolerance')
          else case when jsonb_typeof(answer) = 'array' and jsonb_typeof(q->'correct') = 'array'
            then answer @> (q->'correct') and (q->'correct') @> answer
              and jsonb_array_length(answer) = jsonb_array_length(q->'correct')
            else false end
        end
      ) then possible else 0 end
      when b->>'type' = 'completion' then case when answer = '"1"'::jsonb then possible else 0 end
      when b->>'type' = 'html' and b->'reportsScore' = 'true'::jsonb then case
        when jsonb_typeof(answer) = 'string' and length(strip.normalized) <= 64
          and strip.normalized ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]{1,3})?$'
        then round(least(greatest(strip.normalized::numeric, 0), 1) * possible, 2) else 0 end
      when b->>'type' in ('written', 'code', 'file', 'html') then null
      else 0 end as earned
    from points
    cross join lateral (select regexp_replace(answer #>> '{}', '^\s+|\s+$', '', 'g') as normalized) strip
  )
  select case when count(*) filter (where earned is null) = 0 then
    jsonb_build_object('earned', coalesce(sum(earned), 0), 'possible', coalesce(sum(possible), 0)) end
  from scores
$$;

create function curriculum_private.quiz_can_submit(s public.assignment_submissions, max_attempts integer)
returns boolean language sql immutable set search_path = '' as $$
  select s.graded_at is null and coalesce(s.manual_scores, '{}'::jsonb) = '{}'::jsonb
    and coalesce(s.rubric_scores, '{}'::jsonb) = '{}'::jsonb and coalesce(s.feedback, '') = ''
    and (max_attempts is null or coalesce(s.attempt_count, 0) < max_attempts)
$$;

create function curriculum_private.quiz_submission_problem(a public.assignments) returns text
language sql immutable set search_path = '' as $$
  select case
    when a.time_limit_minutes is not null then 'This quiz has a time limit that the student player cannot apply.'
    when a.content->'shuffle' = 'true'::jsonb or a.content #> '{quiz,shuffle}' = 'true'::jsonb
      then 'This quiz requires shuffled questions.'
    when exists (select 1 from jsonb_array_elements(curriculum_private.quiz_blocks(a.content)) b
      where b->>'type' = 'file' or (b->>'type' = 'html' and b->'reportsScore' = 'true'::jsonb))
      then 'This quiz includes a file upload or an interactive score.'
    end
$$;

-- Submitted answers and scores keep their original prompts and answer keys.
create function curriculum_private.protect_quiz_work() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.kind = 'quiz' then
    if tg_op = 'DELETE' or new.kind <> old.kind or new.class_id <> old.class_id
      or curriculum_private.quiz_blocks(new.content) is distinct from curriculum_private.quiz_blocks(old.content)
    then
      if exists (select 1 from public.assignment_submissions s where s.assignment_id = old.id) then
        raise exception 'This quiz has submissions. Unpublish it to hide it or duplicate it to change the questions.' using errcode = '23514';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

create trigger protect_submitted_quiz before delete or update on public.assignments
for each row execute function curriculum_private.protect_quiz_work();

create function public.my_class_quizzes()
returns table (id uuid, title text, class_name text, submitted boolean, graded boolean)
language sql stable security definer set search_path = '' as $$
  select (q.quiz).id, (q.quiz).title, q.class_name, s.id is not null,
    case when s.id is not null and not curriculum_private.quiz_can_submit(s, (q.quiz).max_attempts)
      then curriculum_private.quiz_score((q.quiz).content, s.responses, s.manual_scores) is not null
      else false end
  from curriculum_private.enrolled_quizzes() q
  left join public.assignment_submissions s on s.assignment_id = (q.quiz).id and s.class_student_id = q.roster_id
  order by (q.quiz).due_at nulls last, (q.quiz).created_at desc, (q.quiz).id
$$;

create function public.my_class_quiz(p_quiz_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', (q.quiz).id, 'title', (q.quiz).title, 'className', q.class_name,
    'instructions', (q.quiz).instructions, 'dueAt', (q.quiz).due_at,
    'maxAttempts', (q.quiz).max_attempts, 'attemptCount', coalesce(s.attempt_count, 0),
    'submittedAt', s.submitted_at, 'gradedAt', s.graded_at, 'revision', (q.quiz).updated_at,
    'responses', coalesce(s.responses, '{}'::jsonb),
    'feedback', case when s.graded_at is not null then s.feedback end,
    'score', case when s.id is not null and not curriculum_private.quiz_can_submit(s, (q.quiz).max_attempts)
      then curriculum_private.quiz_score((q.quiz).content, s.responses, s.manual_scores) end,
    'canSubmit', problem.reason is null and curriculum_private.quiz_can_submit(s, (q.quiz).max_attempts),
    'submissionProblem', problem.reason,
    'blocks', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', b->>'id', 'type', b->>'type') ||
        case b->>'type'
          when 'question' then jsonb_build_object('question', jsonb_build_object(
            'kind', b #>> '{question,kind}', 'prompt', b #>> '{question,prompt}',
            'choices', b #> '{question,choices}', 'points', b #> '{question,points}'
          ))
          when 'text' then jsonb_build_object('text', b->>'text')
          when 'link' then jsonb_build_object('url', b->>'url', 'caption', b->>'caption')
          when 'html' then jsonb_build_object('html', b->>'html')
          when 'completion' then jsonb_build_object('title', b->>'title')
          else jsonb_build_object('prompt', b->>'prompt', 'starter', b->>'starter')
        end order by pos
      )
      from jsonb_array_elements(curriculum_private.quiz_blocks((q.quiz).content)) with ordinality as blocks(b, pos)
    ), '[]'::jsonb)
  )
  from curriculum_private.enrolled_quizzes() q
  left join public.assignment_submissions s on s.assignment_id = (q.quiz).id and s.class_student_id = q.roster_id
  cross join lateral (select curriculum_private.quiz_submission_problem(q.quiz) as reason) problem
  where (q.quiz).id = p_quiz_id
$$;

create function public.submit_class_quiz(p_quiz_id uuid, p_responses jsonb, p_expected_attempt_count integer, p_revision timestamptz)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  target public.assignments;
  roster uuid;
  response record;
  block jsonb;
  question_kind text;
  choices jsonb;
begin
  -- Access is checked before taking a lock. A shared lock prevents a teacher
  -- changing the quiz during submission without serializing different students.
  select a.* into target
  from public.assignments a
  join curriculum_private.enrolled_quizzes() q on (q.quiz).id = a.id
  where a.id = p_quiz_id and a.published and a.kind = 'quiz'
  for share of a;
  if found then
    select q.roster_id into roster from curriculum_private.enrolled_quizzes() q
    where (q.quiz).id = p_quiz_id;
  end if;
  if roster is null then raise exception 'QUIZ_UNAVAILABLE' using errcode = '42501'; end if;
  if target.updated_at is distinct from p_revision then
    raise exception 'QUIZ_CHANGED' using errcode = '22023';
  end if;
  if curriculum_private.quiz_submission_problem(target) is not null then
    raise exception 'QUIZ_UNSUPPORTED' using errcode = '22023';
  end if;

  if p_expected_attempt_count is null or p_expected_attempt_count < 0
    or jsonb_typeof(p_responses) is distinct from 'object' or octet_length(p_responses::text) > 240000 then
    raise exception 'INVALID_QUIZ_RESPONSE' using errcode = '22023';
  end if;
  for response in select * from jsonb_each(p_responses) loop
    select b into block from jsonb_array_elements(curriculum_private.quiz_blocks(target.content)) b
    where b->>'id' = response.key;
    if block->>'type' = 'question' and block #>> '{question,kind}' in ('single', 'multiple', 'truefalse') then
      question_kind := block #>> '{question,kind}';
      choices := block #> '{question,choices}';
      if jsonb_typeof(response.value) <> 'array' or jsonb_typeof(choices) is distinct from 'array' then
        raise exception 'INVALID_QUIZ_RESPONSE' using errcode = '22023';
      end if;
      if (question_kind <> 'multiple' and jsonb_array_length(response.value) <> 1)
        or exists (
          select 1 from jsonb_array_elements(response.value) picked
          where not exists (
            select 1 from jsonb_array_elements_text(choices) with ordinality AS options(choice, pos)
            where picked = to_jsonb(pos - 1) and btrim(choice) <> ''
          )
        )
        or jsonb_array_length(response.value) <> (select count(distinct picked) from jsonb_array_elements(response.value) picked)
      then raise exception 'INVALID_QUIZ_RESPONSE' using errcode = '22023'; end if;
    elsif (block->>'type' in ('written', 'code')
      or (block->>'type' = 'question' and block #>> '{question,kind}' in ('short', 'numeric')))
      and jsonb_typeof(response.value) = 'string' then
      continue;
    else
      raise exception 'INVALID_QUIZ_RESPONSE' using errcode = '22023';
    end if;
  end loop;

  insert into public.assignment_submissions as previous (assignment_id, class_id, class_student_id, responses)
  select target.id, target.class_id, roster, p_responses
  where p_expected_attempt_count = 0 or exists (select 1 from public.assignment_submissions s
    where s.assignment_id = target.id and s.class_student_id = roster)
  on conflict (assignment_id, class_student_id) do update
  set responses = excluded.responses, submitted_at = clock_timestamp(), attempt_count = previous.attempt_count + 1
  where previous.attempt_count = p_expected_attempt_count
    and previous.responses is distinct from excluded.responses
    and curriculum_private.quiz_can_submit(previous, target.max_attempts);
  -- A network retry with the same answers returns success without consuming another attempt.
  if not found and not exists (select 1 from public.assignment_submissions s
    where s.assignment_id = target.id and s.class_student_id = roster and s.responses = p_responses)
  then raise exception 'QUIZ_SUBMISSION_CLOSED' using errcode = '22023'; end if;
end
$$;

revoke all on function curriculum_private.enrolled_quizzes(), curriculum_private.quiz_blocks(jsonb),
  curriculum_private.quiz_score(jsonb, jsonb, jsonb), curriculum_private.quiz_number_matches(text, text, text),
  curriculum_private.quiz_can_submit(public.assignment_submissions, integer),
  curriculum_private.quiz_submission_problem(public.assignments), curriculum_private.protect_quiz_work()
  from public, anon, authenticated;
revoke all on function public.my_class_quizzes(), public.my_class_quiz(uuid), public.submit_class_quiz(uuid, jsonb, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.my_class_quizzes(), public.my_class_quiz(uuid), public.submit_class_quiz(uuid, jsonb, integer, timestamptz)
  to authenticated;
