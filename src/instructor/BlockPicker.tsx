import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  AlignLeft, BookOpen, CircleHelp, ClipboardList, Code2, FileText, ListChecks, MessageSquare, Monitor, Video,
} from 'lucide-react';
import { copyBlock, gradedTypes, newActivity, type Activity, type ActivityType } from './model';

const blocks = [
  { name: 'Text', detail: 'Explain a concept with headings, links, or images', type: 'content', icon: AlignLeft, keywords: 'article paragraph markdown' },
  { name: 'Worked example', detail: 'Show how to solve a problem step by step', type: 'content', icon: BookOpen, keywords: 'example walkthrough' },
  { name: 'Quiz', detail: 'Multiple-choice questions with a correct answer', type: 'check', icon: ListChecks, keywords: 'multiple choice knowledge check assessment' },
  { name: 'Open-ended question', detail: 'Ask students to respond in their own words', type: 'worksheet', icon: MessageSquare, keywords: 'free response writing reflection' },
  { name: 'Code exercise', detail: 'Set a coding task with starter code', type: 'code', icon: Code2, keywords: 'python practice' },
  { name: 'Worksheet', detail: 'Collect responses to a series of prompts', type: 'worksheet', icon: ClipboardList, keywords: 'form practice' },
  { name: 'Video', detail: 'Embed a YouTube, Vimeo, or Drive video', type: 'video', icon: Video, keywords: 'embed media' },
  { name: 'Slides', detail: 'Embed a Google Slides or Drive presentation', type: 'slides', icon: Monitor, keywords: 'embed deck' },
  { name: 'Pretest', detail: 'Capture a baseline before instruction', type: 'pretest', icon: FileText, keywords: 'assessment quiz' },
  { name: 'Post-test', detail: 'Measure learning after instruction', type: 'posttest', icon: FileText, keywords: 'posttest assessment quiz' },
  { name: 'Exit question', detail: 'End the lesson with a reflection', type: 'exit', icon: CircleHelp, keywords: 'reflection' },
] satisfies { name: string; detail: string; type: ActivityType; icon: typeof AlignLeft; keywords: string }[];

export function BlockPicker({ onPick, onClose, library }: {
  library: Activity[]; onPick: (activity: Activity) => void; onClose: (restoreFocus: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const options = [
    ...blocks.map(block => ({ ...block, key: block.name, saved: undefined as Activity | undefined })),
    ...library.map(saved => ({
      name: saved.title, detail: 'From My blocks', type: saved.type, icon: BookOpen, keywords: 'saved reusable', key: saved.id, saved,
    })),
  ];
  const matches = options.filter(block => `${block.name} ${block.detail} ${block.keywords}`.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    input.current?.focus();
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !popup.current?.parentElement?.contains(event.target)) onClose(false);
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [onClose]);

  function pick(block: typeof options[number]) {
    if (block.saved) return onPick(copyBlock(block.saved));
    const activity = { ...newActivity(block.type), title: block.name };
    if (block.name === 'Open-ended question') activity.format = 'open-ended';
    if (gradedTypes.has(block.type)) activity.questions[0].choices = ['', '', ''];
    onPick(activity);
  }

  function keys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
    }
    if (event.target !== input.current || !matches.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
      setIndex(next);
      popup.current?.querySelectorAll('button')[next]?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      pick(matches[index]);
    }
  }

  return <div className="ic-block-picker" role="dialog" aria-label="Insert a lesson block" ref={popup} onKeyDown={keys} onBlur={event => {
    if (event.relatedTarget instanceof Node && !event.currentTarget.parentElement?.contains(event.relatedTarget)) onClose(false);
  }}>
    <input ref={input} type="search" aria-label="Find a block" placeholder="Find a block…" value={query} onChange={event => { setQuery(event.target.value); setIndex(0); }} />
    <div className="ic-block-options">
      {matches.map((block, i) => <button type="button" key={block.key} className={i === index ? 'is-highlighted' : ''} onClick={() => pick(block)}>
        <block.icon size={18} aria-hidden="true" /><span><strong>{block.name}</strong><small>{block.detail}</small></span>
      </button>)}
      {!matches.length && <p className="ic-note" role="status">No blocks match.</p>}
    </div>
  </div>;
}
