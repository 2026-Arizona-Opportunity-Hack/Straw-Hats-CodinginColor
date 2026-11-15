-- Preserve immediate personal-email/email-change rejection while accommodating
-- Supabase Auth admin.createUser's INSERT -> app_metadata UPDATE transaction.
-- https://github.com/supabase/auth/blob/master/internal/api/admin.go
-- The deferred check is essential: knowing a synthetic address is not authority.
create or replace function public.guard_student_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if (new.email is not distinct from old.email and
        new.email_change is not distinct from old.email_change)
      or not exists (select 1 from public.profiles where id = old.id and role = 'student') then
      return new;
    end if;
    -- Clearing a pending change does not collect a new address.
    if new.email is not distinct from old.email and nullif(new.email_change, '') is null then
      return new;
    end if;
  else
    if tg_when = 'AFTER' then
      -- Auth admin.createUser inserts first and updates app_metadata later in the
      -- same transaction. Validate the final row, never the stale event image.
      select * into new from auth.users where id = new.id;
      if not found then return null; end if;
    elsif nullif(new.email_change, '') is null and exists (
      select 1 from public.class_students r
      where new.email = r.id::text || '@students.cic.invalid'
    ) then
      -- Only a reserved, non-deliverable roster address may await its marker.
      -- Personal email signup must still fail before Auth can send confirmation.
      return new;
    end if;
    -- Trusted SQL administration includes local seed/backfill operations.
    -- App staff creation is restricted to admins by admin_create_user above.
    if session_user = 'postgres' or public.current_role_is('admin') then return new; end if;
    -- Supabase owns app_metadata; client user_metadata is never trusted.
    -- Google users become reviewers in 1013's handle_new_auth_user trigger.
    if new.raw_app_meta_data->>'provider' = 'google' then return new; end if;
    if new.raw_app_meta_data->>'cic_username' ~ '^[a-z][a-z0-9]{1,39}$'
      and new.email = (new.raw_app_meta_data->>'cic_username') || '@students.cic-learn.invalid'
      and nullif(new.email_change, '') is null then return new; end if;
    if exists (
      select 1 from public.class_students r
      where r.id::text = new.raw_app_meta_data->>'cic_roster_id'
        and new.email = r.id::text || '@students.cic.invalid'
        and nullif(new.email_change, '') is null
    ) then return new; end if;
  end if;
  raise exception 'STUDENT_ROSTER_REQUIRED';
end $$;
revoke all on function public.guard_student_email() from public, anon, authenticated, service_role;
-- Keep 3006's BEFORE INSERT/UPDATE trigger; this adds the final INSERT check.
create constraint trigger guard_student_creation
  after insert on auth.users deferrable initially deferred
  for each row execute function public.guard_student_email();
