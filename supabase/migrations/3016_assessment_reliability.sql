-- Preserve graded forms and report readiness from the stored answer keys.
create function curriculum_private.assessment_pair_ready(p_module_id uuid)
returns boolean
language sql stable set search_path = '' as $$
  select count(*) filter (where a.type = 'pretest') > 0
     and count(*) filter (where a.type = 'posttest') > 0
     and coalesce(bool_and(
       jsonb_array_length(items.value) > 0 and not exists (
         select 1 from jsonb_array_elements(items.value) i
         where not exists (
           select 1 from jsonb_array_elements(
             case when jsonb_typeof(i -> 'choices') = 'array' then i -> 'choices' else '[]'::jsonb end
           ) c where c ->> 'id' = k.key -> 'answers' ->> (i ->> 'id')
         )
       )
     ), false)
  from public.activities a
  join public.lessons l on l.id = a.lesson_id
  left join public.activity_keys k on k.activity_id = a.id
  cross join lateral (select case when jsonb_typeof(a.content -> 'items') = 'array'
    then a.content -> 'items' else '[]'::jsonb end) items(value)
  where l.module_id = p_module_id and a.type in ('pretest', 'posttest')
$$;
revoke all on function curriculum_private.assessment_pair_ready(uuid) from public, anon, authenticated;

-- The endpoint checks access and an existing pair before spending time on generation.
create function public.module_assessment_ready(p_module_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select curriculum_private.assessment_pair_ready(m.id)
  from public.modules m where m.id = p_module_id and public.can_edit_course(m.course_id)
$$;
revoke all on function public.module_assessment_ready(uuid) from public, anon;
grant execute on function public.module_assessment_ready(uuid) to authenticated;

create or replace function public.generate_module_assessment(p_module_id uuid, p_ai jsonb default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_course uuid;
  v_forms jsonb;
  v_source text := 'ai';
  v_written boolean;
begin
  select course_id into v_course from public.modules where id = p_module_id;
  if v_course is null then raise exception 'MODULE_NOT_FOUND'; end if;
  if not public.can_edit_course(v_course) then raise exception 'NOT_ALLOWED'; end if;

  -- Serialize requests for this module and hold the assessment rows while checking attempts.
  perform 1 from public.modules where id = p_module_id for update;
  perform a.id from public.activities a join public.lessons l on l.id = a.lesson_id
    where l.module_id = p_module_id and a.type in ('pretest', 'posttest') order by a.id for update of a;

  if curriculum_private.assessment_pair_ready(p_module_id) then
    return jsonb_build_object('source', null, 'written', false, 'ready', true);
  end if;
  if exists (
    select 1 from public.activity_attempts t
    join public.activities a on a.id = t.activity_id
    join public.lessons l on l.id = a.lesson_id
    where l.module_id = p_module_id and a.type in ('pretest', 'posttest')
  ) then
    return jsonb_build_object('source', null, 'written', false, 'ready', false, 'reason', 'existing_attempts');
  end if;

  begin
    v_forms := case when p_ai is null then null else public._ai_assessment(p_ai) end;
  exception when data_exception then
    v_forms := null;
  end;
  if coalesce(jsonb_typeof(v_forms -> 'pretest'), '') <> 'array'
      or coalesce(jsonb_typeof(v_forms -> 'posttest'), '') <> 'array' then
    v_forms := public._fallback_assessment(p_module_id);
    v_source := 'checks';
  end if;
  if v_forms is null then
    return jsonb_build_object('source', null, 'written', false, 'ready', false);
  end if;
  v_written := public._write_assessment(p_module_id, v_forms -> 'pretest', v_forms -> 'posttest', v_source);
  return jsonb_build_object('source', v_source, 'written', v_written,
    'ready', curriculum_private.assessment_pair_ready(p_module_id),
    'pretest', jsonb_array_length(v_forms -> 'pretest'), 'posttest', jsonb_array_length(v_forms -> 'posttest'));
end
$$;

-- Keep reporting and student cards on the same first/best eligible attempt. Leave all
-- attempts available for submissions counts and latest-answer display.
create or replace function curriculum_private.my_module_activities(p_module_id uuid)
returns table (activity_id uuid, submitted boolean, best_score numeric, tries int, last_submitted_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with context as (
    select m.id, public._class_for(auth.uid(), m.course_id) as class_id
    from public.modules m
    where m.id = p_module_id and public._is_enrolled(auth.uid(), m.course_id)
  )
  select a.id, count(t.id) > 0,
    case when a.type = 'pretest' then (array_agg(t.score order by t.attempt_no))[1]
      else max(t.score) filter (where a.type <> 'posttest' or c.class_id is null
        or t.attempt_no <= coalesce(r.max_posttest_tries, public.program_default_max_tries()))
    end,
    count(t.id)::int, max(t.submitted_at)
  from context c join public.lessons l on l.module_id = c.id
  join public.activities a on a.lesson_id = l.id
  left join public.module_rules r on r.class_id = c.class_id and r.module_id = c.id
  left join public.activity_attempts t on t.activity_id = a.id and t.student_id = auth.uid()
    and t.class_id is not distinct from c.class_id
  group by a.id, l.position, c.class_id, r.max_posttest_tries
  order by l.position, a.position
$$;
notify pgrst, 'reload schema';
