-- Suggest one-to-one name matches within a class. Names are evidence for a staff
-- decision, never a credential or a way to claim another roster row.
create function public.list_roster_name_matches(p_class_id uuid)
returns table (imported_id uuid, imported_name text, account_id uuid, account_name text, username text)
language sql stable security definer set search_path = '' as $$
  with roster as (
    select r.id, r.profile_id, coalesce(p.display_name, r.display_name) as name, p.username,
           r.passcode is not null as active_entry,
           e.student_id is not null and p.role = 'student' and p.archived_at is null as active_student
    from public.class_students r
    join public.classes c on c.id = r.class_id and c.archived_at is null
    left join public.profiles p on p.id = r.profile_id
    left join public.enrollments e on e.class_id = r.class_id and e.student_id = r.profile_id
    where r.class_id = p_class_id and (select public.can_manage_class(p_class_id))
  ), names as (
    select *, lower(btrim(regexp_replace(normalize(name), '[[:space:]]+', ' ', 'g'))) as name_key
    from roster
  ), counted as (
    select *, count(*) over (partition by name_key, (profile_id is null)) as entries
    from names
  )
  select imported.id, imported.name, account.id, account.name, account.username
  from counted imported
  join counted account using (name_key)
  where imported.profile_id is null and imported.active_entry and imported.entries = 1
    and account.profile_id is not null and account.active_student and account.entries = 1
    and imported.name_key <> ''
    and not exists (select 1 from public.assignment_submissions where class_student_id = imported.id)
    -- An issued card may already have an Auth identity even if linking was interrupted.
    and not exists (
      select 1 from auth.users u
      where u.email = imported.id::text || '@students.cic.invalid'
        and u.raw_app_meta_data ->> 'cic_roster_id' = imported.id::text
    )
  order by imported.name, imported.id
$$;

-- Keep the linked row and profile intact. Assignment submissions use the linked
-- roster ID and module attempts use the profile ID. Both survive confirmation.
create function public.confirm_roster_name_match(p_class_id uuid, p_imported_id uuid, p_account_id uuid)
returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not public.can_manage_class(p_class_id) then
    raise exception 'ROSTER_MATCH_NOT_ALLOWED' using errcode = '42501';
  end if;

  -- Lock before checking. A card bind or assignment submission can otherwise win
  -- the race between validating the imported row and removing it.
  perform r.id from public.class_students r
    where r.class_id = p_class_id and r.id in (p_imported_id, p_account_id)
    order by r.id for update;
  if not exists (
    select 1 from public.list_roster_name_matches(p_class_id) m
    where m.imported_id = p_imported_id and m.account_id = p_account_id
  ) then
    raise exception 'ROSTER_MATCH_CHANGED';
  end if;

  delete from public.class_students r
  where r.id = p_imported_id and r.class_id = p_class_id and r.profile_id is null;
  if not found then raise exception 'ROSTER_MATCH_CHANGED'; end if;
end
$$;

revoke all on function public.list_roster_name_matches(uuid) from public, anon, authenticated;
revoke all on function public.confirm_roster_name_match(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.list_roster_name_matches(uuid) to authenticated;
grant execute on function public.confirm_roster_name_match(uuid, uuid, uuid) to authenticated;
notify pgrst, 'reload schema';
