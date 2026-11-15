// Owner: Jacky. Route /student/demo/:moduleId: plays a module an instructor published
// in the curriculum builder, step by step. Lesson buttons on the student home open it.
import { useParams } from 'react-router-dom'
import { LessonFlow } from './LessonFlow.tsx'

export function PublishedDemo() {
  const { moduleId = '' } = useParams()
  return <LessonFlow key={moduleId} moduleId={moduleId} />
}
