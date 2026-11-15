-- Report the same module state that the student player uses. No frontend unlock-rule copy.
create function public.staff_progress_snapshot() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_role public.user_role; v_modules jsonb;
begin
  select role into v_role from public.profiles where id = auth.uid() and archived_at is null;
  if v_role is null or v_role not in ('instructor', 'admin') then
    raise exception 'STAFF_ONLY' using errcode = '42501';
  end if;
  with contexts as (
    select e.student_id, c.id as class_id, c.course_id
    from public.enrollments e join public.classes c on c.id = e.class_id
    where (v_role = 'admin' or public.can_manage_class(c.id))
      and public._class_for(e.student_id, c.course_id) = c.id
    union all
    select e.student_id, null::uuid, e.course_id from public.course_enrollments e
    where v_role = 'admin' and public._class_for(e.student_id, e.course_id) is null
  ), progress as (
    select c.student_id, c.class_id, c.course_id, s.module_id, s.module_position,
      s.state, s.tested_out, s.required_count, s.done_count, s.pretest_score, s.posttest_best
    from contexts c cross join lateral public._course_state(c.student_id, c.course_id) s
  )
  select coalesce(jsonb_agg(to_jsonb(p) - 'module_position'
    order by p.course_id, p.class_id, p.student_id, p.module_position), '[]'::jsonb)
    into v_modules from progress p;
  return jsonb_build_object('modules', v_modules);
end
$$;
revoke all on function public.staff_progress_snapshot() from public, anon, authenticated;
grant execute on function public.staff_progress_snapshot() to authenticated;
notify pgrst, 'reload schema';
