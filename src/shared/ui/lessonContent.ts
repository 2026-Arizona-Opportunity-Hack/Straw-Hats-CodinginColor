// Plain helpers for the lesson reading view (kept out of component files for fast refresh).
import {
  BookOpen, ClipboardCheck, ClipboardList, CodeXml, Flag, ListChecks, MonitorPlay, MousePointerClick,
  Presentation, Ticket, type LucideIcon,
} from 'lucide-react'

export type ActivityKind = 'read' | 'watch' | 'slides' | 'interactive' | 'check' | 'worksheet' | 'code' | 'pretest' | 'posttest' | 'exit'

export const activityKinds: Record<ActivityKind, { label: string; title: string; icon: LucideIcon }> = {
  read: { label: 'Read', title: 'Reading', icon: BookOpen },
  watch: { label: 'Watch', title: 'Video', icon: MonitorPlay },
  slides: { label: 'Slides', title: 'Slides', icon: Presentation },
  interactive: { label: 'Interactive', title: 'Interactive activity', icon: MousePointerClick },
  check: { label: 'Check', title: 'Quick check', icon: ListChecks },
  worksheet: { label: 'Worksheet', title: 'Worksheet', icon: ClipboardList },
  code: { label: 'Code', title: 'Code exercise', icon: CodeXml },
  pretest: { label: 'Pretest', title: 'Pretest', icon: ClipboardCheck },
  posttest: { label: 'Post-test', title: 'Post-test', icon: Flag },
  exit: { label: 'Exit ticket', title: 'Exit ticket', icon: Ticket },
}

const kindByType: Record<string, ActivityKind> = {
  content: 'read', video: 'watch', slides: 'slides', interactive_html: 'interactive', check: 'check',
  worksheet: 'worksheet', code: 'code', pretest: 'pretest', posttest: 'posttest', exit: 'exit',
}

/** Maps an activity type from either data model to its card style. */
export const activityKind = (type: string): ActivityKind => kindByType[type] ?? 'read'

/** Whole minutes to read at about 200 words a minute, never less than 1. */
export function readMinutes(markdown: string) {
  const words = markdown.replace(/[#>*_`|[\]()-]/g, ' ').split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}

/** The text of a leading # or ## heading, used as a card title when an activity has none. */
export function leadingHeading(markdown: string) {
  const firstLine = markdown.trimStart().split('\n', 1)[0]
  return firstLine.match(/^#{1,2}[ \t]+(.+?)[ \t#]*$/)?.[1].replace(/[*_`]/g, '').trim() || undefined
}

/** "4 steps · about 6 min of reading" for a lesson header. */
export function lessonSummary(activities: { type: string; markdown?: string }[]) {
  const steps = activities.length
  const reading = activities.reduce((sum, activity) => sum + (activity.type === 'content' && activity.markdown ? readMinutes(activity.markdown) : 0), 0)
  return [`${steps} ${steps === 1 ? 'step' : 'steps'}`, reading ? `about ${reading} min of reading` : ''].filter(Boolean).join(' · ')
}

