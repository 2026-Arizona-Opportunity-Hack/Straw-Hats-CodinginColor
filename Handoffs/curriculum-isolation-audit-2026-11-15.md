# Curriculum isolation audit — 2026-11-15

Source baseline: `72aa2b6` on main. This audit covers repository migrations and a read-only check of production project `aeatfaxavfppeauncbts`. The proposed migration has **not** been applied to production.

## Verified findings

- Global library templates and local content currently share the `courses`, `modules`, `lessons`, `activities`, and `activity_keys` tables. `copy_library_course` copies the complete tree using fresh UUIDs, including answer keys. `copied_from` records lineage; it does not synchronize content.
- `publish_curriculum` updates only the selected course tree and checks ownership/revision. Publishing global changes does not overwrite an independently copied local tree.
- There is no normalized school table or school membership relation. `classes.school` and `profiles.school` are text labels. They are unsuitable authorization boundaries. The actual membership boundary is a class through `class_instructors`, its creator, and `enrollments`.
- Before this change, every published course was readable; instructors/reviewers could read published modules across classes, and answer keys were readable by every instructor/reviewer. Self-paced local copies also accepted unrelated self-enrollment through a definer RPC.
- Read-only production checks using existing demo accounts found 13 courses, including 7 local courses. The unrelated Ana demo instructor could read all 7 local courses. Five classes still referenced library courses directly. No student records were fetched and no production content/schema was changed.

## Proposed protection in migration 2011

`local_curricula` is a separate scope registry keyed by `course_id`. It records existing copied/non-library class courses and new copies/class attachments. The registry persists after the last class or original template is deleted, so a former local course cannot silently become globally visible. Content stays in independent UUID trees; existing assignments, attempts, and progress IDs remain intact.

Local content is available to its owner, attached class staff, enrolled class students (subject to existing publication/unlock rules), and admins. Co-teachers can edit the local tree. Reviewers and unrelated instructors cannot read local content or keys. Students cannot self-enroll into a local copy; stale self-enrollments no longer grant access. Course attachment cannot be used to gain access by guessing a private UUID. Only admins may edit global templates or change course ownership/lineage/library status. Published global and intentionally standalone self-paced curricula remain available.

The frontend may include `local_curricula(course_id)` in its courses projection to distinguish a local course even after `copied_from` is cleared by source deletion. Authenticated clients can read permitted markers but cannot write the registry directly.

## Boundaries and remaining decisions

This is **class/owner isolation, not a school tenant model**. Multiple classes explicitly sharing one local course share its content changes, even if their school labels differ. Comments can remain class-specific. Sharing one course is different from copying it; separate copies have separate content.

The five existing production classes linked directly to global templates remain linked. Therefore global publication still changes the content those classes view. The migration intentionally does not copy/repoint those historical classes because their assignments, attempts, module releases, and progress refer to existing IDs. Moving them requires an explicit migration plan covering those references and verification; it must not be advertised as already isolated.

A future school-wide library needs a stable `schools`/membership model and an explicit ownership association. Creating separate copies of every content table now would add a parallel content path and risk progress references without solving missing school identity. The durable scope registry plus existing independent trees is the bounded change in this PR.

## Verification

A disposable local PostgreSQL 16 instance with minimal Supabase auth/storage scaffolding applied all repository migrations successfully. All seven repository SQL regression files passed. The new isolation checks exercise actual authenticated/anonymous roles, copy creation, unrelated staff reads, answer keys, co-teacher edits, student unlock access, prohibited self-enrollment, stale self-enrollment, definer RPC access, class-attachment hijacking, global updates preserving edited local text, and deletion of a source/last class preserving private local content. Existing reviewer expectations were updated for class privacy; the independent-learning fixture now explicitly marks its shared course as global.

This is database verification with fictional fixtures, not live UI acceptance. Production remains unchanged until an approved migration/deployment.
