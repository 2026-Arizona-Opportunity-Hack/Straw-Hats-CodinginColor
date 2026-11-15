-- 2001 instructor workspace: class roster, class assignments, and the write policies the
-- instructor workspace needs. Owner: Ruthvik. Append-only after merge.

-- Course builder supports Google Slides blocks.
alter type activity_type add value if not exists 'slides';

-- Reordering modules / lessons / activities rewrites positions in one statement.
-- Check position uniqueness at commit instead of per row so swaps do not fail.
alter table modules drop constraint modules_course_id_position_key,
  add constraint modules_course_id_position_key unique (course_id, position) deferrable initially deferred;
alter table lessons drop constraint lessons_module_id_position_key,
  add constraint lessons_module_id_position_key unique (module_id, position) deferrable initially deferred;
alter table activities drop constraint activities_lesson_id_position_key,
  add constraint activities_lesson_id_position_key unique (lesson_id, position) deferrable initially deferred;

-- ---------------------------------------------------------------------------
-- Class roster. Students sign in with the class join code + their passcode, so a
-- roster row exists before (and without) a login account. profile_id links the row
-- to a login once one exists. Minors: name only, no email.
-- ---------------------------------------------------------------------------
create table class_students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 100),
  passcode text not null check (passcode ~ '^[0-9]{6}$'),
  profile_id uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (class_id, passcode),
  unique (class_id, profile_id)
);
create index on class_students (class_id);

-- A student enrolled with a login (e.g. seed data) also gets a roster row.
create function add_roster_row_for_enrollment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  code text;
begin
  loop
    code := (100000 + floor(random() * 900000))::int::text;
    exit when not exists (select 1 from class_students where class_id = new.class_id and passcode = code);
  end loop;
  insert into class_students (class_id, display_name, passcode, profile_id)
  select new.class_id, p.display_name, code, p.id from profiles p where p.id = new.student_id
  on conflict (class_id, profile_id) do nothing;
  return new;
end $$;

create trigger enrollments_add_roster_row after insert on enrollments
  for each row execute function add_roster_row_for_enrollment();

-- ---------------------------------------------------------------------------
-- Class assignments: work an instructor hands to one class (quiz, link, interactive
-- HTML, written response, code). Type-specific payload lives in content, matching
-- src/instructor/assignments/model.ts.
-- ---------------------------------------------------------------------------
create table assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes (id) on delete cascade,
  kind text not null check (kind in ('quiz', 'link', 'html', 'written', 'code')),
  title text not null check (char_length(title) between 1 and 200),
  instructions text not null default '' check (char_length(instructions) <= 20000),
  points numeric not null default 0 check (points >= 0),
  due_at timestamptz,
  max_attempts int check (max_attempts > 0),
  time_limit_minutes int check (time_limit_minutes > 0),
  module_id uuid references modules (id) on delete set null,
  published boolean not null default false,
  content jsonb not null default '{}'::jsonb check (pg_column_size(content) <= 524288),
  created_by uuid references profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on assignments (class_id);

create function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger assignments_touch before update on assignments
  for each row execute function touch_updated_at();

-- An instructor who creates a class teaches it (admins create classes for others).
create function add_class_creator_as_instructor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into class_instructors (class_id, instructor_id)
  select new.id, new.created_by where exists (select 1 from profiles where id = new.created_by and role = 'instructor')
  on conflict do nothing;
  return new;
end $$;

create trigger classes_add_creator after insert on classes
  for each row execute function add_class_creator_as_instructor();

-- ---------------------------------------------------------------------------
-- Policies. Instructors manage classes they teach; admins manage everything.
-- Course content is editable by the course owner or an admin.
-- ---------------------------------------------------------------------------
create function can_edit_course(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select current_role_is('admin') or exists (select 1 from courses where id = c and owner_id = auth.uid())
$$;

create function can_manage_class(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select current_role_is('admin') or teaches_class(c)
    or exists (select 1 from classes where id = c and created_by = auth.uid())
$$;

create policy "edit modules of own course" on modules for all
  using (can_edit_course(course_id)) with check (can_edit_course(course_id));
create policy "edit lessons of own course" on lessons for all
  using (can_edit_course((select course_id from modules where id = module_id)))
  with check (can_edit_course((select course_id from modules where id = module_id)));
create policy "edit activities of own course" on activities for all
  using (can_edit_course((select m.course_id from lessons l join modules m on m.id = l.module_id where l.id = lesson_id)))
  with check (can_edit_course((select m.course_id from lessons l join modules m on m.id = l.module_id where l.id = lesson_id)));

-- Lets INSERT ... RETURNING see a class before the creator trigger has run.
create policy "creator reads class" on classes for select using (created_by = auth.uid());
create policy "manage own classes" on classes for update
  using (can_manage_class(id)) with check (can_manage_class(id));
create policy "delete own classes" on classes for delete using (can_manage_class(id));

create policy "read own teaching rows" on class_instructors for select
  using (instructor_id = auth.uid() or current_role_is('admin'));

create policy "manage class modules" on class_modules for all
  using (can_manage_class(class_id)) with check (can_manage_class(class_id));

alter table class_students enable row level security;
create policy "manage roster" on class_students for all
  using (can_manage_class(class_id)) with check (can_manage_class(class_id));

alter table assignments enable row level security;
create policy "manage assignments" on assignments for all
  using (can_manage_class(class_id)) with check (can_manage_class(class_id));
