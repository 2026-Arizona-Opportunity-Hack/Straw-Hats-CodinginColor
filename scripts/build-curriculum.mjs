#!/usr/bin/env node
// Builds supabase/curriculum/ai-academy.sql from curriculum/ai-academy/course.json
// and the widget pages in curriculum/ai-academy/widgets/.
// Plain Node, no dependencies. See curriculum/README.md for the source format.
//
//   node scripts/build-curriculum.mjs                 fail if a widget page is missing
//   node scripts/build-curriculum.mjs --allow-missing warn and skip activities whose page is missing
//   node scripts/build-curriculum.mjs --check         build in memory, write nothing
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const SOURCE_DIR = join(ROOT, 'curriculum', 'ai-academy')
export const OUTPUT_FILE = join(ROOT, 'supabase', 'curriculum', 'ai-academy.sql')

const NAMESPACE = 'ai-academy'
const VERSIONS = ['self_paced', 'classroom']
const DELIVERY_MODES = ['self_paced', 'instructor_led']
const LEVELS = ['beginner', 'intermediate', 'advanced', 'expert']
const ACTIVITY_TYPES = ['content', 'video', 'check', 'worksheet', 'code', 'interactive_html', 'exit', 'pretest', 'posttest']
// Matches the 512 KB check on activities.content, with headroom for jsonb overhead.
const MAX_CONTENT_BYTES = 480 * 1024

/** Stable uuid: sha1 of `ai-academy:<course>:<key>`, shaped like a version 5 uuid. */
export function stableUuid(courseKey, key) {
  const hex = createHash('sha1').update(`${NAMESPACE}:${courseKey}:${key}`).digest('hex').slice(0, 32).split('')
  hex[12] = '5'
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  const h = hex.join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** SQL string literal. Doubling quotes is safe because standard_conforming_strings is on (set below). */
export function sqlString(value) {
  const text = String(value)
  if (text.includes('\0')) throw new Error('NUL characters cannot be stored in Postgres text')
  return `'${text.replaceAll("'", "''")}'`
}

const fail = message => { throw new Error(message) }
const isText = value => typeof value === 'string' && value.trim().length > 0

function checkChoices(choices, where) {
  if (!Array.isArray(choices) || choices.length < 2) fail(`${where}: needs at least two choices`)
  const ids = new Set()
  for (const choice of choices) {
    if (!isText(choice?.id) || !isText(choice?.label)) fail(`${where}: every choice needs an id and a label`)
    if (ids.has(choice.id)) fail(`${where}: duplicate choice id "${choice.id}"`)
    ids.add(choice.id)
  }
  return ids
}

/**
 * Checks a built `content` payload against src/shared/types/activities.ts.
 * Throws with a readable message; returns nothing when the payload is valid.
 */
export function validateContent(type, content, where = type) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) fail(`${where}: content must be an object`)
  switch (type) {
    case 'content':
      if (!isText(content.markdown)) fail(`${where}: content needs markdown`)
      break
    case 'video':
      if (!/^https:\/\/\S+$/.test(content.url ?? '')) fail(`${where}: video needs an https url`)
      break
    case 'check': {
      if (!isText(content.prompt)) fail(`${where}: check needs a prompt`)
      const ids = checkChoices(content.choices, where)
      if (!ids.has(content.answer)) fail(`${where}: check answer must be one of its choice ids`)
      break
    }
    case 'worksheet': {
      if (!isText(content.title)) fail(`${where}: worksheet needs a title`)
      if (!Array.isArray(content.fields) || content.fields.length === 0) fail(`${where}: worksheet needs fields`)
      const ids = new Set()
      for (const field of content.fields) {
        if (!isText(field?.id) || ids.has(field.id)) fail(`${where}: worksheet field ids must be present and unique`)
        ids.add(field.id)
        if (!['short_answer', 'long_answer', 'multiple_choice', 'fill_blank'].includes(field.kind)) fail(`${where}: unknown field kind "${field.kind}"`)
        if (!isText(field.prompt)) fail(`${where}: field "${field.id}" needs a prompt`)
        if (field.kind === 'multiple_choice') checkChoices(field.choices, `${where} field "${field.id}"`)
      }
      break
    }
    case 'code':
      if (!isText(content.prompt) || typeof content.starter_code !== 'string' || !Array.isArray(content.tests)) {
        fail(`${where}: code needs prompt, starter_code and tests`)
      }
      break
    case 'interactive_html':
      if (!isText(content.html)) fail(`${where}: interactive_html needs html`)
      if (typeof content.reports_score !== 'boolean') fail(`${where}: interactive_html needs reports_score`)
      break
    case 'exit':
      if (!isText(content.prompt)) fail(`${where}: exit needs a prompt`)
      if (content.choices !== undefined) checkChoices(content.choices, where)
      break
    case 'pretest':
    case 'posttest': {
      if (!Array.isArray(content.items) || content.items.length === 0) fail(`${where}: ${type} needs items`)
      const itemIds = new Set()
      for (const item of content.items) {
        const at = `${where} item "${item?.id}"`
        if (!isText(item?.id) || itemIds.has(item.id)) fail(`${where}: item ids must be present and unique`)
        itemIds.add(item.id)
        if (!isText(item.concept) || !isText(item.prompt)) fail(`${at}: needs concept and prompt`)
        const ids = checkChoices(item.choices, at)
        if (!ids.has(item.answer)) fail(`${at}: answer must be one of its choice ids`)
      }
      break
    }
    default:
      fail(`${where}: unknown activity type "${type}"`)
  }
}

const inVersion = (node, version) => !node.versions || node.versions.includes(version)

/** `markdown` may be written as an array of lines in course.json; join it here. */
function normalizeContent(content) {
  const copy = structuredClone(content ?? {})
  if (Array.isArray(copy.markdown)) copy.markdown = copy.markdown.join('\n')
  return copy
}

function checkKey(key, where) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(key ?? '')) fail(`${where}: key "${key}" must be lowercase letters, digits and dashes`)
}

function checkVersions(node, where) {
  if (node.versions === undefined) return
  if (!Array.isArray(node.versions) || node.versions.length === 0 || node.versions.some(v => !VERSIONS.includes(v))) {
    fail(`${where}: versions must be a non-empty list of ${VERSIONS.join(', ')}`)
  }
}

/**
 * Turns course.json into plain rows, one set per course version.
 * readWidget(htmlFile) returns the page's HTML, or null when the file does not exist.
 */
export function buildRows(source, { readWidget, allowMissing = false, warn = () => {} }) {
  const rows = { courses: [], modules: [], lessons: [], activities: [] }
  if (!Array.isArray(source.courses) || source.courses.length === 0) fail('course.json needs courses')
  if (!Array.isArray(source.modules) || source.modules.length === 0) fail('course.json needs modules')

  const seenKeys = new Set()
  const unique = (key, where) => { if (seenKeys.has(key)) fail(`${where}: duplicate key "${key}"`); seenKeys.add(key) }
  for (const m of source.modules) {
    checkKey(m.key, 'module'); unique(m.key, 'module'); checkVersions(m, `module ${m.key}`)
    for (const l of m.lessons ?? []) {
      checkKey(l.key, `module ${m.key}`); unique(`${m.key}/${l.key}`, `lesson ${l.key}`); checkVersions(l, `lesson ${m.key}/${l.key}`)
      for (const a of l.activities ?? []) {
        const where = `activity ${m.key}/${l.key}/${a.key}`
        checkKey(a.key, where); unique(`${m.key}/${l.key}/${a.key}`, where); checkVersions(a, where)
        if (!ACTIVITY_TYPES.includes(a.type)) fail(`${where}: unknown type "${a.type}"`)
        if (!isText(a.concept)) fail(`${where}: needs a concept`)
        if (!Number.isInteger(a.points) || a.points < 0) fail(`${where}: points must be a whole number >= 0`)
        if (a.htmlFile && a.type !== 'interactive_html') fail(`${where}: htmlFile is only for interactive_html`)
      }
    }
  }

  // Read each widget once, shared by both course versions.
  const widgetHtml = new Map()
  for (const m of source.modules) for (const l of m.lessons ?? []) for (const a of l.activities ?? []) {
    if (!a.htmlFile || widgetHtml.has(a.htmlFile)) continue
    if (!/^widgets\/[a-z0-9-]+\.html$/.test(a.htmlFile)) fail(`activity ${a.key}: htmlFile must look like widgets/name.html`)
    const html = readWidget(a.htmlFile)
    if (html == null) {
      if (!allowMissing) fail(`Missing widget page ${a.htmlFile} (activity ${m.key}/${l.key}/${a.key}). Use --allow-missing while widgets are still being written.`)
      warn(`warning: ${a.htmlFile} is missing; skipping the activities that use it`)
    }
    widgetHtml.set(a.htmlFile, html)
  }

  const courseKeys = new Set()
  for (const c of source.courses) {
    checkKey(c.key, 'course')
    if (courseKeys.has(c.key)) fail(`duplicate course key "${c.key}"`)
    courseKeys.add(c.key)
    if (!VERSIONS.includes(c.version)) fail(`course ${c.key}: version must be one of ${VERSIONS.join(', ')}`)
    if (!DELIVERY_MODES.includes(c.deliveryMode)) fail(`course ${c.key}: deliveryMode must be one of ${DELIVERY_MODES.join(', ')}`)
    if (!LEVELS.includes(c.level)) fail(`course ${c.key}: level must be one of ${LEVELS.join(', ')}`)
    if (!isText(c.title) || typeof c.description !== 'string') fail(`course ${c.key}: needs title and description`)

    const courseId = stableUuid(c.key, 'course')
    rows.courses.push({ id: courseId, title: c.title, description: c.description, level: c.level, delivery_mode: c.deliveryMode })

    let modulePosition = 0
    for (const m of source.modules) {
      if (!inVersion(m, c.version)) continue
      const moduleId = stableUuid(c.key, m.key)
      rows.modules.push({ id: moduleId, course_id: courseId, position: ++modulePosition, title: m.title, concept: m.concept, published: m.published === true })

      let lessonPosition = 0
      for (const l of m.lessons ?? []) {
        if (!inVersion(l, c.version)) continue
        const activities = []
        for (const a of l.activities ?? []) {
          if (!inVersion(a, c.version)) continue
          const where = `activity ${m.key}/${l.key}/${a.key}`
          const content = normalizeContent(a.content)
          if (a.title) content.title ??= a.title
          if (a.type === 'interactive_html') {
            if (a.htmlFile) {
              const html = widgetHtml.get(a.htmlFile)
              if (html == null) continue
              content.html = html
            }
            if (a.instructions) content.instructions ??= a.instructions
            content.reports_score ??= false
          }
          validateContent(a.type, content, where)
          const json = JSON.stringify(content)
          if (Buffer.byteLength(json) > MAX_CONTENT_BYTES) fail(`${where}: content is larger than ${MAX_CONTENT_BYTES} bytes`)
          activities.push({ a, json })
        }
        if (activities.length === 0) continue
        const lessonId = stableUuid(c.key, `${m.key}/${l.key}`)
        rows.lessons.push({ id: lessonId, module_id: moduleId, position: ++lessonPosition, title: l.title, is_checkpoint: l.isCheckpoint === true })
        activities.forEach(({ a, json }, i) => rows.activities.push({
          id: stableUuid(c.key, `${m.key}/${l.key}/${a.key}`), lesson_id: lessonId, position: i + 1, type: a.type,
          concept: a.concept, points: a.points, counts_toward_unlock: a.countsTowardUnlock !== false, content: json,
        }))
      }
    }
  }
  return rows
}

// `not in ()` is not valid SQL, so an empty list becomes the nil uuid (matches nothing).
const list = ids => (ids.length ? ids : ['00000000-0000-0000-0000-000000000000']).map(sqlString).join(', ')
const bool = value => (value ? 'true' : 'false')

/** Renders rows as one transaction of deletes (stale rows) and upserts. Deterministic. */
export function renderSql(rows) {
  const courseIds = rows.courses.map(c => c.id)
  const out = [
    '-- AI Academy library courses. GENERATED by scripts/build-curriculum.mjs from',
    '-- curriculum/ai-academy/. Do not edit by hand: edit the source and run `npm run curriculum`.',
    '-- Safe to rerun: ids are stable and every row is upserted. Rows of these courses that are',
    '-- no longer in the source are deleted first (with their student attempts).',
    '-- Answer keys in content are moved to activity_keys by the activities_move_answers trigger.',
    '',
    'begin;',
    'set local standard_conforming_strings = on;',
    '',
    '-- 1. Remove activities, lessons and modules that left the source.',
    `delete from activities a using lessons l, modules m`,
    `where a.lesson_id = l.id and l.module_id = m.id and m.course_id in (${list(courseIds)})`,
    `  and a.id not in (${list(rows.activities.map(a => a.id))});`,
    `delete from lessons l using modules m`,
    `where l.module_id = m.id and m.course_id in (${list(courseIds)})`,
    `  and l.id not in (${list(rows.lessons.map(l => l.id))});`,
    `delete from modules`,
    `where course_id in (${list(courseIds)})`,
    `  and id not in (${list(rows.modules.map(m => m.id))});`,
    '',
    '-- 2. Courses (library, no owner).',
  ]
  for (const c of rows.courses) {
    out.push(
      'insert into courses (id, title, description, level, delivery_mode, is_library, owner_id, published) values',
      `  (${sqlString(c.id)}, ${sqlString(c.title)}, ${sqlString(c.description)}, ${sqlString(c.level)}, ${sqlString(c.delivery_mode)}, true, null, true)`,
      'on conflict (id) do update set title = excluded.title, description = excluded.description, level = excluded.level,',
      '  delivery_mode = excluded.delivery_mode, is_library = true, owner_id = null, published = true;',
    )
  }
  out.push('', '-- 3. Modules.')
  for (const m of rows.modules) {
    out.push(
      'insert into modules (id, course_id, position, title, concept, published) values',
      `  (${sqlString(m.id)}, ${sqlString(m.course_id)}, ${m.position}, ${sqlString(m.title)}, ${sqlString(m.concept)}, ${bool(m.published)})`,
      'on conflict (id) do update set course_id = excluded.course_id, position = excluded.position, title = excluded.title,',
      '  concept = excluded.concept, published = excluded.published;',
    )
  }
  out.push('', '-- 4. Lessons.')
  for (const l of rows.lessons) {
    out.push(
      'insert into lessons (id, module_id, position, title, is_checkpoint) values',
      `  (${sqlString(l.id)}, ${sqlString(l.module_id)}, ${l.position}, ${sqlString(l.title)}, ${bool(l.is_checkpoint)})`,
      'on conflict (id) do update set module_id = excluded.module_id, position = excluded.position, title = excluded.title,',
      '  is_checkpoint = excluded.is_checkpoint;',
    )
  }
  out.push('', '-- 5. Activities.')
  for (const a of rows.activities) {
    out.push(
      'insert into activities (id, lesson_id, position, type, concept, points, counts_toward_unlock, content) values',
      `  (${sqlString(a.id)}, ${sqlString(a.lesson_id)}, ${a.position}, ${sqlString(a.type)}, ${sqlString(a.concept)}, ${a.points}, ${bool(a.counts_toward_unlock)},`,
      `   ${sqlString(a.content)}::jsonb)`,
      'on conflict (id) do update set lesson_id = excluded.lesson_id, position = excluded.position, type = excluded.type,',
      '  concept = excluded.concept, points = excluded.points, counts_toward_unlock = excluded.counts_toward_unlock,',
      '  content = excluded.content;',
    )
  }
  out.push('', 'commit;', '')
  return out.join('\n')
}

export function readSource(dir = SOURCE_DIR) {
  return JSON.parse(readFileSync(join(dir, 'course.json'), 'utf8'))
}

export function widgetReader(dir = SOURCE_DIR) {
  return htmlFile => {
    const path = join(dir, htmlFile)
    return existsSync(path) ? readFileSync(path, 'utf8') : null
  }
}

export function build({ dir = SOURCE_DIR, allowMissing = false, warn = () => {} } = {}) {
  return renderSql(buildRows(readSource(dir), { readWidget: widgetReader(dir), allowMissing, warn }))
}

function main(args) {
  const allowMissing = args.includes('--allow-missing')
  const checkOnly = args.includes('--check')
  const sql = build({ allowMissing, warn: message => console.warn(message) })
  if (checkOnly) {
    console.log('course.json is valid.')
    return
  }
  mkdirSync(dirname(OUTPUT_FILE), { recursive: true })
  writeFileSync(OUTPUT_FILE, sql)
  console.log(`Wrote ${OUTPUT_FILE.slice(ROOT.length + 1)}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    console.error(`build-curriculum: ${error.message}`)
    process.exit(1)
  }
}
