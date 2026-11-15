-- Use the same enrollment and unlock rules for reading as for submitting work.
-- The helper needs to evaluate access without recursively invoking the policies
-- below. Its schema is outside the exposed Data API schemas.
create schema if not exists curriculum_private;
revoke all on schema curriculum_private from public, anon, authenticated;
grant usage on schema curriculum_private to authenticated;

create function curriculum_private.can_read_module(p_module_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.modules m
    join public.courses c on c.id = m.course_id
    join public.profiles p on p.id = (select auth.uid())
    where m.id = p_module_id
      and case p.role
        when 'admin' then true
        when 'instructor' then c.owner_id = p.id or (c.published and m.published)
        when 'reviewer' then c.published and m.published
        when 'student' then m.published
          and (c.published or public._class_for(p.id, c.id) is not null)
          and exists (
            select 1 from public._course_state(p.id, c.id) s
            where s.module_id = m.id and s.state in ('available', 'completed')
          )
      end
  )
$$;
revoke all on function curriculum_private.can_read_module(uuid) from public, anon, authenticated;
grant execute on function curriculum_private.can_read_module(uuid) to authenticated;

drop policy "read modules" on public.modules;
drop policy "read lessons" on public.lessons;
drop policy "read activities" on public.activities;

create policy "read available modules" on public.modules for select to authenticated
  using ((select curriculum_private.can_read_module(id)));
create policy "read lessons of available modules" on public.lessons for select to authenticated
  using (exists (select 1 from public.modules m where m.id = module_id));
create policy "read activities of available lessons" on public.activities for select to authenticated
  using (exists (select 1 from public.lessons l where l.id = lesson_id));

-- One ordered module document. The invoker's policies apply at every level.
-- The separate activity_keys table is never part of the student response.
create function public.my_module_content(p_module_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select to_jsonb(m) || jsonb_build_object('lessons', coalesce((
    select jsonb_agg(to_jsonb(l) || jsonb_build_object('activities', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.position)
      from public.activities a where a.lesson_id = l.id
    ), '[]'::jsonb)) order by l.position)
    from public.lessons l where l.module_id = m.id
  ), '[]'::jsonb))
  from public.modules m
  where m.id = p_module_id and (select public.current_role_is('student'))
$$;
revoke all on function public.my_module_content(uuid) from public, anon, authenticated;
grant execute on function public.my_module_content(uuid) to authenticated;
