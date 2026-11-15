-- Staff discussion belongs to a curriculum block and, when applicable, one class.
-- A null class_id identifies the shared staff thread for a published global block.
-- The policy must read the private local-course registry. Check curriculum readability
-- and class membership explicitly when crossing that boundary.
create function curriculum_private.can_comment_on_block(p_activity uuid, p_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    ((select public.current_role_is('instructor')) or (select public.current_role_is('admin')))
    and exists (
      select 1
      from public.activities a
      join public.lessons l on l.id = a.lesson_id
      join public.modules m on m.id = l.module_id
      join public.courses c on c.id = m.course_id
      where a.id = p_activity and curriculum_private.can_read_module(m.id) and (
        (p_class is null and c.copied_from is null and not curriculum_private.is_local_course(c.id) and c.published and m.published)
        or (p_class is not null and exists (
          select 1 from public.classes g
          where g.id = p_class and g.course_id = c.id and public.can_manage_class(g.id)
        ))
      )
    )
$$;

create function curriculum_private.comment_author_name()
returns text language sql stable security invoker set search_path = '' as $$
  select p.display_name from public.profiles p where p.id = (select auth.uid())
$$;

revoke all on function curriculum_private.can_comment_on_block(uuid, uuid),
  curriculum_private.comment_author_name() from public, anon, authenticated;
grant execute on function curriculum_private.can_comment_on_block(uuid, uuid),
  curriculum_private.comment_author_name() to authenticated;

create table public.curriculum_block_comments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  class_id uuid references public.classes (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  author_name text not null default curriculum_private.comment_author_name(),
  body text not null check (char_length(body) between 1 and 2000 and body ~ '[^[:space:]]'),
  created_at timestamptz not null default now()
);

create index curriculum_block_comments_thread
  on public.curriculum_block_comments (activity_id, class_id, created_at desc, id desc);
create index curriculum_block_comments_class on public.curriculum_block_comments (class_id);
create index curriculum_block_comments_author on public.curriculum_block_comments (author_id);

alter table public.curriculum_block_comments enable row level security;
revoke all on public.curriculum_block_comments from public, anon, authenticated;
grant select on public.curriculum_block_comments to authenticated;
grant insert (activity_id, class_id, body) on public.curriculum_block_comments to authenticated;

create policy "staff read curriculum block comments" on public.curriculum_block_comments
  for select to authenticated
  using (curriculum_private.can_comment_on_block(activity_id, class_id));

create policy "staff post curriculum block comments" on public.curriculum_block_comments
  for insert to authenticated
  with check (author_id = (select auth.uid()) and curriculum_private.can_comment_on_block(activity_id, class_id));
