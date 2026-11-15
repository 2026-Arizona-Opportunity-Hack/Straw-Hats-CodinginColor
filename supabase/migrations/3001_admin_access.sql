-- 3001: what the CIC admin pages (src/admin/) need beyond 0001-2003. Owner: Aryan.
-- Admins can already read every class, enrollment and attempt, update classes and manage
-- profiles. This adds the rest: assigning instructors, API keys, archiving, and the
-- Overview's instructor issues and hiring cards.

-- Schools & classes: assign and remove instructors (2001 only lets people read these rows).
create policy "admin manages class instructors" on class_instructors for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

-- Settings & API: create, list and revoke read-API keys. Only the SHA-256 hash is stored.
create policy "admin manages api keys" on api_keys for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

-- Archiving keeps the row (reports still use it) and hides it from active lists.
alter table classes add column archived_at timestamptz;
alter table profiles add column archived_at timestamptz;

-- Overview: problems instructors raise for CIC staff.
create table instructor_issues (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references profiles (id) on delete cascade default auth.uid(),
  instructor_name text not null check (length(instructor_name) between 1 and 100),
  contact_email text not null check (length(contact_email) between 3 and 254),
  class_id uuid references classes (id) on delete set null,
  class_name text,
  subject text not null check (length(subject) between 1 and 200),
  message text not null check (length(message) between 1 and 5000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index instructor_issues_status_idx on instructor_issues (status, created_at desc);
alter table instructor_issues enable row level security;

create policy "admin manages issues" on instructor_issues for all
  using (current_role_is('admin')) with check (current_role_is('admin'));
create policy "instructor reads own issues" on instructor_issues for select
  using (instructor_id = auth.uid());
create policy "instructor raises issue" on instructor_issues for insert
  with check (instructor_id = auth.uid() and current_role_is('instructor') and status = 'open');

-- Overview: instructor job applications. Admin only; applicants never sign in.
create table job_applications (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 100),
  email text not null check (length(email) between 3 and 254),
  role text not null check (length(role) between 1 and 100),
  school text,
  status text not null default 'new'
    check (status in ('new', 'interviewing', 'offer', 'hired', 'not_selected')),
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index job_applications_updated_idx on job_applications (updated_at desc);
alter table job_applications enable row level security;

create policy "admin manages applications" on job_applications for all
  using (current_role_is('admin')) with check (current_role_is('admin'));
