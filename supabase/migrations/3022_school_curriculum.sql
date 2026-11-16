-- A school owns its templates. Class copies keep independent IDs and student progress.
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100)
);
create unique index schools_name_idx on public.schools (lower(btrim(name)));

create table public.school_instructors (
  school_id uuid not null references public.schools(id),
  instructor_id uuid not null references public.profiles(id) on delete cascade,
  primary key (school_id, instructor_id)
);
create index school_instructors_instructor_idx on public.school_instructors (instructor_id);

create table public.school_curricula (
  school_id uuid not null references public.schools(id),
  global_course_id uuid not null references public.courses(id),
  course_id uuid not null unique references public.courses(id),
  primary key (school_id, global_course_id),
  check (course_id <> global_course_id)
);
create index school_curricula_global_idx on public.school_curricula (global_course_id);

alter table public.classes add column school_id uuid references public.schools(id);
create index classes_school_id_idx on public.classes (school_id);

alter table public.schools enable row level security;
alter table public.school_instructors enable row level security;
alter table public.school_curricula enable row level security;
revoke all on public.schools, public.school_instructors, public.school_curricula from public, anon, authenticated;
grant select, insert on public.schools to authenticated;
grant select, insert, delete on public.school_instructors to authenticated;
grant select on public.school_curricula to authenticated;

create function curriculum_private.can_use_school(p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select public.current_role_is('admin')) or (
    (select public.current_role_is('instructor')) and exists (
      select 1 from public.school_instructors si
      where si.school_id = p_school and si.instructor_id = (select auth.uid())
    )
  )
$$;
revoke all on function curriculum_private.can_use_school(uuid) from public, anon, authenticated;
grant execute on function curriculum_private.can_use_school(uuid) to authenticated;

create policy "staff read their schools" on public.schools for select to authenticated
  using ((select curriculum_private.can_use_school(id)));
create policy "admins create schools" on public.schools for insert to authenticated
  with check ((select public.current_role_is('admin')));
create policy "admins manage school instructors" on public.school_instructors for all to authenticated
  using ((select public.current_role_is('admin')))
  with check ((select public.current_role_is('admin')) and exists (
    select 1 from public.profiles p where p.id = instructor_id and p.role = 'instructor' and p.archived_at is null
  ));
create policy "school staff read template links" on public.school_curricula for select to authenticated
  using ((select curriculum_private.can_use_school(school_id)));

create or replace function curriculum_private.can_read_course(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.courses c
    join public.profiles p on p.id = (select auth.uid())
    left join public.school_curricula sc on sc.course_id = c.id
    where c.id = p_course and p.archived_at is null and case
      when sc.course_id is not null then curriculum_private.can_use_school(sc.school_id)
      else p.role = 'admin'
        or (p.role = 'instructor' and c.owner_id = p.id)
        or (p.role = 'instructor' and curriculum_private.teaches_course(c.id))
        or (p.role = 'student' and public._class_for(p.id, c.id) is not null)
        or (c.published and not curriculum_private.is_local_course(c.id))
    end
  )
$$;

create or replace function public.can_edit_course(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.current_role_is('admin') or curriculum_private.can_edit_local_course(c) or (
    public.current_role_is('instructor') and (
      exists (select 1 from public.courses x where x.id = c and x.published
        and not curriculum_private.is_local_course(x.id))
      or exists (select 1 from public.school_curricula sc
        where sc.course_id = c and curriculum_private.can_use_school(sc.school_id))
    )
  )
$$;

create function curriculum_private.protect_class_school() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.school_curricula sc where sc.course_id = new.course_id) then
    raise exception 'Assign a copy of the school template to the class.';
  end if;
  if tg_op = 'UPDATE' and new.school_id is distinct from old.school_id
     and not public.current_role_is('admin') then
    raise exception 'Only admins can change the school of an existing class.';
  end if;
  if new.school_id is not null then
    if tg_op = 'INSERT' and not curriculum_private.can_use_school(new.school_id) then
      raise exception 'You do not have access to this school.';
    end if;
    select name into strict new.school from public.schools where id = new.school_id;
  end if;
  return new;
end
$$;
revoke all on function curriculum_private.protect_class_school() from public, anon, authenticated;
create trigger classes_protect_school before insert or update of school_id, school, course_id on public.classes
  for each row execute function curriculum_private.protect_class_school();

-- Only the checked school RPCs call this clone helper. New classroom trees
-- get fresh IDs, including for lessons, activities and their answer keys.
create function curriculum_private.clone_published_course(p_source uuid, p_global uuid, p_owner uuid)
returns uuid language plpgsql set search_path = '' as $$
declare
  v_course uuid := gen_random_uuid();
  v_module uuid;
  v_lesson uuid;
  v_activity uuid;
  m public.modules%rowtype;
  l public.lessons%rowtype;
  a public.activities%rowtype;
begin
  insert into public.courses (id, title, description, level, delivery_mode, copied_from, owner_id, published)
  select v_course, title, description, level, delivery_mode, p_global, p_owner, true
  from public.courses where id = p_source;

  for m in select * from public.modules where course_id = p_source and published order by position loop
    insert into public.modules (course_id, position, title, concept, published)
    values (v_course, m.position, m.title, m.concept, true) returning id into v_module;
    for l in select * from public.lessons where module_id = m.id order by position loop
      insert into public.lessons (module_id, position, title, is_checkpoint)
      values (v_module, l.position, l.title, l.is_checkpoint) returning id into v_lesson;
      for a in select * from public.activities where lesson_id = l.id order by position loop
        insert into public.activities (lesson_id, position, type, concept, points, counts_toward_unlock, content)
        values (v_lesson, a.position, a.type, a.concept, a.points, a.counts_toward_unlock, a.content)
        returning id into v_activity;
        insert into public.activity_keys (activity_id, key)
        select v_activity, k.key from public.activity_keys k where k.activity_id = a.id
        on conflict (activity_id) do update set key = activity_keys.key || excluded.key, updated_at = now();
      end loop;
    end loop;
  end loop;
  return v_course;
end
$$;
revoke all on function curriculum_private.clone_published_course(uuid, uuid, uuid) from public, anon, authenticated;

-- The admin selects the legacy class explicitly. Editable school labels are
-- never used to grant membership or to move classes into a school.
create function public.seed_school_curriculum(p_school_id uuid, p_class_id uuid, p_global_course_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_class public.classes%rowtype;
  v_template uuid;
begin
  if not public.current_role_is('admin') then raise exception 'Only admins can set up school templates.'; end if;
  perform 1 from public.schools where id = p_school_id for update;
  if not found then raise exception 'Choose an existing school.'; end if;
  select * into v_class from public.classes where id = p_class_id for update;
  if not found or (v_class.school_id is not null and v_class.school_id <> p_school_id) then
    raise exception 'Choose a class for this school.';
  end if;
  if not exists (select 1 from public.courses where id = p_global_course_id and is_library and published and copied_from is null) then
    raise exception 'Choose a published global template.';
  end if;
  if exists (select 1 from public.school_curricula where school_id = p_school_id and global_course_id = p_global_course_id) then
    raise exception 'This school already has a template for that course. Edit it in Curriculum.';
  end if;
  perform 1 from public.courses where id = v_class.course_id for share;
  if not exists (select 1 from public.modules where course_id = v_class.course_id and published) then
    raise exception 'The source class needs a published module.';
  end if;
  v_template := curriculum_private.clone_published_course(v_class.course_id, p_global_course_id, null);
  insert into public.school_curricula (school_id, global_course_id, course_id)
  values (p_school_id, p_global_course_id, v_template);
  update public.classes set school_id = p_school_id where id = p_class_id;
  return v_template;
end
$$;

create function public.create_school_class(
  p_class_id uuid, p_school_id uuid, p_name text, p_join_code text,
  p_source_course_id uuid, p_source_revision int, p_module_ids uuid[], p_instructor_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_source public.courses%rowtype;
  v_existing public.classes%rowtype;
  v_global uuid;
  v_copy uuid;
  v_modules uuid[];
  v_join_code text;
begin
  if not curriculum_private.can_use_school(p_school_id) then raise exception 'You do not have access to this school.'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 100
     or coalesce(cardinality(p_module_ids), 0) = 0 then
    raise exception 'Enter a class name and choose at least one module.';
  end if;
  if p_instructor_id is not null and (not public.current_role_is('admin') or not exists (
    select 1 from public.profiles p where p.id = p_instructor_id and p.role = 'instructor' and p.archived_at is null
  )) then
    raise exception 'Only admins can assign an active instructor.';
  end if;
  v_join_code := upper(nullif(btrim(p_join_code), ''));
  if v_join_code is not null and v_join_code !~ '^[A-Z0-9-]{3,20}$' then
    raise exception 'Join code: 3–20 letters, numbers or dashes.';
  end if;
  -- Keep an identical retry safe even if the client lost a successful response.
  perform pg_advisory_xact_lock(hashtextextended(p_class_id::text, 3717));
  select * into v_existing from public.classes where id = p_class_id;
  if found then
    if v_existing.created_by is distinct from auth.uid() or v_existing.school_id is distinct from p_school_id
       or v_existing.name <> btrim(p_name) or (v_join_code is not null and v_existing.join_code <> v_join_code) then
      raise exception 'Class already exists.';
    end if;
    select array_agg(cm.module_id order by m.position) into v_modules
    from public.class_modules cm join public.modules m on m.id = cm.module_id
    where cm.class_id = p_class_id;
    return jsonb_build_object('course_id', v_existing.course_id, 'module_ids', v_modules, 'join_code', v_existing.join_code);
  end if;
  select * into v_source from public.courses where id = p_source_course_id for share;
  if v_source.is_library and v_source.copied_from is null then
    v_global := v_source.id;
  else
    select sc.global_course_id into v_global from public.school_curricula sc
    where sc.school_id = p_school_id and sc.course_id = p_source_course_id;
  end if;
  if v_global is null or not v_source.published then raise exception 'This template is unavailable for this school.'; end if;
  if v_source.publication_revision is distinct from p_source_revision then
    raise exception 'The template was updated. Reload the page and choose modules from the latest version.';
  end if;
  if (select count(*) from public.modules where course_id = p_source_course_id and published and id = any(p_module_ids))
       <> cardinality(p_module_ids) then raise exception 'Choose published modules from this template.'; end if;
  v_copy := curriculum_private.clone_published_course(p_source_course_id, v_global, auth.uid());
  v_join_code := coalesce(v_join_code, upper(substr(gen_random_uuid()::text, 1, 8)));
  insert into public.classes (id, name, school, school_id, course_id, join_code, created_by)
  values (p_class_id, btrim(p_name), '', p_school_id, v_copy, v_join_code, auth.uid());
  if p_instructor_id is not null then
    insert into public.class_instructors (class_id, instructor_id) values (p_class_id, p_instructor_id);
  end if;
  insert into public.class_modules (class_id, module_id)
  select p_class_id, target.id from public.modules source
    join public.modules target on target.course_id = v_copy and target.position = source.position
    where source.course_id = p_source_course_id and source.id = any(p_module_ids);
  select array_agg(cm.module_id order by m.position) into v_modules
    from public.class_modules cm join public.modules m on m.id = cm.module_id where cm.class_id = p_class_id;
  return jsonb_build_object('course_id', v_copy, 'module_ids', v_modules, 'join_code', v_join_code);
end
$$;

revoke all on function public.seed_school_curriculum(uuid, uuid, uuid),
  public.create_school_class(uuid, uuid, text, text, uuid, int, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.seed_school_curriculum(uuid, uuid, uuid),
  public.create_school_class(uuid, uuid, text, text, uuid, int, uuid[], uuid) to authenticated;

-- Store published curriculum only. A restore followed by a new archive records
-- another immutable entry. Student responses and answer keys aren't part of it.
create table public.class_curriculum_snapshots (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references public.classes(id) on delete set null,
  school_id uuid references public.schools(id),
  school_name text not null,
  class_name text not null,
  class_created_at timestamptz not null,
  archived_at timestamptz not null,
  course_title text not null,
  module_count int not null,
  curriculum jsonb not null,
  unique (class_id, archived_at)
);
create index class_curriculum_snapshots_school_idx on public.class_curriculum_snapshots (school_id, archived_at desc);
alter table public.class_curriculum_snapshots enable row level security;
revoke all on public.class_curriculum_snapshots from public, anon, authenticated;
grant select on public.class_curriculum_snapshots to authenticated;
create policy "staff read their class or school snapshots" on public.class_curriculum_snapshots
  for select to authenticated using ((select public.can_manage_class(class_id))
    or (school_id is not null and (select curriculum_private.can_use_school(school_id))));

create function curriculum_private.snapshot_archived_class() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_snapshot jsonb;
begin
  perform 1 from public.courses where id = new.course_id for share;
  select to_jsonb(c) - 'owner_id' || jsonb_build_object('modules', coalesce((
    select jsonb_agg(to_jsonb(m) || jsonb_build_object('lessons', coalesce((
      select jsonb_agg(to_jsonb(l) || jsonb_build_object('activities', coalesce((
        select jsonb_agg(to_jsonb(a) order by a.position)
        from public.activities a where a.lesson_id = l.id
      ), '[]'::jsonb)) order by l.position)
      from public.lessons l where l.module_id = m.id
    ), '[]'::jsonb)) order by m.position)
    from public.modules m where m.course_id = c.id and m.published
      and (not exists (select 1 from public.class_modules where class_id = new.id)
        or exists (select 1 from public.class_modules cm where cm.class_id = new.id and cm.module_id = m.id))
  ), '[]'::jsonb)) into v_snapshot
  from public.courses c where c.id = new.course_id;
  insert into public.class_curriculum_snapshots
    (class_id, school_id, school_name, class_name, class_created_at, archived_at, course_title, module_count, curriculum)
  values (new.id, new.school_id, new.school, new.name, new.created_at, new.archived_at,
    v_snapshot ->> 'title', jsonb_array_length(v_snapshot -> 'modules'), v_snapshot)
  on conflict (class_id, archived_at) do nothing;
  return new;
end
$$;
revoke all on function curriculum_private.snapshot_archived_class() from public, anon, authenticated;
create trigger classes_snapshot_curriculum after update of archived_at on public.classes
  for each row when (old.archived_at is null and new.archived_at is not null)
  execute function curriculum_private.snapshot_archived_class();

notify pgrst, 'reload schema';
