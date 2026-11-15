import { isLocalDemo } from '../shared/supabase.ts';
import { CicArticle } from '../shared/curriculum/CicArticle';
import { HtmlActivityPreview } from './HtmlActivity';
import Markdown from 'react-markdown';
import { curriculumUrl } from '../shared/ui/curriculumUrl';
import { activityTypes, embedUrl, slidesUrl, type Activity, type Lesson } from './model';

export function ActivityPreview({ activity }: { activity: Activity }) {
  const embed = activity.type === 'video' ? embedUrl(activity.url) : activity.type === 'slides' ? slidesUrl(activity.url) : null;
  if (activity.type === 'content' && activity.presentation === 'cic-article') {
    return <CicArticle title={activity.title || 'Read and explore'} markdown={activity.markdown} />;
  }
  return <section className={'ic-article-activity' + (activity.type === 'content' ? '' : ' ic-article-exercise')}>
    <h3>{activity.title || activityTypes[activity.type]}</h3>
    {activity.markdown && <Markdown skipHtml urlTransform={curriculumUrl} components={{
      h1: 'h4', h2: 'h4', h3: 'h4',
      img: props => <img src={props.src} alt={props.alt || ''} loading="lazy" />,
    }}>{activity.markdown}</Markdown>}
    {activity.type === 'interactive_html' && activity.interactiveHtml &&
      <HtmlActivityPreview activity={activity.interactiveHtml} title={activity.title || 'HTML activity'} scripts={isLocalDemo} />}
    {embed && <iframe className="ic-video" src={embed} title={activity.title || activityTypes[activity.type]} allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />}
    {activity.type === 'code' && activity.code?.starter && <pre><code>{activity.code.starter}</code></pre>}
    {activity.questions.map((question, index) => question.prompt && <div key={index} className="ic-preview-question">
      <p>{question.prompt}</p>
      {question.choices.some(choice => choice.trim()) ? <ul>
        {question.choices.filter(choice => choice.trim()).map((choice, choiceIndex) => <li key={choiceIndex}>{choice}</li>)}
      </ul> : <div className="ic-preview-response">Student response</div>}
    </div>)}
  </section>;
}

export function LessonPreview({ lesson }: { lesson: Lesson }) {
  return <article className="ic-article">
    <h2>{lesson.title || 'Untitled lesson'}</h2>
    {lesson.activities.length ? lesson.activities.map(activity => <ActivityPreview key={activity.id} activity={activity} />) : <p className="ic-note">This lesson has no activities yet.</p>}
  </article>;
}
