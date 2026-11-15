import { useId } from 'react';
import { isLocalDemo } from '../shared/supabase.ts';
import { HtmlActivityPreview } from './HtmlActivity';
import Markdown, { defaultUrlTransform } from 'react-markdown';
import { activityTypes, embedUrl, slidesUrl, type Activity, type Lesson } from './model';

function safeUrl(url: string, key: string) {
  if (key === 'src' && /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(url)) return url;
  return defaultUrlTransform(url);
}

export function ActivityPreview({ activity, interactive = false }: { activity: Activity; interactive?: boolean }) {
  const previewId = useId();
  const embed = activity.type === 'video' ? embedUrl(activity.url) : activity.type === 'slides' ? slidesUrl(activity.url) : null;
  return <section className={'ic-article-activity' + (activity.type === 'content' ? '' : ' ic-article-exercise')}>
    <h3>{activity.title || activityTypes[activity.type]}</h3>
    {activity.markdown && <Markdown skipHtml urlTransform={safeUrl} components={{
      h1: 'h4', h2: 'h4', h3: 'h4',
      img: props => <img src={props.src} alt={props.alt || ''} loading="lazy" />,
    }}>{activity.markdown}</Markdown>}
    {activity.type === 'interactive_html' && activity.interactiveHtml &&
      <HtmlActivityPreview activity={activity.interactiveHtml} title={activity.title || 'HTML activity'} scripts={isLocalDemo} />}
    {embed && <iframe className="ic-video" src={embed} title={activity.title || activityTypes[activity.type]} allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />}
    {activity.type === 'code' && activity.code?.starter && <pre><code>{activity.code.starter}</code></pre>}
    {activity.questions.map((question, index) => question.prompt && <div key={index} className="ic-preview-question">
      <p id={previewId + '-prompt-' + index}>{question.prompt}</p>
      {question.choices.some(choice => choice.trim()) ? <ul className={interactive ? 'ic-preview-options' : undefined}
        role={interactive ? 'group' : undefined} aria-labelledby={interactive ? previewId + '-prompt-' + index : undefined}>
        {question.choices.filter(choice => choice.trim()).map((choice, choiceIndex) => <li key={choiceIndex}>
          {interactive ? <label className="ic-checkbox"><input type="radio" name={previewId + '-' + index} />{choice}</label> : choice}
        </li>)}</ul> : interactive
        ? <textarea aria-label={question.prompt} rows={3} placeholder="Write your answer…" />
        : <div className="ic-preview-response">Student response</div>}
    </div>)}
  </section>;
}

export function LessonPreview({ lesson, interactive = false }: { lesson: Lesson; interactive?: boolean }) {
  return <article className="ic-article">
    <h2>{lesson.title || 'Untitled lesson'}</h2>
    {lesson.activities.length ? lesson.activities.map(activity => <ActivityPreview key={activity.id} activity={activity} interactive={interactive} />) : <p className="ic-note">This lesson has no activities yet.</p>}
  </article>;
}
