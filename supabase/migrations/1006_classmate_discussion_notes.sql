-- Discussion copies contain only opted-in text, scoped to a class at submission.
-- Optional audience overrides support an activity in a separate, self-paced course.
create table curriculum_private.discussion_audiences (
  activity_id uuid primary key references public.activities(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade
);
create table curriculum_private.discussion_notes (
  id uuid not null unique default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  answers jsonb not null,
  updated_at timestamptz not null default now(),
  hidden boolean not null default false,
  primary key (activity_id, class_id, student_id)
);
create index on curriculum_private.discussion_notes (activity_id, class_id, updated_at desc, id) where not hidden;
alter table curriculum_private.discussion_audiences enable row level security;
alter table curriculum_private.discussion_notes enable row level security;
revoke all on curriculum_private.discussion_audiences, curriculum_private.discussion_notes from public, anon, authenticated;

create function curriculum_private.discussion_class(p_activity_id uuid, p_student_id uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  return (select g.id
  from public.activities a
  join public.lessons l on l.id = a.lesson_id
  join public.modules m on m.id = l.module_id
  join public.profiles p on p.id = p_student_id and p.role = 'student' and p.archived_at is null
  left join curriculum_private.discussion_audiences cohort on cohort.activity_id = a.id
  join public.classes g on g.id = coalesce(cohort.class_id, public._class_for(p_student_id, m.course_id))
  join public.enrollments e on e.class_id = g.id and e.student_id = p_student_id
  where a.id = p_activity_id and a.type = 'worksheet' and a.content -> 'discussion_enabled' = 'true'::jsonb
    and g.archived_at is null and curriculum_private.can_read_module(m.id));
end;
$$;

create function curriculum_private.share_discussion_answer() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  cohort uuid;
  shared_text jsonb;
begin
  if auth.uid() is distinct from new.student_id
     or new.response -> 'share_discussion' is distinct from 'true'::jsonb then return new; end if;
  cohort := curriculum_private.discussion_class(new.activity_id, new.student_id);
  if cohort is null then return new; end if;
  select jsonb_object_agg(f ->> 'id', left(btrim(new.response -> 'fields' ->> (f ->> 'id')), 2000)) into shared_text
  from public.activities a cross join lateral jsonb_array_elements(
    case when jsonb_typeof(a.content -> 'fields') = 'array' then a.content -> 'fields' else '[]'::jsonb end
  ) f
  where a.id = new.activity_id and f ->> 'kind' in ('short_answer', 'long_answer')
    and jsonb_typeof(new.response -> 'fields' -> (f ->> 'id')) = 'string'
    and btrim(new.response -> 'fields' ->> (f ->> 'id')) <> '';
  if shared_text is not null then
    insert into curriculum_private.discussion_notes (activity_id, class_id, student_id, answers)
    values (new.activity_id, cohort, new.student_id, shared_text)
    on conflict (activity_id, class_id, student_id) do update
      set answers = excluded.answers, updated_at = clock_timestamp();
  end if;
  return new;
end;
$$;
revoke all on function curriculum_private.discussion_class(uuid, uuid) from public, anon, authenticated;
revoke all on function curriculum_private.share_discussion_answer() from public, anon, authenticated;
create trigger share_discussion_answer after insert on public.activity_attempts
for each row when (new.submitted_at is not null) execute function curriculum_private.share_discussion_answer();

create function public.my_discussion_notes(p_activity_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  student uuid := auth.uid();
  cohort uuid := curriculum_private.discussion_class(p_activity_id, student);
  shared boolean;
  notes jsonb := '[]'::jsonb;
begin
  shared := exists (
    select 1 from curriculum_private.discussion_notes n
    where n.activity_id = p_activity_id and n.class_id = cohort and n.student_id = student
  );
  if shared then
    select coalesce(jsonb_agg(jsonb_build_object('id', recent.id, 'answers', recent.answers)
      order by recent.updated_at desc, recent.id), '[]'::jsonb) into notes
    from (
      select n.id, n.answers, n.updated_at from curriculum_private.discussion_notes n
      join public.enrollments e on e.class_id = n.class_id and e.student_id = n.student_id
      join public.profiles p on p.id = n.student_id and p.archived_at is null and p.role = 'student'
      where n.activity_id = p_activity_id and n.class_id = cohort and n.student_id <> student and not n.hidden
      order by n.updated_at desc, n.id limit 15
    ) recent;
  end if;
  return jsonb_build_object('enabled', cohort is not null, 'shared', shared, 'notes', notes);
end;
$$;

create function public.review_discussion_notes(p_activity_id uuid, p_hide_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.current_role_is('instructor') or public.current_role_is('admin')) then
    raise exception 'STAFF_ONLY';
  end if;
  if p_hide_id is not null then
    update curriculum_private.discussion_notes n set hidden = true
    where n.id = p_hide_id and n.activity_id = p_activity_id and public.can_manage_class(n.class_id);
    if not found then raise exception 'NOTE_UNAVAILABLE'; end if;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', recent.id, 'answers', recent.answers, 'className', recent.class_name)
      order by recent.updated_at desc, recent.id)
    from (
      select n.id, n.answers, n.updated_at, g.name as class_name
      from curriculum_private.discussion_notes n join public.classes g on g.id = n.class_id
      where n.activity_id = p_activity_id and not n.hidden and public.can_manage_class(n.class_id)
      order by n.updated_at desc, n.id limit 50
    ) recent
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.my_discussion_notes(uuid) from public, anon, authenticated;
revoke all on function public.review_discussion_notes(uuid, uuid) from public, anon, authenticated;
grant execute on function public.my_discussion_notes(uuid) to authenticated;
grant execute on function public.review_discussion_notes(uuid, uuid) to authenticated;
