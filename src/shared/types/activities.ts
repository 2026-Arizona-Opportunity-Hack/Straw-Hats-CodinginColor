// Per-type payload stored in activities.content (jsonb).
// Owner: Aryan. Adding a new type: add it here, in ActivityType, and in the
// `activity_type` enum in a new migration.

export type ActivityType =
  | 'content'
  | 'video'
  | 'slides'
  | 'check'
  | 'worksheet'
  | 'code'
  | 'interactive_html'
  | 'exit'
  | 'pretest'
  | 'posttest'

export interface ContentPayload {
  /** Markdown, rendered sanitized. zyBooks-style text section. */
  markdown: string
}

export interface VideoPayload {
  /** YouTube, Vimeo or Google Drive URL. */
  url: string
  caption?: string
  transcript?: string
}

export interface Choice {
  id: string
  label: string
}

export interface CheckPayload {
  prompt: string
  choices: Choice[]
  /** Hidden from students by RLS; graded server-side. */
  answer?: string
  explanation?: string
}

export type WorksheetField =
  | { id: string; kind: 'short_answer'; prompt: string }
  | { id: string; kind: 'long_answer'; prompt: string }
  | { id: string; kind: 'multiple_choice'; prompt: string; choices: Choice[] }
  | { id: string; kind: 'fill_blank'; prompt: string }

export interface WorksheetPayload {
  title: string
  fields: WorksheetField[]
  discussion_enabled?: boolean
}

export type DiscussionNote = { id: string; answers: Record<string, string> }
export type DiscussionState = { enabled: boolean; shared: boolean; notes: DiscussionNote[] }

export interface CodeTest {
  name: string
  /** Python assertion run after the student's code. */
  assertion: string
}

export interface LabCheck {
  name: string
  expected: string
  selector?: string
}

export interface CodingLabSettings {
  language: 'python' | 'web'
  verifier?: 'cat-photo-v1'
  starterCss?: string
  checks: LabCheck[]
}

export interface CodePayload {
  prompt: string
  starter_code: string
  lab?: CodingLabSettings
  tests: CodeTest[]
  /** Hidden from students by RLS. */
  solution?: string
}

/**
 * Instructor-authored HTML page (often generated with an AI assistant).
 * Rendered ONLY inside <InteractiveHtmlFrame>, a sandboxed iframe with no
 * access to the app's origin, cookies or session.
 */
export interface InteractiveHtmlPayload {
  html: string
  /** Shown above the frame. */
  instructions?: string
  /**
   * true: the page must post { type: 'cic:complete', score } to count as done.
   * false: the student clicks "Mark as done".
   */
  reports_score: boolean
}

export interface ExitPayload {
  prompt: string
  choices?: Choice[]
}

export interface AssessmentItem {
  id: string
  concept: string
  prompt: string
  choices: Choice[]
  answer?: string
}

export interface AssessmentPayload {
  items: AssessmentItem[]
}

export interface ActivityPayloads {
  content: ContentPayload
  video: VideoPayload
  slides: VideoPayload
  check: CheckPayload
  worksheet: WorksheetPayload
  code: CodePayload
  interactive_html: InteractiveHtmlPayload
  exit: ExitPayload
  pretest: AssessmentPayload
  posttest: AssessmentPayload
}

export type ActivityContent<T extends ActivityType = ActivityType> = ActivityPayloads[T]

/** Message an interactive HTML page posts to the platform when the student finishes. */
export interface InteractiveCompleteMessage {
  type: 'cic:complete'
  /** 0..1 */
  score?: number
}
