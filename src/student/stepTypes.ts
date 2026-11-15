// Owner: Jacky. How each kind of lesson step is named and drawn for students.
import {
  BookOpen, ClipboardList, Code2, Flag, HelpCircle, MonitorPlay, MousePointerClick, PenLine, Presentation, Trophy,
  type LucideIcon,
} from 'lucide-react'
import type { Activity, ActivityType } from '../instructor/model.ts'

export const STEP: Record<ActivityType, { label: string; icon: LucideIcon }> = {
  content: { label: 'Read', icon: BookOpen },
  video: { label: 'Watch', icon: MonitorPlay },
  slides: { label: 'Slides', icon: Presentation },
  interactive_html: { label: 'Try it', icon: MousePointerClick },
  check: { label: 'Quick check', icon: HelpCircle },
  worksheet: { label: 'Worksheet', icon: PenLine },
  code: { label: 'Code', icon: Code2 },
  exit: { label: 'Exit ticket', icon: Flag },
  pretest: { label: 'Warm-up quiz', icon: ClipboardList },
  posttest: { label: 'Final check', icon: Trophy },
}

const QUESTION_TYPES: ActivityType[] = ['check', 'worksheet', 'exit', 'pretest', 'posttest']

/** Steps the student must answer before Continue. Labs and widgets can be skipped (the runner may be offline). */
export const mustAnswer = (a: Activity) => QUESTION_TYPES.includes(a.type) && a.questions.some((q) => q.prompt.trim())
