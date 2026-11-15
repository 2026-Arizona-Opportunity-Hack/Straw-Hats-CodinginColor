import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'vitest'
import { buildRows, readSource, renderSql, sqlString, stableUuid, validateContent } from '../scripts/build-curriculum.mjs'

// Stub pages keep these tests independent of the widget files.
const stubWidget = file => `<!doctype html><title>${file}</title><p>Stub</p>`
const source = readSource()
const build = (options = {}) => renderSql(buildRows(source, { readWidget: stubWidget, ...options }))
const rows = buildRows(source, { readWidget: stubWidget })
const allActivities = source.modules.flatMap(m => m.lessons.flatMap(l => l.activities))

// Required fields per type, written out independently of the generator's validator.
const REQUIRED = {
  content: ['markdown'],
  video: ['url'],
  check: ['prompt', 'choices', 'answer'],
  worksheet: ['title', 'fields'],
  code: ['prompt', 'starter_code', 'tests'],
  interactive_html: ['html', 'reports_score'],
  exit: ['prompt'],
  pretest: ['items'],
  posttest: ['items'],
}

/** Splits SQL into statements, honoring '...' literals (with '' escapes) and -- comments. */
function splitSql(sql) {
  const statements = []
  let current = ''
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    if (ch === "'") {
      const end = (() => {
        for (let j = i + 1; j < sql.length; j++) {
          if (sql[j] === "'") {
            if (sql[j + 1] === "'") { j++; continue }
            return j
          }
        }
        throw new Error(`Unterminated string literal at offset ${i}`)
      })()
      current += sql.slice(i, end + 1)
      i = end
    } else if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i)
      i = end === -1 ? sql.length : end
    } else if (ch === ';') {
      statements.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  assert.equal(current.trim(), '', 'SQL ends without a trailing statement')
  return statements.filter(Boolean)
}

test('generator output is deterministic', () => {
  assert.equal(build(), build())
  assert.equal(stableUuid('classroom', 'm1-intro'), stableUuid('classroom', 'm1-intro'))
  assert.notEqual(stableUuid('classroom', 'm1-intro'), stableUuid('self-paced', 'm1-intro'))
})

test('every activity content has its type\'s required fields', () => {
  assert.ok(rows.activities.length > 0)
  for (const row of rows.activities) {
    const content = JSON.parse(row.content)
    for (const field of REQUIRED[row.type]) assert.ok(field in content, `${row.id} (${row.type}) is missing ${field}`)
    assert.doesNotThrow(() => validateContent(row.type, content, row.id))
  }
})

test('pretest and posttest answers are one of their choice ids', () => {
  const assessments = allActivities.filter(a => a.type === 'pretest' || a.type === 'posttest')
  assert.deepEqual(assessments.map(a => a.type).sort(), ['posttest', 'pretest'])
  for (const a of assessments) {
    assert.ok(a.content.items.length >= 6 && a.content.items.length <= 8, `${a.key} has 6-8 items`)
    for (const item of a.content.items) {
      assert.ok(item.concept, `${a.key}/${item.id} has a concept`)
      assert.ok(item.choices.map(c => c.id).includes(item.answer), `${a.key}/${item.id} answer is a choice id`)
    }
  }
  const [pre, post] = ['pretest', 'posttest'].map(type => assessments.find(a => a.type === type).content.items.map(i => i.concept))
  assert.deepEqual(post, pre, 'posttest items parallel the pretest concepts')
})

test('checks have an answer among their choices and an explanation', () => {
  for (const a of allActivities.filter(a => a.type === 'check')) {
    assert.ok(a.content.choices.map(c => c.id).includes(a.content.answer), a.key)
    assert.ok(a.content.explanation, `${a.key} has an explanation`)
  }
})

test('ids are unique uuids and positions are 1..n per parent', () => {
  const all = [...rows.courses, ...rows.modules, ...rows.lessons, ...rows.activities].map(r => r.id)
  assert.equal(new Set(all).size, all.length)
  for (const id of all) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  for (const [table, parent] of [['modules', 'course_id'], ['lessons', 'module_id'], ['activities', 'lesson_id']]) {
    const byParent = Map.groupBy(rows[table], r => r[parent])
    for (const [id, children] of byParent) {
      assert.deepEqual(children.map(c => c.position), children.map((_, i) => i + 1), `${table} under ${id}`)
    }
  }
})

test('two library courses share module 1 and only module 1 is published', () => {
  assert.deepEqual(rows.courses.map(c => c.delivery_mode), ['self_paced', 'instructor_led'])
  for (const course of rows.courses) {
    const modules = rows.modules.filter(m => m.course_id === course.id)
    assert.equal(modules.length, 6)
    assert.deepEqual(modules.map(m => m.published), [true, false, false, false, false, false])
  }
  const types = course => rows.activities.filter(a => rows.lessons.some(l => l.id === a.lesson_id &&
    rows.modules.some(m => m.id === l.module_id && m.course_id === course.id))).map(a => a.type)
  // Interactive pages are in both courses: alone in self-paced, projected or on devices in a classroom.
  for (const course of rows.courses) assert.equal(types(course).filter(t => t === 'interactive_html').length, 5)
  const worksheets = course => types(course).filter(t => t === 'worksheet').length
  assert.ok(worksheets(rows.courses[1]) > worksheets(rows.courses[0]), 'classroom keeps its group worksheets')
  const project = allActivities.find(a => a.type === 'worksheet' && a.content.title === 'AI App Investigation')
  assert.equal(project.points, 10)
})

test('SQL parses into one transaction of deletes and upserts', () => {
  const statements = splitSql(build())
  assert.equal(statements[0], 'begin')
  assert.equal(statements.at(-1), 'commit')
  for (const statement of statements.slice(1, -1)) {
    assert.match(statement, /^(set local|delete from|insert into)\b/, statement.slice(0, 80))
    if (statement.startsWith('insert')) assert.match(statement, /on conflict \(id\) do update set/)
  }
  const inserts = statements.filter(s => s.startsWith('insert'))
  assert.equal(inserts.length, rows.courses.length + rows.modules.length + rows.lessons.length + rows.activities.length)
  // Every jsonb literal round-trips to the content the generator built.
  const json = inserts.filter(s => s.startsWith('insert into activities')).map(s => {
    const literal = s.match(/,\s+('(?:[^']|'')*')::jsonb\)/)[1]
    return JSON.parse(literal.slice(1, -1).replaceAll("''", "'"))
  })
  assert.deepEqual(json, rows.activities.map(a => JSON.parse(a.content)))
})

test('sqlString doubles quotes and rejects NUL', () => {
  assert.equal(sqlString("it's"), "'it''s'")
  assert.equal(sqlString('back\\slash'), "'back\\slash'")
  assert.throws(() => sqlString('a\0b'))
})

test('a missing widget fails loudly unless --allow-missing', () => {
  const missing = file => (file === 'widgets/ai-or-not.html' ? null : stubWidget(file))
  assert.throws(() => buildRows(source, { readWidget: missing }), /Missing widget page widgets\/ai-or-not.html/)
  const warnings = []
  const skipped = buildRows(source, { readWidget: missing, allowMissing: true, warn: w => warnings.push(w) })
  // The page is used by both courses, so one activity drops from each.
  assert.equal(skipped.activities.length, rows.activities.length - rows.courses.length)
  assert.equal(warnings.length, 1)
})

test('no em dashes in the curriculum source or generated SQL', () => {
  const emDash = String.fromCharCode(0x2014)
  assert.ok(!readFileSync(new URL('../curriculum/ai-academy/course.json', import.meta.url), 'utf8').includes(emDash))
  assert.ok(!build().includes(emDash))
})
