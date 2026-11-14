-- 0001 core schema. CONTRACT between student side (Shivraj) and instructor side (Ruthvik).
-- Append-only: never edit after merge. Add 1xxx (student) or 2xxx (instructor) files instead.
-- Mirrors src/shared/types/db.ts.

create type user_role as enum ('student', 'instructor', 'admin', 'reviewer');
create type course_level as enum ('beginner', 'intermediate', 'advanced', 'expert');
create type delivery_mode as enum ('self_paced', 'instructor_led');
create type activity_type as enum (
  'content', 'video', 'check', 'worksheet', 'code', 'interactive_html', 'exit', 'pretest', 'posttest'
);

-- Students are minors: name, school and class only. No email, birthday or photo.
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role user_role not null default 'student',
  display_name text not null check (char_length(display_name) between 1 and 100),
  school text check (char_length(school) <= 120),
  created_at timestamptz not null default now()
);

create table courses (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  level course_level not null default 'beginner',
  delivery_mode delivery_mode not null default 'self_paced',
  is_library boolean not null default false,
  copied_from uuid references courses (id) on delete set null,
  owner_id uuid references profiles (id) on delete set null,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  position int not null,
  title text not null,
  concept text not null,
  published boolean not null default false,
  unique (course_id, position)
);

create table lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references modules (id) on delete cascade,
  position int not null,
  title text not null,
  is_checkpoint boolean not null default false,
  unique (module_id, position)
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons (id) on delete cascade,
  position int not null,
  type activity_type not null,
  concept text not null,
  points int not null default 0 check (points >= 0),
  counts_toward_unlock boolean not null default true,
  -- Per-type payload, see src/shared/types/activities.ts. 512 KB cap keeps HTML pages sane.
  content jsonb not null default '{}'::jsonb check (pg_column_size(content) <= 524288),
  unique (lesson_id, position)
);

create table classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  school text not null,
  course_id uuid not null references courses (id),
  join_code text not null unique,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

create table class_instructors (
  class_id uuid not null references classes (id) on delete cascade,
  instructor_id uuid not null references profiles (id) on delete cascade,
  primary key (class_id, instructor_id)
);

create table enrollments (
  class_id uuid not null references classes (id) on delete cascade,
  student_id uuid not null references profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

-- Instructor-led courses: a module is visible to students once released here.
create table class_modules (
  class_id uuid not null references classes (id) on delete cascade,
  module_id uuid not null references modules (id) on delete cascade,
  released_at timestamptz not null default now(),
  due_at timestamptz,
  primary key (class_id, module_id)
);

create table activity_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles (id) on delete cascade,
  activity_id uuid not null references activities (id) on delete cascade,
  class_id uuid not null references classes (id) on delete cascade,
  response jsonb,
  score numeric check (score between 0 and 1),
  is_correct boolean,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  time_on_task_ms int not null default 0 check (time_on_task_ms >= 0),
  attempt_no int not null default 1
);
create index on activity_attempts (class_id, student_id);

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  key_hash text not null unique,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Role helpers (security definer so policies can read profiles without recursion)
-- ---------------------------------------------------------------------------
create function current_role_is(r user_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = r)
$$;

create function teaches_class(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from class_instructors where class_id = c and instructor_id = auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security: on for every table. Baseline policies only; Ruthvik
-- extends them in 2xxx migrations (e.g. hiding answers from students).
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table courses enable row level security;
alter table modules enable row level security;
alter table lessons enable row level security;
alter table activities enable row level security;
alter table classes enable row level security;
alter table class_instructors enable row level security;
alter table enrollments enable row level security;
alter table class_modules enable row level security;
alter table activity_attempts enable row level security;
alter table api_keys enable row level security; -- no policies: service role only

create policy "own profile" on profiles for select using (id = auth.uid());
create policy "admin manages profiles" on profiles for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

-- Curriculum: anyone signed in reads published content; owners and admins write.
create policy "read published courses" on courses for select
  using (published or owner_id = auth.uid() or current_role_is('admin'));
create policy "owner writes course" on courses for all
  using (owner_id = auth.uid() or current_role_is('admin'))
  with check (owner_id = auth.uid() or current_role_is('admin'));

create policy "read modules" on modules for select using (true);
create policy "read lessons" on lessons for select using (true);
create policy "read activities" on activities for select using (true);

create policy "instructor reads own classes" on classes for select
  using (teaches_class(id) or current_role_is('admin')
         or exists (select 1 from enrollments e where e.class_id = classes.id and e.student_id = auth.uid()));
create policy "instructor creates class" on classes for insert
  with check (created_by = auth.uid() and (current_role_is('instructor') or current_role_is('admin')));

create policy "student writes own attempts" on activity_attempts for insert
  with check (student_id = auth.uid());
create policy "read attempts" on activity_attempts for select
  using (student_id = auth.uid() or teaches_class(class_id) or current_role_is('admin'));
