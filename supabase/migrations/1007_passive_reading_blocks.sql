-- Reading is part of the lesson and requires no submission for module progress.
update public.activities
set counts_toward_unlock = false
where type = 'content' and counts_toward_unlock;

create function curriculum_private.exclude_reading_from_unlocks()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.counts_toward_unlock := false;
  return new;
end;
$$;

revoke all on function curriculum_private.exclude_reading_from_unlocks() from public, anon, authenticated;

create trigger exclude_reading_from_unlocks
before insert or update of type, counts_toward_unlock on public.activities
for each row when (new.type = 'content' and new.counts_toward_unlock)
execute function curriculum_private.exclude_reading_from_unlocks();
