-- Server-only aggregate RPC. Existing admin-issued keys grant organization-wide read access.
-- Definer is necessary to call the private canonical progress helpers, not raw student APIs.
create function public.read_api_progress(p_key_hash text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_cohorts jsonb;
begin
  if not exists (select 1 from public.api_keys where key_hash = p_key_hash and revoked_at is null) then
    return null;
  end if;
  with memberships as (
    select e.student_id, c.course_id from public.enrollments e join public.classes c on c.id = e.class_id
    union
    select student_id, course_id from public.course_enrollments
  ), contexts as (
    select m.*, public._class_for(m.student_id, m.course_id) as class_id from memberships m
  ), progress as (
    select c.*, s.module_id, s.state, s.tested_out, s.pretest_score, s.posttest_best,
      s.pretest_score is not null and s.posttest_best is not null as paired
    from contexts c left join lateral public._course_state(c.student_id, c.course_id) s on true
  ), cohorts as (
    select p.course_id, p.class_id, c.title as course_title, cl.name as class_name,
      count(distinct p.student_id) as enrolled_students,
      count(p.module_id) as module_opportunities,
      count(*) filter (where p.state = 'completed') as completed_modules,
      count(*) filter (where p.tested_out) as tested_out_modules,
      round(100.0 * count(*) filter (where p.state = 'completed') / nullif(count(p.module_id), 0), 2) as completion_pct,
      count(*) filter (where p.paired) as assessment_pairs,
      round(100 * avg(p.pretest_score) filter (where p.paired), 2) as paired_pretest_pct,
      round(100 * avg(p.posttest_best) filter (where p.paired), 2) as paired_posttest_pct,
      round(100 * avg(p.posttest_best - p.pretest_score) filter (where p.paired), 2) as learning_gain_points
    from progress p join public.courses c on c.id = p.course_id
    left join public.classes cl on cl.id = p.class_id
    group by p.course_id, p.class_id, c.title, cl.name
  )
  select coalesce(jsonb_agg(to_jsonb(c) order by c.course_id, c.class_id), '[]'::jsonb) into v_cohorts from cohorts c;
  return jsonb_build_object('version', 1, 'generated_at', now(), 'cohorts', v_cohorts);
end
$$;
revoke all on function public.read_api_progress(text) from public, anon, authenticated;
grant execute on function public.read_api_progress(text) to service_role;
notify pgrst, 'reload schema';
