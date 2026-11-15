-- Class assignments/creator IDs survive role changes. They must not preserve
-- access to student records or login-card passcodes after demotion/archiving.
create or replace function public.teaches_class(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.class_instructors ci
    join public.profiles p on p.id = ci.instructor_id
    where ci.class_id = c and p.id = (select auth.uid())
      and p.role in ('instructor', 'admin') and p.archived_at is null
  )
$$;

create or replace function public.can_manage_class(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.archived_at is null
      and p.role in ('instructor', 'admin')
      and (p.role = 'admin' or public.teaches_class(c) or exists (
        select 1 from public.classes where id = c and created_by = p.id
      ))
  )
$$;
