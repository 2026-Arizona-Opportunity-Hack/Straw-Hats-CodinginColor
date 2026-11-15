-- Local copies keep their own IDs/content tree: copied_from is lineage, never sync.
-- The application has class membership, not normalized school membership. Do not
-- derive authorization from editable school names. Existing library-linked classes
-- remain on the shared template; this migration does not rewrite student progress.
create index if not exists classes_course_id_idx on public.classes (course_id);

-- Persist scope separately so deleting a class or source template cannot silently
-- turn a former local curriculum into a globally visible standalone course.
create table public.local_curricula (
  course_id uuid primary key references public.courses(id) on delete cascade,
  created_at timestamptz not null default now()
);
insert into public.local_curricula(course_id)
select c.id from public.courses c where c.copied_from is not null
  or (not c.is_library and exists (select 1 from public.classes k where k.course_id=c.id));
alter table public.local_curricula enable row level security;
revoke all on public.local_curricula from anon, authenticated;
grant select on public.local_curricula to authenticated;

create function curriculum_private.is_local_course(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.courses c where c.id = p_course
    and (c.copied_from is not null or exists (select 1 from public.local_curricula lc where lc.course_id=c.id)))
$$;

create function curriculum_private.teaches_course(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.classes k where k.course_id = p_course
    and (k.created_by = (select auth.uid()) or exists (
      select 1 from public.class_instructors ci where ci.class_id = k.id
        and ci.instructor_id = (select auth.uid()))))
$$;

create function curriculum_private.can_read_course(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.courses c
    join public.profiles p on p.id = (select auth.uid())
    where c.id = p_course and (
      p.role = 'admin' or (p.role = 'instructor' and c.owner_id = p.id)
      or (p.role = 'instructor' and curriculum_private.teaches_course(c.id))
      or (p.role = 'student' and public._class_for(p.id, c.id) is not null)
      or (c.published and not curriculum_private.is_local_course(c.id))))
$$;
revoke all on function curriculum_private.is_local_course(uuid),
  curriculum_private.teaches_course(uuid), curriculum_private.can_read_course(uuid) from public, anon, authenticated;
grant execute on function curriculum_private.can_read_course(uuid) to authenticated;

create policy "read local curriculum scope" on public.local_curricula for select to authenticated
  using ((select curriculum_private.can_read_course(course_id)));

create function curriculum_private.remember_local_copy() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.copied_from is not null or (not new.is_library and exists (
    select 1 from public.profiles p where p.id=new.owner_id and p.role='instructor')) then
    insert into public.local_curricula(course_id) values(new.id) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger courses_remember_copy after insert or update of copied_from on public.courses
  for each row execute function curriculum_private.remember_local_copy();
revoke all on function curriculum_private.remember_local_copy() from public, anon, authenticated;

drop policy "read published courses" on public.courses;
create policy "read scoped courses" on public.courses for select to authenticated
  using ((select curriculum_private.can_read_course(id)));

-- Co-teachers can edit their local curriculum. Only admins edit global templates.
create or replace function public.can_edit_course(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.current_role_is('admin') or (
    public.current_role_is('instructor') and exists (
      select 1 from public.courses x where x.id = c and not x.is_library
      and curriculum_private.is_local_course(x.id)
      and (x.owner_id = (select auth.uid()) or curriculum_private.teaches_course(x.id))))
$$;
create or replace function public.can_edit_activity(a uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.activities ac
    join public.lessons l on l.id = ac.lesson_id
    join public.modules m on m.id = l.module_id
    where ac.id = a and public.can_edit_course(m.course_id))
$$;
drop policy "owner writes course" on public.courses;
create policy "staff create course" on public.courses for insert to authenticated
  with check (public.current_role_is('admin') or
    (public.current_role_is('instructor') and owner_id = (select auth.uid()) and not is_library));
create policy "staff update course" on public.courses for update to authenticated
  using (public.can_edit_course(id)) with check (public.can_edit_course(id));
create policy "staff delete course" on public.courses for delete to authenticated
  using (public.can_edit_course(id));

-- UPDATE's policy cannot enforce immutable scope against the OLD row alone.
create function curriculum_private.protect_course_scope() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.current_role_is('admin') then
    if new.is_library or (tg_op = 'UPDATE' and
      (new.owner_id is distinct from old.owner_id or new.copied_from is distinct from old.copied_from)) then
      raise exception 'COURSE_SCOPE_ADMIN_ONLY';
    end if;
  end if;
  return new;
end $$;
create trigger courses_protect_scope before insert or update on public.courses
  for each row execute function curriculum_private.protect_course_scope();

-- Knowing a private course UUID must not let an unrelated teacher attach it to
-- a new class and thereby gain membership. Shared library attachment is retained.
create function curriculum_private.protect_class_course() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.course_id = old.course_id then return new; end if;
  -- Serialize competing attachments to the same course before checking membership.
  perform 1 from public.courses where id = new.course_id for update;
  if auth.uid() is not null and not public.current_role_is('admin') and not exists (
    select 1 from public.courses c where c.id = new.course_id
      and ((c.is_library and c.published and c.copied_from is null)
        or public.can_edit_course(c.id))) then
    raise exception 'COURSE_NOT_AVAILABLE';
  end if;
  if exists (select 1 from public.courses c where c.id = new.course_id
      and (not c.is_library or curriculum_private.is_local_course(c.id)))
    and exists (select 1 from public.classes k where k.course_id = new.course_id and k.id <> new.id) then
    raise exception 'LOCAL_CURRICULUM_ALREADY_ATTACHED: Copy this curriculum for the new class';
  end if;
  insert into public.local_curricula(course_id)
    select id from public.courses where id=new.course_id and not is_library
    on conflict do nothing;
  return new;
end $$;
create trigger classes_protect_course before insert or update of course_id on public.classes
  for each row execute function curriculum_private.protect_class_course();
revoke all on function curriculum_private.protect_course_scope(),
  curriculum_private.protect_class_course() from public, anon, authenticated;

create or replace function curriculum_private.can_read_module(p_module_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.modules m
    join public.courses c on c.id = m.course_id
    join public.profiles p on p.id = (select auth.uid())
    where m.id = p_module_id and curriculum_private.can_read_course(c.id)
    and case p.role
      when 'admin' then true
      when 'instructor' then public.can_edit_course(c.id) or (c.published and m.published)
      when 'reviewer' then c.published and m.published
      when 'student' then m.published and exists (
        select 1 from public._course_state(p.id, c.id) s
        where s.module_id = m.id and s.state in ('available', 'completed'))
    end)
$$;
-- Answer keys must not leak through direct table queries outside a content join.
drop policy "staff and reviewers read keys" on public.activity_keys;
create policy "staff read accessible keys" on public.activity_keys for select to authenticated
  using ((public.current_role_is('instructor') or public.current_role_is('admin') or public.current_role_is('reviewer'))
    and exists (select 1 from public.activities a where a.id = activity_id));

-- Definer RPCs bypass RLS. Close the self-enrollment path as well as table reads,
-- including old self-enrollments into private copies created before this fix.
create or replace function public._is_enrolled(p_student uuid, p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public._class_for(p_student, p_course) is not null or (
    not curriculum_private.is_local_course(p_course) and exists (
      select 1 from public.course_enrollments where student_id = p_student and course_id = p_course))
$$;
create or replace function public.enroll_in_course(p_course_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.current_role_is('student') then raise exception 'STUDENTS_ONLY'; end if;
  if not exists (select 1 from public.courses where id = p_course_id
    and published and delivery_mode = 'self_paced'
    and not curriculum_private.is_local_course(id)) then
    raise exception 'COURSE_NOT_AVAILABLE';
  end if;
  if public._class_has_family(auth.uid(), p_course_id) then raise exception 'ALREADY_IN_CLASS'; end if;
  insert into public.course_enrollments (student_id, course_id) values (auth.uid(), p_course_id)
  on conflict do nothing;
end $$;
create or replace function public.my_courses()
returns table (course_id uuid, title text, description text, level public.course_level,
  delivery_mode public.delivery_mode, source text, class_id uuid, class_name text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.title, c.description, c.level, c.delivery_mode, 'class', cl.id, cl.name
  from public.enrollments e join public.classes cl on cl.id = e.class_id
  join public.courses c on c.id = cl.course_id where e.student_id = auth.uid()
  union all
  select c.id, c.title, c.description, c.level, c.delivery_mode, 'self', null, null
  from public.course_enrollments ce join public.courses c on c.id = ce.course_id
  where ce.student_id = auth.uid() and c.published and not curriculum_private.is_local_course(c.id)
$$;

-- Explore lists published global curricula before enrollment. Its module preview
-- and the starter quiz also bypass table policies, so each honors durable scope.
create function public.catalog_courses()
returns table (id uuid, title text, description text, level public.course_level, delivery_mode public.delivery_mode)
language sql stable security definer set search_path = '' as $$
  select c.id, c.title, c.description, c.level, c.delivery_mode
  from public.courses c
  where c.published and not curriculum_private.is_local_course(c.id)
  order by c.title, c.id
$$;
revoke all on function public.catalog_courses() from public, anon, authenticated;
grant execute on function public.catalog_courses() to authenticated;

create or replace function public.catalog_modules()
returns table (course_id uuid, module_position int, module_title text, module_concept text)
language sql stable security definer set search_path = '' as $$
  select m.course_id, m.position, m.title, m.concept
  from public.modules m join public.courses c on c.id = m.course_id
  where c.published and m.published and not curriculum_private.is_local_course(c.id)
  order by m.course_id, m.position
$$;

create or replace function public._level_index(p_level public.course_level) returns int
language sql immutable as $$
  select array_position(array['beginner', 'intermediate', 'advanced', 'expert']::public.course_level[], p_level)
$$;

create or replace function public._course_for(p_subject text, p_level public.course_level) returns public.courses
language sql stable security definer set search_path = '' as $$
  select c.* from public.courses c
  where c.published and c.delivery_mode = 'self_paced'
    and not curriculum_private.is_local_course(c.id)
    and public.course_subject(c.title) = p_subject
  order by abs(public._level_index(c.level) - public._level_index(p_level)), public._level_index(c.level), c.title
  limit 1
$$;

-- This definer RPC previously returned activity IDs for any guessed module UUID.
create or replace function public.my_module_activities(p_module_id uuid)
returns table (activity_id uuid, submitted boolean, best_score numeric, tries int, last_submitted_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.id, count(t.id)>0, max(t.score), count(t.id)::int, max(t.submitted_at)
  from public.activities a join public.lessons l on l.id=a.lesson_id
  join public.modules m on m.id=l.module_id
  left join public.activity_attempts t on t.activity_id=a.id and t.student_id=auth.uid()
    and t.class_id is not distinct from public._class_for(auth.uid(),m.course_id)
  where l.module_id=p_module_id and public._is_enrolled(auth.uid(),m.course_id)
  group by a.id,l.position,a.position order by l.position,a.position
$$;

notify pgrst, 'reload schema';
