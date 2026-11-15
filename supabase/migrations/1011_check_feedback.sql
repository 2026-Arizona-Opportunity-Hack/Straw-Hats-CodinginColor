-- Owner: Shivraj. After a student answers a knowledge check, show which choice was right.
-- Only for check and exit cards the student has already answered. Warm-up and final check
-- keys stay hidden. The check's explanation text is already in its content.

create function my_check_answer(p_activity_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select k.key ->> 'answer'
  from activity_keys k
  join activities a on a.id = k.activity_id
  where k.activity_id = p_activity_id
    and a.type in ('check', 'exit')
    and exists (
      select 1 from activity_attempts t
      where t.activity_id = p_activity_id and t.student_id = auth.uid())
$$;

revoke all on function my_check_answer(uuid) from public, anon;
grant execute on function my_check_answer(uuid) to authenticated;

notify pgrst, 'reload schema';
