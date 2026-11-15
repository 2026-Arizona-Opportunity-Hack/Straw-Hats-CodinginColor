-- An opted-in assignment gets a gradebook entry from its linked module's
-- required steps. Counts only: answers, code and learning-gain scores stay
-- in activity_attempts. Normal assignments keep their existing grading flow.

create table curriculum_private.assignment_module_progress (
  assignment_id uuid primary key references public.assignments(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete cascade,
  score_block_id text not null
);
create index on curriculum_private.assignment_module_progress(module_id);
alter table curriculum_private.assignment_module_progress enable row level security;
revoke all on curriculum_private.assignment_module_progress from public, anon, authenticated;

create function curriculum_private.sync_module_assignment_progress(p_assignment_id uuid, p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
  completed integer;
  required integer;
  first_completed_at timestamptz;
begin
  select a.class_id, roster.id as roster_id, m.id as module_id, tracking.score_block_id
  into target
  from curriculum_private.assignment_module_progress tracking
  join public.assignments a on a.id = tracking.assignment_id and a.module_id = tracking.module_id
  join public.classes g on g.id = a.class_id
  join public.modules m on m.id = tracking.module_id
  join public.courses c on c.id = m.course_id
  join public.enrollments e on e.class_id = g.id and e.student_id = p_student_id
  join public.class_students roster on roster.class_id = g.id and roster.profile_id = e.student_id
  where a.id = p_assignment_id
    and a.published and m.published and c.published and g.archived_at is null
    and a.content @> jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object(
      'id', tracking.score_block_id, 'type', 'html', 'reportsScore', true
    )));
  if not found then
    return;
  end if;

  -- Two tabs can submit separate steps together. Recount after serialization
  -- so the second writer sees the first writer's committed attempt.
  perform pg_advisory_xact_lock(hashtextextended(p_assignment_id::text || ':' || target.roster_id::text, 0));

  select count(attempt.first_recorded), count(*), min(attempt.first_recorded)
  into completed, required, first_completed_at
  from public.lessons l
  join public.activities activity on activity.lesson_id = l.id
  cross join lateral (
    select min(t.submitted_at) as first_recorded
    from public.activity_attempts t
    where t.activity_id = activity.id and t.student_id = p_student_id
      and (t.class_id is null or t.class_id = target.class_id)
  ) attempt
  where l.module_id = target.module_id and activity.counts_toward_unlock;

  if completed = 0 then
    return;
  end if;

  insert into public.assignment_submissions as submission
    (assignment_id, class_id, class_student_id, responses, submitted_at)
  values (
    p_assignment_id, target.class_id, target.roster_id,
    jsonb_build_object(target.score_block_id, (completed::numeric / required)::text),
    first_completed_at
  )
  on conflict (assignment_id, class_student_id) do update
  set responses = submission.responses || excluded.responses
  where not submission.responses @> excluded.responses;
end;
$$;

create function curriculum_private.record_module_assignment_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_assignment uuid;
begin
  if new.submitted_at is null then
    return new;
  end if;

  for target_assignment in
    select tracking.assignment_id
    from public.activities activity
    join public.lessons l on l.id = activity.lesson_id
    join curriculum_private.assignment_module_progress tracking on tracking.module_id = l.module_id
    join public.assignments a on a.id = tracking.assignment_id
    where activity.id = new.activity_id and activity.counts_toward_unlock
      and a.published and (new.class_id is null or new.class_id = a.class_id)
    order by tracking.assignment_id
  loop
    perform curriculum_private.sync_module_assignment_progress(target_assignment, new.student_id);
  end loop;
  return new;
end;
$$;

revoke all on function curriculum_private.sync_module_assignment_progress(uuid, uuid) from public, anon, authenticated;
revoke all on function curriculum_private.record_module_assignment_progress() from public, anon, authenticated;

create trigger record_module_assignment_progress
after insert on public.activity_attempts
for each row execute function curriculum_private.record_module_assignment_progress();
