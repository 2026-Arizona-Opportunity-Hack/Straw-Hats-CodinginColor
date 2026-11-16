import { demoData } from '../instructor/demoData'
import type { ClassGroup, Course } from '../instructor/model'

export function seedWalkthrough(): { course: Course; classes: ClassGroup[] } {
  const { courses, classes } = structuredClone(demoData)
  const course = courses.find(item => item.id === 'python')!
  const primaryClass = classes.find(item => item.id === 'maryvale')!
  const [variables] = course.modules
  const [lesson] = variables.lessons
  lesson.activities = lesson.activities.filter(activity => activity.type !== 'code' && activity.type !== 'exit')
  const warmup = lesson.activities.find(activity => activity.type === 'pretest')!
  const final = lesson.activities.find(activity => activity.type === 'posttest')!
  warmup.title = 'Warm-up'
  warmup.questions = [{ prompt: 'If points = 2, what value does points hold?', choices: ['0', '2', 'points'], answer: 1, concept: 'Variables' }]
  final.title = 'Final check'
  final.questions = [{ prompt: 'Coins starts at 3. After coins = coins + 2, what does coins hold?', choices: ['2', '3', '5'], answer: 2, concept: 'Variables' }]

  const names = ['Riley Solano', 'Anika Brook', 'Jules Reyes', 'Dev Patel', 'Nia Serrano', 'Cameron Wells', 'Mika Reed', 'Sam Vega']
  const secondClass = structuredClone(primaryClass)
  secondClass.id = 'demo-juniper-arroyo'
  secondClass.name = 'CS Foundations · Period 2'
  secondClass.school = 'Juniper Arroyo High School'
  secondClass.learners = secondClass.learners.slice(0, 5).map((learner, index) => ({
    ...learner, id: 'juniper-' + index, name: ['Avery Lune', 'Kai Marin', 'Tess Flores', 'Ellis Oak', 'Zoe Quill'][index],
  }))
  secondClass.assignments = []
  secondClass.submissions = []

  primaryClass.id = 'demo-copper-mesa'
  primaryClass.name = 'CS Foundations · Period 3'
  primaryClass.school = 'Copper Mesa High School'
  primaryClass.learners = primaryClass.learners.map((learner, index) => ({ ...learner, name: names[index] }))
  primaryClass.learners[0] = { ...primaryClass.learners[0], attempts: [], baseline: null, lastActive: null }

  const rules = { inactiveDays: 5, lowScorePct: 60, passMark: { variables: 70, loops: 70 }, maxTries: { variables: 3, loops: 3 } }
  return { course, classes: [{ ...primaryClass, rules }, { ...secondClass, rules }] }
}
