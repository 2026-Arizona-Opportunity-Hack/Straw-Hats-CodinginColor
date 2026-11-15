-- The staff directory is independent of the template flag used by class setup
-- and reviewer access.
alter table public.courses add column in_cic_library boolean not null default false;

create function curriculum_private.can_edit_local_course(p_course_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.current_role_is('instructor') and exists (
    select 1 from public.courses c where c.id = p_course_id and not c.is_library
    and curriculum_private.is_local_course(c.id)
    and (c.owner_id = (select auth.uid()) or curriculum_private.teaches_course(c.id))
  )
$$;
revoke all on function curriculum_private.can_edit_local_course(uuid) from public, anon, authenticated;
grant execute on function curriculum_private.can_edit_local_course(uuid) to authenticated;

create or replace function public.can_edit_course(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.current_role_is('admin') or curriculum_private.can_edit_local_course(c) or (
    public.current_role_is('instructor') and exists (
      select 1 from public.courses x where x.id = c and x.published
      and not curriculum_private.is_local_course(x.id)
    )
  )
$$;

-- Shared content editing grants neither whole-course deletion nor permission
-- to attach a global original directly to a new class.
alter policy "staff delete course" on public.courses
  using (public.current_role_is('admin') or curriculum_private.can_edit_local_course(id));

create or replace function curriculum_private.protect_class_course() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.course_id = old.course_id then return new; end if;
  perform 1 from public.courses where id = new.course_id for update;
  if auth.uid() is not null and not public.current_role_is('admin') and not exists (
    select 1 from public.courses c where c.id = new.course_id
      and ((c.is_library and c.published and c.copied_from is null)
        or curriculum_private.can_edit_local_course(c.id))) then
    raise exception 'COURSE_NOT_AVAILABLE';
  end if;
  if exists (select 1 from public.courses c where c.id = new.course_id
      and (not c.is_library or curriculum_private.is_local_course(c.id)))
    and exists (select 1 from public.classes k where k.course_id = new.course_id and k.id <> new.id) then
    raise exception 'LOCAL_CURRICULUM_ALREADY_ATTACHED: Copy this curriculum for the new class';
  end if;
  insert into public.local_curricula(course_id)
    select id from public.courses where id = new.course_id and not is_library
    on conflict do nothing;
  return new;
end $$;

create or replace function curriculum_private.protect_course_scope() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.current_role_is('admin') then return new; end if;
  if tg_op = 'INSERT' then
    if new.is_library or (new.in_cic_library and new.copied_from is not null) then
      raise exception 'COURSE_SCOPE_ADMIN_ONLY';
    end if;
  elsif new.is_library is distinct from old.is_library
     or new.owner_id is distinct from old.owner_id
     or new.copied_from is distinct from old.copied_from
     or (new.in_cic_library is distinct from old.in_cic_library
       and (not old.published or curriculum_private.is_local_course(old.id)))
     or (not curriculum_private.is_local_course(old.id) and (
       new.published is distinct from old.published or new.delivery_mode is distinct from old.delivery_mode)) then
    raise exception 'COURSE_SCOPE_ADMIN_ONLY';
  end if;
  return new;
end $$;

create or replace function curriculum_private.remember_local_copy() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.copied_from is not null or (not new.is_library and not new.in_cic_library and exists (
    select 1 from public.profiles p where p.id = new.owner_id and p.role = 'instructor')) then
    insert into public.local_curricula(course_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end $$;

create function public.add_course_to_cic_library(p_course_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  update public.courses c set in_cic_library = true
    where c.id = p_course_id and c.published and c.copied_from is null
      and public.can_edit_course(c.id)
      and not exists (select 1 from public.local_curricula lc where lc.course_id = c.id);
  if not found then
    raise exception 'Choose a global course to add to CIC Library.';
  end if;
end $$;

-- First publication creates the directory entry and its first module together.
-- The existing publisher handles content, answer keys and revision checks.
create function public.publish_new_library_curriculum(
  p_course jsonb, p_module_id uuid, p_expected_revision integer,
  p_modules jsonb, p_lessons jsonb, p_activities jsonb,
  p_removed_lessons uuid[], p_removed_activities uuid[]
) returns integer
language plpgsql security invoker set search_path = '' as $$
begin
  if p_expected_revision is not null then
    raise exception 'This course already exists. Reload to get the latest version.';
  end if;
  insert into public.courses (id, title, description, level, owner_id, published, in_cic_library)
    values ((p_course ->> 'id')::uuid, p_course ->> 'title', p_course ->> 'description',
      (p_course ->> 'level')::public.course_level, auth.uid(), true, true);
  return public.publish_curriculum(
    p_course, p_module_id, 0, p_modules, p_lessons, p_activities, p_removed_lessons, p_removed_activities
  );
end $$;

revoke all on function public.add_course_to_cic_library(uuid),
  public.publish_new_library_curriculum(jsonb, uuid, integer, jsonb, jsonb, jsonb, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.add_course_to_cic_library(uuid),
  public.publish_new_library_curriculum(jsonb, uuid, integer, jsonb, jsonb, jsonb, uuid[], uuid[]) to authenticated;

notify pgrst, 'reload schema';
