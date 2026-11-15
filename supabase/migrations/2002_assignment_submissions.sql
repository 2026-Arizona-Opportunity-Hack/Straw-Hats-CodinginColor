-- 2002 assignment submissions: one row per student per assignment, holding the student's
-- answers and the instructor's grading. Owner: Ruthvik. Append-only after merge.
-- Shapes match src/instructor/assignments/grading.ts.

create table assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments (id) on delete cascade,
  -- Copied from the assignment by a trigger; used by RLS and to load a class in one query.
  class_id uuid not null references classes (id) on delete cascade,
  class_student_id uuid not null references class_students (id) on delete cascade,
  -- Answer per block id: chosen choice indexes or text.
  responses jsonb not null default '{}'::jsonb check (pg_column_size(responses) <= 262144),
  -- Instructor points per block id; overrides automatic scoring.
  manual_scores jsonb not null default '{}'::jsonb,
  feedback text not null default '' check (char_length(feedback) <= 10000),
  submitted_at timestamptz not null default now(),
  graded_at timestamptz,
  graded_by uuid references profiles (id) on delete set null,
  unique (assignment_id, class_student_id)
);
create index on assignment_submissions (class_id);

-- Keep class_id consistent with the assignment, whatever the client sends.
create function set_submission_class() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select class_id into new.class_id from assignments where id = new.assignment_id;
  return new;
end $$;

create trigger assignment_submissions_set_class before insert or update of assignment_id, class_id on assignment_submissions
  for each row execute function set_submission_class();

alter table assignment_submissions enable row level security;

-- Instructors of the class (and admins) read and grade. They do not create or delete student work;
-- students will insert their own submissions once student sign-in exists.
create policy "read class submissions" on assignment_submissions for select using (can_manage_class(class_id));
create policy "grade class submissions" on assignment_submissions for update
  using (can_manage_class(class_id)) with check (can_manage_class(class_id));
