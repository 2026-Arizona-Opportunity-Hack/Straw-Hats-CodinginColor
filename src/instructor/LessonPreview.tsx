import { useId } from 'react';
import { isLocalDemo } from '../shared/supabase.ts';
import { CodeLab } from '../shared/labs/CodeLab';
import { ActivityCard } from '../shared/ui/ActivityCard';
import { InlineText, LessonMarkdown } from '../shared/ui/LessonMarkdown';
import { activityKind, activityKinds, leadingHeading, lessonSummary, readMinutes } from '../shared/ui/lessonContent';
import { labPayload } from './labPayload';
import { HtmlActivityPreview } from './HtmlActivity';
import { activityTypes, embedUrl, slidesUrl, type Activity, type Lesson } from './model';

const letter = (index: number) => String.fromCharCode(65 + index);
// The builder pre-fills a block's title with its type name ("Article", "Custom HTML"); students get a friendlier one.
const titleOf = (activity: Activity) => activity.title && activity.title !== activityTypes[activity.type] ? activity.title
  : (activity.type === 'content' && leadingHeading(activity.markdown)) || activityKinds[activityKind(activity.type)].title;

function ActivityBody({ activity, interactive }: { activity: Activity; interactive: boolean }) {
  const previewId = useId();
  const title = titleOf(activity);
  const embed = activity.type === 'video' ? embedUrl(activity.url) : activity.type === 'slides' ? slidesUrl(activity.url) : null;
  const questions = activity.questions.filter(question => question.prompt);
  return <>
    {activity.markdown && <LessonMarkdown markdown={activity.markdown} title={title} />}
    {activity.type === 'interactive_html' && activity.interactiveHtml &&
      <HtmlActivityPreview activity={activity.interactiveHtml} title={title} scripts={isLocalDemo} device />}
    {embed && <div className="cic-video"><iframe src={embed} title={title} allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" /></div>}
    {activity.type === 'code' && (interactive
      ? <CodeLab payload={{ ...labPayload(activity), prompt: '' }} enabled={isLocalDemo} />
      : activity.code?.starter && <pre className="cic-code"><code>{activity.code.starter}</code></pre>)}
    {questions.length > 0 && <div>{questions.map((question, index) => {
      const promptId = `${previewId}-prompt-${index}`;
      const choices = question.choices.filter(choice => choice.trim());
      return <div key={index} className="cic-question">
        {questions.length > 1 && <p className="cic-question-count">Question {index + 1} of {questions.length}</p>}
        <p className="cic-question-prompt" id={promptId}><InlineText text={question.prompt} /></p>
        {choices.length ? interactive
          ? <div className="cic-options" role="radiogroup" aria-labelledby={promptId}>{choices.map((choice, choiceIndex) =>
            <label key={choiceIndex} className="cic-option"><input type="radio" name={`${previewId}-${index}`} /><span className="cic-option-text"><InlineText text={choice} /></span></label>)}
          </div>
          : <ol className="cic-options" aria-labelledby={promptId}>{choices.map((choice, choiceIndex) =>
            <li key={choiceIndex} className="cic-option is-static"><span className="cic-option-letter" aria-hidden="true">{letter(choiceIndex)}</span><span className="cic-option-text"><InlineText text={choice} /></span></li>)}
          </ol>
          : interactive
            ? <textarea className="cic-textarea" aria-labelledby={promptId} rows={4} placeholder="Write your answer…" />
            : <div className="cic-response-placeholder">Students write their answer here.</div>}
      </div>;
    })}</div>}
  </>;
}

/**
 * One activity as students see it. With `step` and `total` it renders as a lesson card;
 * without them (the builder's block list) it renders just the title and body.
 */
export function ActivityPreview({ activity, interactive = false, step, total }: { activity: Activity; interactive?: boolean; step?: number; total?: number }) {
  const kind = activityKind(activity.type);
  if (!step || !total) return <div>
    <h3 className="cic-card-title">{titleOf(activity)}</h3>
    <div className="cic-card-body"><ActivityBody activity={activity} interactive={interactive} /></div>
  </div>;
  return <ActivityCard id={'step-' + activity.id} kind={kind} title={titleOf(activity)} step={step} total={total}
    minutes={kind === 'read' && activity.markdown ? readMinutes(activity.markdown) : undefined}>
    <ActivityBody activity={activity} interactive={interactive} />
  </ActivityCard>;
}

export function LessonPreview({ lesson, interactive = false }: { lesson: Lesson; interactive?: boolean }) {
  const headingId = useId();
  const total = lesson.activities.length;
  return <article className="cic-lesson" aria-labelledby={headingId}>
    <header className="cic-lesson-head">
      <h2 className="cic-lesson-title" id={headingId}>{lesson.title || 'Untitled lesson'}</h2>
      {total > 0 && <p className="cic-lesson-meta">{lessonSummary(lesson.activities)}</p>}
    </header>
    {total ? lesson.activities.map((activity, index) => <ActivityPreview key={activity.id} activity={activity} interactive={interactive} step={index + 1} total={total} />)
      : <p className="cic-note">This lesson has no activities yet.</p>}
  </article>;
}
