-- Calculate canonical progress for the requested class roster.
create function public.staff_class_progress(p_class_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role public.user_role;
  v_course_id uuid;
  v_modules jsonb;
begin
  select role into v_role from public.profiles where id = auth.uid() and archived_at is null;
  if v_role is null or v_role not in ('instructor', 'admin') then
    raise exception 'STAFF_ONLY' using errcode = '42501';
  end if;
  if p_class_id is null then
    raise exception 'CLASS_REQUIRED' using errcode = '22023';
  end if;

  select c.course_id into v_course_id
  from public.classes c
  where c.id = p_class_id and (v_role = 'admin' or public.can_manage_class(c.id));
  if not found then
    raise exception 'CLASS_NOT_AVAILABLE' using errcode = '42501';
  end if;

  with contexts as (
    select e.student_id, e.class_id, v_course_id as course_id
    from public.enrollments e
    where e.class_id = p_class_id
      and public._class_for(e.student_id, v_course_id) = p_class_id
  ), progress as (
    select c.student_id, c.class_id, c.course_id, s.module_id, s.module_position,
      s.state, s.tested_out, s.required_count, s.done_count, s.pretest_score, s.posttest_best
    from contexts c cross join lateral public._course_state(c.student_id, c.course_id) s
  )
  select coalesce(jsonb_agg(to_jsonb(p) - 'module_position'
    order by p.student_id, p.module_position), '[]'::jsonb)
    into v_modules from progress p;
  return jsonb_build_object('modules', v_modules);
end
$$;
revoke all on function public.staff_class_progress(uuid) from public, anon, authenticated;
grant execute on function public.staff_class_progress(uuid) to authenticated;
notify pgrst, 'reload schema';
