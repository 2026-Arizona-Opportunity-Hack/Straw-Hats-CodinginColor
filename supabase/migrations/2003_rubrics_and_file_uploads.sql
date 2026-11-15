-- 2003 rubrics and file uploads for assignments. Owner: Ruthvik. Append-only after merge.
-- Rubrics themselves live inside assignments.content (per block); this stores how a
-- submission was scored against them, and adds private storage for uploaded files.

-- New assignment template: file upload.
alter table assignments drop constraint assignments_kind_check,
  add constraint assignments_kind_check check (kind in ('quiz', 'link', 'html', 'written', 'code', 'file'));

-- Rubric rating chosen per block id, then per criterion id: { "<block>": { "<criterion>": "<rating>" } }.
alter table assignment_submissions add column rubric_scores jsonb not null default '{}'::jsonb;

-- Private bucket for student uploads. 25 MB per file (src/instructor/assignments/model.ts MAX_UPLOAD_MB).
-- Object path: <class_id>/<assignment_id>/<class_student_id>/<file name>
insert into storage.buckets (id, name, public, file_size_limit)
values ('submission-files', 'submission-files', false, 26214400)
on conflict (id) do nothing;

-- Casts a path segment to uuid, or null when it is not one (so a bad path is denied, not an error).
create function try_uuid(value text) returns uuid language plpgsql immutable as $$
begin
  return value::uuid;
exception when others then
  return null;
end $$;

-- Instructors of the class (and admins) can read its files, through short-lived signed URLs.
-- Students will upload and read their own files once student sign-in exists.
create policy "instructors read class submission files" on storage.objects for select to authenticated
  using (bucket_id = 'submission-files' and public.can_manage_class(public.try_uuid((storage.foldername(name))[1])));
