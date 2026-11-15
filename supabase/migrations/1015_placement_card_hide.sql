-- 1015 "Don't show again" for the starter-quiz card on the student home page.
-- Owner: Shivraj. Append-only after merge.
-- Hiding marks the student's results; retaking the quiz adds a new row, so the card for the
-- new recommendation shows again.

alter table placement_results add column card_hidden boolean not null default false;

create or replace function my_placement() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('skipped', r.skipped, 'result', r.result, 'taken_at', r.created_at,
    'card_hidden', r.card_hidden)
  from placement_results r
  where r.student_id = auth.uid()
  order by r.created_at desc
  limit 1
$$;

create function hide_placement_card() returns void
language sql security definer set search_path = public as $$
  update placement_results set card_hidden = true where student_id = auth.uid()
$$;

revoke all on function hide_placement_card() from public, anon;
grant execute on function hide_placement_card() to authenticated;

notify pgrst, 'reload schema';
