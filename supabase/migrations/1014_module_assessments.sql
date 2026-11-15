-- 1014 generated warm-ups and final checks. Owner: Shivraj. Append-only after merge.
--
-- Teachers don't write pre/post tests, but learning gain needs them. Every module gets a
-- warm-up (pretest) and a final check (posttest) built from its own curriculum:
--   * AI (preferred): /api/curriculum/assessment reads the module's readings, checks and
--     worksheets and sends two parallel forms here (p_ai).
--   * Fallback (this file): built from the module's own answer-keyed knowledge checks.
-- Parallel forms: both tests cover the same concepts with the same number of questions,
-- so post minus pre compares like with like (per student, per class, per concept). Where
-- a concept has two or more questions the forms use different ones; with one question it
-- is shared (an anchor item). Answers go through the 1002 trigger into activity_keys.
--
-- Hand-written tests are never replaced: only empty tests or ones marked "generated".
-- New tests sit at position -999 / max+1000 so they stay first / last and never collide
-- with positions a course builder draft writes.

-- ---------------------------------------------------------------------------
-- 1. Builder mirror (same shape as 1010): choice labels plus the right answer's index
-- ---------------------------------------------------------------------------
create function _builder_questions(p_items jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'prompt', i ->> 'prompt', 'concept', i ->> 'concept',
      'choices', (select jsonb_agg(c ->> 'label' order by n) from jsonb_array_elements(i -> 'choices') with ordinality as t(c, n)),
      'answer', (select n - 1 from jsonb_array_elements(i -> 'choices') with ordinality as t(c, n) where c ->> 'id' = i ->> 'answer'))
    order by k), '[]'::jsonb)
  from jsonb_array_elements(p_items) with ordinality as x(i, k)
$$;

-- ---------------------------------------------------------------------------
-- 2. Write both tests into a module (create them if missing)
-- ---------------------------------------------------------------------------
create function _write_assessment(p_module uuid, p_pre jsonb, p_post jsonb, p_source text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_first uuid;
  v_last uuid;
  v_concept text;
  v_kind text;
  v_items jsonb;
  v_act activities%rowtype;
  v_wrote boolean := false;
begin
  select id into v_first from lessons where module_id = p_module order by position limit 1;
  select id into v_last from lessons where module_id = p_module order by position desc limit 1;
  if v_first is null then
    return false;
  end if;
  select coalesce(concept, 'module') into v_concept from modules where id = p_module;

  foreach v_kind in array array['pretest', 'posttest'] loop
    v_items := case v_kind when 'pretest' then p_pre else p_post end;
    select a.* into v_act from activities a join lessons l on l.id = a.lesson_id
    where l.module_id = p_module and a.type = v_kind::activity_type
    order by l.position, a.position limit 1;

    if found and jsonb_array_length(coalesce(v_act.content -> 'items', '[]'::jsonb)) > 0
       and not (v_act.content ? 'generated') then
      continue; -- hand-written test: keep it
    end if;

    if found then
      update activities set content = jsonb_build_object(
          'title', coalesce(v_act.content ->> 'title', case v_kind when 'pretest' then 'What do you already know?' else 'Show what you learned' end),
          'generated', p_source, 'items', v_items, 'questions', _builder_questions(v_items)),
        counts_toward_unlock = true
      where id = v_act.id;
    else
      insert into activities (lesson_id, position, type, concept, counts_toward_unlock, content)
      select case v_kind when 'pretest' then v_first else v_last end,
             case v_kind when 'pretest' then coalesce(min(a.position), 1) - 1000 else coalesce(max(a.position), 0) + 1000 end,
             v_kind::activity_type, v_concept, true,
             jsonb_build_object(
               'title', case v_kind when 'pretest' then 'What do you already know?' else 'Show what you learned' end,
               'generated', p_source, 'items', v_items, 'questions', _builder_questions(v_items))
      from activities a
      where a.lesson_id = case v_kind when 'pretest' then v_first else v_last end;
    end if;
    v_wrote := true;
  end loop;
  return v_wrote;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Fallback: parallel forms from the module's keyed knowledge checks
-- ---------------------------------------------------------------------------
-- Pool: check (and choice exit) cards with an answer key and 2+ choices. Inside each
-- concept, odd-numbered questions go to the warm-up and even ones to the final check; a
-- concept with one question puts it in both. Concepts are interleaved so both tests cover
-- everything before any concept repeats, up to 8 questions each. The final check shows the
-- choices in a different order.
create function _fallback_assessment(p_module uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pre jsonb;
  v_post jsonb;
begin
  with pool as (
    select a.content ->> 'prompt' as prompt,
           a.content -> 'choices' as choices,
           k.key ->> 'answer' as answer,
           coalesce(nullif(a.content ->> 'concept', ''), a.concept) as concept,
           row_number() over (order by l.position, a.position) as ord
    from activities a
    join lessons l on l.id = a.lesson_id
    join activity_keys k on k.activity_id = a.id
    where l.module_id = p_module and a.type in ('check', 'exit')
      and jsonb_typeof(a.content -> 'choices') = 'array' and jsonb_array_length(a.content -> 'choices') >= 2
      and nullif(a.content ->> 'prompt', '') is not null and k.key ? 'answer'
  ), ranked as (
    select p.*, row_number() over (partition by concept order by ord) as rn,
           count(*) over (partition by concept) as cnt,
           min(ord) over (partition by concept) as concept_ord
    from pool p
  ), pre as (
    select * from ranked where rn % 2 = 1
  ), post as (
    select * from ranked where rn % 2 = 0 or cnt = 1
  ), pre_pick as (
    select *, row_number() over (order by (rn + 1) / 2, concept_ord) as slot from pre
  ), post_pick as (
    select *, row_number() over (order by (rn + 1) / 2, concept_ord) as slot from post
  )
  select
    (select jsonb_agg(jsonb_build_object('id', 'p' || slot, 'concept', concept, 'prompt', prompt,
        'choices', choices, 'answer', answer) order by slot) from pre_pick where slot <= 8),
    (select jsonb_agg(jsonb_build_object('id', 'q' || slot, 'concept', concept, 'prompt', prompt,
        'choices', (select jsonb_agg(c order by md5(c::text || 'post')) from jsonb_array_elements(choices) c),
        'answer', answer) order by slot) from post_pick where slot <= 8)
  into v_pre, v_post;

  if v_pre is null or v_post is null then
    return null;
  end if;
  return jsonb_build_object('pretest', v_pre, 'posttest', v_post);
end
$$;

-- ---------------------------------------------------------------------------
-- 4. AI output -> items. Expects {pretest:[q...], posttest:[q...]} where
--    q = {concept, prompt, choices: [text, ...], answer: index}. Null if invalid.
-- ---------------------------------------------------------------------------
create function _ai_assessment(p_ai jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  v_form text;
  v_out jsonb := '{}'::jsonb;
  v_items jsonb;
begin
  foreach v_form in array array['pretest', 'posttest'] loop
    if jsonb_typeof(p_ai -> v_form) <> 'array' or jsonb_array_length(p_ai -> v_form) not between 3 and 10 then
      return null;
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_ai -> v_form) q
      where jsonb_typeof(q -> 'choices') <> 'array'
         or jsonb_array_length(q -> 'choices') not between 2 and 5
         or char_length(coalesce(q ->> 'prompt', '')) not between 5 and 600
         or char_length(coalesce(q ->> 'concept', '')) not between 1 and 80
         or jsonb_typeof(q -> 'answer') <> 'number'
         or (q ->> 'answer')::int not between 0 and jsonb_array_length(q -> 'choices') - 1
         or exists (select 1 from jsonb_array_elements(q -> 'choices') c
                    where jsonb_typeof(c) <> 'string' or char_length(c #>> '{}') not between 1 and 300)
    ) then
      return null;
    end if;
    select jsonb_agg(jsonb_build_object(
        'id', left(v_form, 1) || n, 'concept', lower(trim(q ->> 'concept')), 'prompt', trim(q ->> 'prompt'),
        'choices', (select jsonb_agg(jsonb_build_object('id', chr(96 + m::int), 'label', c #>> '{}') order by m)
                    from jsonb_array_elements(q -> 'choices') with ordinality as t(c, m)),
        'answer', chr(97 + (q ->> 'answer')::int)) order by n)
      into v_items
    from jsonb_array_elements(p_ai -> v_form) with ordinality as x(q, n);
    v_out := v_out || jsonb_build_object(v_form, v_items);
  end loop;
  return v_out;
end
$$;

revoke all on function _builder_questions(jsonb) from public, anon, authenticated;
revoke all on function _write_assessment(uuid, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function _fallback_assessment(uuid) from public, anon, authenticated;
revoke all on function _ai_assessment(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPC for instructors and admins (and the assessment endpoint on their behalf)
-- ---------------------------------------------------------------------------
create function generate_module_assessment(p_module_id uuid, p_ai jsonb default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_course uuid;
  v_forms jsonb;
  v_source text := 'ai';
begin
  select course_id into v_course from modules where id = p_module_id;
  if v_course is null then
    raise exception 'MODULE_NOT_FOUND';
  end if;
  if not can_edit_course(v_course) then
    raise exception 'NOT_ALLOWED';
  end if;
  v_forms := case when p_ai is null then null else _ai_assessment(p_ai) end;
  if v_forms is null then
    v_forms := _fallback_assessment(p_module_id);
    v_source := 'checks';
  end if;
  if v_forms is null then
    return jsonb_build_object('source', null, 'written', false);
  end if;
  return jsonb_build_object('source', v_source,
    'written', _write_assessment(p_module_id, v_forms -> 'pretest', v_forms -> 'posttest', v_source),
    'pretest', jsonb_array_length(v_forms -> 'pretest'), 'posttest', jsonb_array_length(v_forms -> 'posttest'));
end
$$;

revoke all on function generate_module_assessment(uuid, jsonb) from public, anon;
grant execute on function generate_module_assessment(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Backfill: every published module whose tests are empty or missing
-- ---------------------------------------------------------------------------
do $$
declare
  v_module uuid;
  v_forms jsonb;
begin
  for v_module in select id from modules where published loop
    v_forms := _fallback_assessment(v_module);
    if v_forms is not null then
      perform _write_assessment(v_module, v_forms -> 'pretest', v_forms -> 'posttest', 'checks');
    end if;
  end loop;
end
$$;

notify pgrst, 'reload schema';
