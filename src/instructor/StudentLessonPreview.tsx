import { DemoLesson } from '../student/DemoLesson'
import { LessonContent } from '../student/LessonContent'
import type { Lesson } from './model'
import { practiceAttempt, previewLesson } from './studentPreview'

export function StudentPreview({ lessons, moduleId, local }: { lessons: Lesson[]; moduleId: string; local: boolean }) {
  return <div className="ic-stack ic-student-preview">
    <p className="ic-note">Student preview of this draft. Answers here are practice only.</p>
    <div className="cic-student-lessons">
      {lessons.map((lesson, index) => local ? <DemoLesson lesson={lesson} key={lesson.id} />
        : <LessonContent key={lesson.id} lesson={previewLesson(lesson, moduleId, index)} onAttempt={practiceAttempt} />)}
    </div>
  </div>
}
