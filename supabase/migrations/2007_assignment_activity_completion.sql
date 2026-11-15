-- Explicitly linked lesson activities can earn completion points in a class assignment.
-- Keep the student's code and reflection answers in their original activity attempts.
create table curriculum_private.assignment_activities (
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  block_id text not null,
  requires_pass boolean not null default false,
  primary key (assignment_id, activity_id),
  unique (assignment_id, block_id)
);
create index on curriculum_private.assignment_activities (activity_id);
alter table curriculum_private.assignment_activities enable row level security;
revoke all on curriculum_private.assignment_activities from public, anon, authenticated;

-- The archive fields are added by 3001. PL/pgSQL resolves them after all migrations run.
-- A null student is used only by the database owner at activation or on republication.
create function curriculum_private.sync_assignment_completion(p_assignment uuid, p_student uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.assignment_submissions as existing
    (assignment_id, class_id, class_student_id, responses, submitted_at)
  select a.id, a.class_id, roster.id, jsonb_object_agg(link.block_id, '1'::text),
         min(work.submitted_at)
  from public.assignments a
  join public.classes g on g.id = a.class_id and g.archived_at is null
  join public.modules m on m.id = a.module_id and m.published
  join public.courses c on c.id = m.course_id and c.published
  join curriculum_private.assignment_activities link on link.assignment_id = a.id
  join public.activities activity on activity.id = link.activity_id
  join public.lessons l on l.id = activity.lesson_id and l.module_id = m.id
  join public.enrollments e on e.class_id = g.id and (p_student is null or e.student_id = p_student)
  join public.profiles p on p.id = e.student_id and p.role = 'student' and p.archived_at is null
  join public.class_students roster on roster.class_id = g.id and roster.profile_id = p.id
  join lateral (
    select min(t.submitted_at) as submitted_at
    from public.activity_attempts t
    where t.activity_id = activity.id and t.student_id = p.id
      and (t.class_id is null or t.class_id = g.id)
      and (not link.requires_pass or (t.score = 1 and t.is_correct))
      and (activity.type <> 'worksheet' or exists (
        select 1 from jsonb_array_elements(
          case when jsonb_typeof(activity.content -> 'fields') = 'array'
            then activity.content -> 'fields' else '[]'::jsonb end
        ) f
        where jsonb_typeof(t.response -> 'fields' -> (f ->> 'id')) = 'string'
          and btrim(t.response -> 'fields' ->> (f ->> 'id')) <> ''
      ))
  ) work on work.submitted_at is not null
  where a.id = p_assignment and a.published
    and a.content @> jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object(
      'id', link.block_id, 'type', 'completion'
    )))
  group by a.id, roster.id
  order by roster.id
  -- Concurrent submissions merge earned checkpoints. Teacher overrides stay separate.
  on conflict (assignment_id, class_student_id) do update
  set responses = existing.responses || excluded.responses,
      submitted_at = least(existing.submitted_at, excluded.submitted_at)
  where not existing.responses @> excluded.responses or excluded.submitted_at < existing.submitted_at;
end;
$$;

create function curriculum_private.sync_attempt_completion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
begin
  -- Serialize with a teacher publishing or unpublishing this assignment.
  for target in
    select link.assignment_id
    from curriculum_private.assignment_activities link
    join public.assignments a on a.id = link.assignment_id
    where link.activity_id = new.activity_id
      and (new.class_id is null or new.class_id = a.class_id)
    order by link.assignment_id
    for share of a
  loop
    perform curriculum_private.sync_assignment_completion(target, new.student_id);
  end loop;
  return new;
end;
$$;

create function curriculum_private.sync_published_assignment_completion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform curriculum_private.sync_assignment_completion(new.id, null);
  return new;
end;
$$;

revoke all on function curriculum_private.sync_assignment_completion(uuid, uuid) from public, anon, authenticated;
revoke all on function curriculum_private.sync_attempt_completion() from public, anon, authenticated;
revoke all on function curriculum_private.sync_published_assignment_completion() from public, anon, authenticated;

create trigger sync_attempt_completion after insert on public.activity_attempts
for each row when (new.submitted_at is not null)
execute function curriculum_private.sync_attempt_completion();

create trigger sync_published_assignment_completion after update of published on public.assignments
for each row when (new.published and not old.published)
execute function curriculum_private.sync_published_assignment_completion();

-- Student home needs only the assignment label and destination. Keep content,
-- roster data, answer keys and assignment submissions behind existing policies.
create function public.my_module_assignments()
returns table (id uuid, title text, class_name text, module_id uuid, course_id uuid, needs_enrollment boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query
  select a.id, a.title, g.name, m.id, c.id, not public._is_enrolled(e.student_id, c.id)
  from public.enrollments e
  join public.profiles p on p.id = e.student_id and p.role = 'student' and p.archived_at is null
  join public.classes g on g.id = e.class_id and g.archived_at is null
  join public.assignments a on a.class_id = g.id and a.published
  join public.modules m on m.id = a.module_id and m.published
  join public.courses c on c.id = m.course_id and c.published and c.delivery_mode = 'self_paced'
  where e.student_id = (select auth.uid())
    and exists (
      select 1 from curriculum_private.assignment_activities link
      join public.activities activity on activity.id = link.activity_id
      join public.lessons lesson on lesson.id = activity.lesson_id and lesson.module_id = m.id
      where link.assignment_id = a.id and a.content @> jsonb_build_object(
        'blocks', jsonb_build_array(jsonb_build_object('id', link.block_id, 'type', 'completion'))
      )
    )
  order by a.due_at nulls last, a.created_at, a.id;
end;
$$;
revoke all on function public.my_module_assignments() from public, anon, authenticated;
grant execute on function public.my_module_assignments() to authenticated;
