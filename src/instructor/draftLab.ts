import type { CodingLabRequest, CodingLabResponse, DraftCodingLab } from '../shared/curriculum/codingLab'
import type { ReportProgress } from '../shared/curriculum/progress'
import { supabase } from '../shared/supabase'
import { newActivity, type Module } from './model'
import { requestCurriculum } from './requestCurriculum'

export type DraftLab = { lessonId: string; lab: DraftCodingLab; reviewNotes: string[] }

export function labActivity(lab: DraftCodingLab) {
  return { ...newActivity('code'), title: lab.title, markdown: lab.instructions,
    code: { starter: lab.starter.html, tests: '', solution: '', lab: {
      verifier: 'web-practice-v1' as const, language: 'web' as const, starterCss: lab.starter.css, checks: lab.checks,
    } },
  }
}

export function includeDraftLab(module: Module, selected: DraftLab | null): Module {
  if (!selected) return module
  return { ...module, published: false, lessons: module.lessons.map(lesson => {
    if (lesson.id !== selected.lessonId) return lesson
    const activities = [...lesson.activities]
    const beforePractice = activities.findIndex(activity => activity.type === 'worksheet' || activity.type === 'exit')
    activities.splice(beforePractice === -1 ? activities.length : beforePractice, 0, labActivity(selected.lab))
    return { ...lesson, activities }
  }) }
}

export function requestCodingLab(input: CodingLabRequest, signal: AbortSignal, report: ReportProgress) {
  if (supabase) return requestCurriculum<CodingLabResponse>(input, signal, report)
  const starter = { html: '<!doctype html><html lang="en"><head><title>Cafe Menu</title></head><body><main><h1>Cafe Menu</h1></main></body></html>',
    css: 'main { background: #eaf0e6; }' }
  const solution = { html: starter.html.replace('</head>', '<link rel="stylesheet" href="styles.css"></head>'),
    css: starter.css + '\nmain { padding: 20px; }' }
  return Promise.resolve<CodingLabResponse>({ lab: {
    title: 'Style a cafe menu',
    instructions: 'Link styles.css inside head and run the preview. Then set padding: 20px on main and check your work.',
    starter, solution,
    checks: [
      { kind: 'stylesheet', name: 'Link styles.css', expected: '', hint: 'Add the stylesheet link inside head.' },
      { kind: 'padding', name: 'Pad the menu', selector: 'main', expected: '20px', hint: 'Set padding: 20px on main.' },
    ],
  }, reviewNotes: ['Local example. Connect curriculum generation to build a lab with Sol.'] })
}
