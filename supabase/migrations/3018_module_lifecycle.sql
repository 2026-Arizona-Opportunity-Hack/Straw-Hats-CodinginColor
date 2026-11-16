alter table public.modules add column archived_at timestamptz;
create index if not exists class_modules_module_id_idx on public.class_modules (module_id);

-- Publishing an archived module restores it through the existing publication flow.
create function curriculum_private.clear_module_archive() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.archived_at := null;
  return new;
end
$$;
create trigger modules_clear_archive before insert or update on public.modules
  for each row when (new.published and new.archived_at is not null)
  execute function curriculum_private.clear_module_archive();

-- Serialize new class releases with archiving. Existing unpublished draft links
-- retain their behavior.
create function curriculum_private.check_module_release() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  archived timestamptz;
begin
  select m.archived_at into archived from public.modules m
    join public.classes c on c.course_id = m.course_id
    where m.id = new.module_id and c.id = new.class_id for share of m;
  if archived is not null then
    raise exception 'Publish the archived module before assigning it to a class.';
  end if;
  return new;
end
$$;
create trigger class_modules_check_archive before insert or update of module_id on public.class_modules
  for each row execute function curriculum_private.check_module_release();

-- The private function checks edit permission explicitly so a class release
-- still blocks the action when its row is hidden from the course editor by RLS.
create function curriculum_private.manage_curriculum_module(
  p_course_id uuid, p_module_id uuid, p_expected_revision integer, p_action text
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  revision integer;
begin
  if auth.uid() is null or not public.can_edit_course(p_course_id) then
    raise exception 'You do not have permission to change this course.' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('archive', 'delete') then
    raise exception 'Unknown module action.' using errcode = '22023';
  end if;

  -- Lock in the same order as publish_curriculum.
  select c.publication_revision into revision from public.courses c
    where c.id = p_course_id for update;
  if revision is null or revision is distinct from p_expected_revision then
    raise exception 'This course changed since you opened it. Reload to get the latest version.';
  end if;

  perform 1 from public.modules m
    where m.id = p_module_id and m.course_id = p_course_id for update;
  if not found then
    raise exception 'The selected module does not belong to this course.';
  end if;
  if exists (select 1 from public.class_modules cm where cm.module_id = p_module_id) then
    raise exception 'Unassign this module from its classes before archiving or deleting it.';
  end if;

  if p_action = 'archive' then
    update public.modules set published = false, archived_at = now() where id = p_module_id;
  else
    delete from public.modules where id = p_module_id;
    -- The publisher uses consecutive positions. Close gaps after removing a module.
    with ordered as (
      select m.id, row_number() over (order by m.position)::integer as position
      from public.modules m where m.course_id = p_course_id
    )
    update public.modules m set position = ordered.position
      from ordered where m.id = ordered.id and m.position <> ordered.position;
  end if;

  update public.courses set publication_revision = revision + 1 where id = p_course_id;
  return revision + 1;
end
$$;

create function public.manage_curriculum_module(
  p_course_id uuid, p_module_id uuid, p_expected_revision integer, p_action text
) returns integer
language sql security invoker set search_path = '' as $$
  select curriculum_private.manage_curriculum_module(p_course_id, p_module_id, p_expected_revision, p_action)
$$;

revoke all on function curriculum_private.clear_module_archive(),
  curriculum_private.check_module_release() from public, anon, authenticated;
revoke all on function curriculum_private.manage_curriculum_module(uuid, uuid, integer, text),
  public.manage_curriculum_module(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function curriculum_private.manage_curriculum_module(uuid, uuid, integer, text),
  public.manage_curriculum_module(uuid, uuid, integer, text) to authenticated;

notify pgrst, 'reload schema';
