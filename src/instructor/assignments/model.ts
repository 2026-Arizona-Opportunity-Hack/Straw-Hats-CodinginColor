// Class assignments: work an instructor builds and hands to one class.
// An assignment is an ordered list of blocks (text, links and videos, interactive pages,
// questions, written prompts, code), so a video can be followed by questions about it.
// It belongs to a class and can optionally point at a module.
import { embedUrl, id, slidesUrl } from '../model';

/** Starting templates offered when creating an assignment. */
export const assignmentKinds = {
  quiz: { label: 'Quiz', detail: 'Questions with an answer key, graded automatically' },
  link: { label: 'Link or video', detail: 'A video, doc, form or web page, with questions about it' },
  html: { label: 'Interactive page', detail: 'Your own HTML activity, with optional questions' },
  written: { label: 'Written response', detail: 'Prompts students answer in their own words' },
  code: { label: 'Code exercise', detail: 'Python with starter code and tests' },
  file: { label: 'File upload', detail: 'Students turn in a PDF, document, image or zip' },
} as const;

export type AssignmentKind = keyof typeof assignmentKinds;

export const questionKinds = {
  single: 'Multiple choice',
  multiple: 'Select all that apply',
  truefalse: 'True or false',
  short: 'Short answer',
  numeric: 'Number',
} as const;

export type QuestionKind = keyof typeof questionKinds;

export type QuizQuestion = {
  id: string;
  kind: QuestionKind;
  prompt: string;
  points: number;
  /** Choice text for single / multiple / truefalse. */
  choices: string[];
  /** Indexes of correct choices. */
  correct: number[];
  /** Accepted answers for short answer (compared case-insensitively, trimmed). */
  accepted: string[];
  /** Numeric answer and allowed difference. */
  answer: number | null;
  tolerance: number;
};

/** One level of a rubric criterion, e.g. "Excellent: clear example, 5 points". */
export type RubricRating = { id: string; label: string; description: string; points: number };
export type RubricCriterion = { id: string; title: string; description: string; ratings: RubricRating[] };

/** File types an upload block can accept, by group. */
export const fileTypeGroups = {
  pdf: { label: 'PDF', accept: ['.pdf'] },
  document: { label: 'Word, Google Docs export, text', accept: ['.doc', '.docx', '.odt', '.rtf', '.txt', '.md'] },
  slides: { label: 'Slides', accept: ['.ppt', '.pptx', '.odp', '.key'] },
  image: { label: 'Images', accept: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic'] },
  code: { label: 'Code', accept: ['.py', '.ipynb', '.js', '.html', '.css', '.java', '.c', '.cpp'] },
  zip: { label: 'Zip', accept: ['.zip'] },
} as const;
export type FileTypeGroup = keyof typeof fileTypeGroups;
/** Upper limit enforced by the storage bucket (supabase/migrations/2003). */
export const MAX_UPLOAD_MB = 25;

export type Block =
  | { id: string; type: 'text'; text: string }
  | { id: string; type: 'link'; url: string; caption: string }
  | { id: string; type: 'html'; html: string; reportsScore: boolean; points: number }
  | { id: string; type: 'completion'; title: string; points: number }
  | { id: string; type: 'question'; question: QuizQuestion }
  | { id: string; type: 'written'; prompt: string; points: number; rubric?: RubricCriterion[] }
  | { id: string; type: 'code'; prompt: string; starter: string; tests: string; points: number; rubric?: RubricCriterion[] }
  | { id: string; type: 'file'; prompt: string; fileTypes: FileTypeGroup[]; maxFiles: number; maxSizeMb: number; points: number; rubric?: RubricCriterion[] };

/** Blocks the instructor grades by hand, and so can carry a rubric. */
export type RubricBlock = Extract<Block, { type: 'written' | 'code' | 'file' }>;
export const hasRubricSupport = (block: Block): block is RubricBlock => block.type === 'written' || block.type === 'code' || block.type === 'file';

export function newRating(label = '', points = 0): RubricRating {
  return { id: id(), label, description: '', points };
}

export function newCriterion(title = ''): RubricCriterion {
  return { id: id(), title, description: '', ratings: [newRating('Excellent', 5), newRating('Developing', 3), newRating('Missing', 0)] };
}

export const criterionMax = (c: RubricCriterion) => c.ratings.reduce((max, r) => Math.max(max, r.points || 0), 0);
export const rubricTotal = (rubric: RubricCriterion[] = []) => rubric.reduce((sum, c) => sum + criterionMax(c), 0);

export type BlockType = Block['type'];

export const blockLabels: Record<BlockType, string> = {
  text: 'Text',
  link: 'Link or video',
  html: 'Interactive page',
  completion: 'Lesson checkpoint',
  question: 'Question',
  written: 'Written response',
  code: 'Code exercise',
  file: 'File upload',
};

export type ShowAnswers = 'after_submit' | 'after_due' | 'never';

export type Assignment = {
  id: string;
  /** The template it started from; used as its type label in lists. */
  kind: AssignmentKind;
  title: string;
  instructions: string;
  /** ISO local date-time from <input type="datetime-local">, or null. */
  dueAt: string | null;
  /** null means unlimited. */
  attempts: number | null;
  /** Minutes, or null for no limit. */
  timeLimit: number | null;
  moduleId: string | null;
  published: boolean;
  createdAt: string;
  blocks: Block[];
  /** Shuffle the order of question blocks for each student. */
  shuffle: boolean;
  showAnswers: ShowAnswers;
};

export function newQuestion(kind: QuestionKind = 'single'): QuizQuestion {
  const choices = kind === 'truefalse' ? ['True', 'False'] : kind === 'single' || kind === 'multiple' ? ['', '', ''] : [];
  return { id: id(), kind, prompt: '', points: 1, choices, correct: [], accepted: [], answer: null, tolerance: 0 };
}

export function newBlock(type: Exclude<BlockType, 'completion'>, questionKind: QuestionKind = 'single'): Block {
  switch (type) {
    case 'text': return { id: id(), type, text: '' };
    case 'link': return { id: id(), type, url: '', caption: '' };
    case 'html': return { id: id(), type, html: '', reportsScore: true, points: 5 };
    case 'question': return { id: id(), type, question: newQuestion(questionKind) };
    case 'written': return { id: id(), type, prompt: '', points: 5 };
    case 'code': return { id: id(), type, prompt: '', starter: '', tests: '', points: 5 };
    case 'file': return { id: id(), type, prompt: '', fileTypes: ['pdf', 'document'], maxFiles: 1, maxSizeMb: 10, points: 10 };
  }
}

const templateBlocks: Record<AssignmentKind, () => Block[]> = {
  quiz: () => [newBlock('question')],
  link: () => [newBlock('link'), newBlock('question')],
  html: () => [newBlock('html')],
  written: () => [newBlock('written')],
  code: () => [newBlock('code')],
  file: () => [newBlock('file')],
};

export function newAssignment(kind: AssignmentKind): Assignment {
  return {
    id: id(), kind, title: 'Untitled ' + assignmentKinds[kind].label.toLowerCase(), instructions: '',
    dueAt: null, attempts: kind === 'quiz' ? 1 : null, timeLimit: null,
    moduleId: null, published: false, createdAt: new Date().toISOString(),
    blocks: templateBlocks[kind](), shuffle: false, showAnswers: 'after_submit',
  };
}

/** Same block with new ids. */
export function cloneBlock(block: Block): Block {
  const copy = { ...structuredClone(block), id: id() };
  if (copy.type === 'question') copy.question = { ...copy.question, id: id() };
  return copy;
}

/** Copy with fresh ids, as a draft. */
export function duplicateAssignment(source: Assignment, title = source.title + ' (copy)'): Assignment {
  return { ...structuredClone(source), id: id(), title, published: false, createdAt: new Date().toISOString(), blocks: source.blocks.filter(block => block.type !== 'completion').map(cloneBlock) };
}

export function blockPoints(block: Block) {
  if (block.type === 'question') return block.question.points || 0;
  // With a rubric, the block is worth the sum of each criterion's top rating.
  if (hasRubricSupport(block) && block.rubric?.length) return rubricTotal(block.rubric);
  return 'points' in block ? block.points || 0 : 0;
}

export function totalPoints(assignment: Assignment) {
  return assignment.blocks.reduce((sum, block) => sum + blockPoints(block), 0);
}

export const questionsOf = (assignment: Assignment) =>
  assignment.blocks.flatMap(block => (block.type === 'question' ? [block.question] : []));

/** One-line summary for lists, e.g. "Link · 3 questions". */
export function contentSummary(assignment: Assignment) {
  const counts = new Map<string, number>();
  for (const block of assignment.blocks) {
    if (block.type === 'text') continue;
    const label = block.type === 'question' ? 'question' : blockLabels[block.type].toLowerCase();
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const text = [...counts].map(([label, n]) => (n === 1 && label !== 'question' ? label : `${n} ${label}${n === 1 ? '' : 's'}`)).join(' · ') || 'empty';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Where a link block renders: an embeddable URL, or null to open in a new tab. */
export function linkEmbed(value: string): string | null {
  const known = embedUrl(value) || slidesUrl(value);
  if (known) return known;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com') return null;
    const doc = url.pathname.match(/^\/(document|spreadsheets)\/d\/([\w-]+)/);
    if (doc) return `https://docs.google.com/${doc[1]}/d/${doc[2]}/preview`;
    const form = url.pathname.match(/^\/forms\/d\/(e\/)?([\w-]+)/);
    if (form) return `https://docs.google.com/forms/d/${form[1] || ''}${form[2]}/viewform?embedded=true`;
  } catch {
    return null;
  }
  return null;
}

export function isHttpsUrl(value: string) {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

function questionProblem(q: QuizQuestion): string | null {
  if (!q.prompt.trim()) return 'add the question text.';
  if (!(q.points > 0)) return 'give it at least 1 point.';
  if (q.kind === 'single' || q.kind === 'multiple' || q.kind === 'truefalse') {
    if (q.choices.filter(c => c.trim()).length < 2) return 'add at least two choices.';
    if (!q.correct.length || q.correct.some(i => !q.choices[i]?.trim())) return 'mark the correct answer.';
  }
  if (q.kind === 'short' && !q.accepted.some(a => a.trim())) return 'add at least one accepted answer.';
  if (q.kind === 'numeric' && q.answer === null) return 'enter the correct number.';
  return null;
}

/** "Block 3 (Question 2)" style label used in messages. */
export function blockName(blocks: Block[], index: number) {
  const block = blocks[index];
  const name = block.type === 'question'
    ? `Question ${blocks.slice(0, index + 1).filter(b => b.type === 'question').length}`
    : block.type === 'completion' ? block.title : blockLabels[block.type];
  return `Block ${index + 1} (${name})`;
}

/** First problem that blocks publishing, or null. Drafts can be saved with problems. */
export function publishProblem(a: Assignment): string | null {
  if (!a.title.trim()) return 'Give the assignment a title.';
  if (!a.blocks.length) return 'Add at least one block.';
  for (const [index, block] of a.blocks.entries()) {
    const where = blockName(a.blocks, index) + ': ';
    if (block.type === 'text' && !block.text.trim()) return where + 'add some text or remove the block.';
    if (block.type === 'link' && !isHttpsUrl(block.url)) return where + 'add a link that starts with https://.';
    if (block.type === 'html' && !block.html.trim()) return where + 'paste or upload the HTML page.';
    if (block.type === 'written' && !block.prompt.trim()) return where + 'add a prompt.';
    if (block.type === 'code' && !block.prompt.trim()) return where + 'describe the coding task.';
    if (block.type === 'file') {
      if (!block.prompt.trim()) return where + 'say what students should upload.';
      if (!block.fileTypes.length) return where + 'allow at least one file type.';
    }
    if (hasRubricSupport(block)) {
      for (const [ci, criterion] of (block.rubric ?? []).entries()) {
        if (!criterion.title.trim()) return where + `give rubric criterion ${ci + 1} a name.`;
        if (!criterion.ratings.length) return where + `add at least one rating to "${criterion.title}".`;
        if (criterion.ratings.some(r => !r.label.trim())) return where + `name every rating in "${criterion.title}".`;
      }
    }
    if (block.type === 'question') {
      const problem = questionProblem(block.question);
      if (problem) return where + problem;
    }
  }
  return null;
}

/**
 * Reads assignments saved before blocks existed (one fixed type with quiz / link / html /
 * written / code fields) and newer block-based ones. Unknown input becomes an empty draft.
 */
export function normalizeAssignment(raw: Partial<Assignment> & Record<string, unknown>): Assignment {
  const kind = (typeof raw.kind === 'string' && raw.kind in assignmentKinds ? raw.kind : 'quiz') as AssignmentKind;
  const base = { ...newAssignment(kind), ...raw, kind } as Assignment & Record<string, unknown>;
  if (Array.isArray(raw.blocks)) {
    return { ...base, blocks: raw.blocks as Block[], shuffle: Boolean(raw.shuffle), showAnswers: (raw.showAnswers as ShowAnswers) ?? 'after_submit' };
  }
  const legacy = raw as Record<string, Record<string, unknown> | undefined>;
  const quiz = legacy.quiz ?? {};
  const questions = (Array.isArray(quiz.questions) ? quiz.questions : []) as QuizQuestion[];
  const points = typeof raw.points === 'number' ? raw.points as number : 10;
  const blocks: Block[] = [];
  if (kind === 'link') blocks.push({ id: id(), type: 'link', url: String(legacy.link?.url ?? ''), caption: '' });
  if (kind === 'html') blocks.push({ id: id(), type: 'html', html: String(legacy.html?.html ?? ''), reportsScore: legacy.html?.reportsScore !== false, points });
  if (kind === 'written') {
    const prompts = (Array.isArray(legacy.written?.prompts) ? legacy.written.prompts : ['']) as string[];
    prompts.forEach(prompt => blocks.push({ id: id(), type: 'written', prompt, points: Math.round(points / Math.max(prompts.length, 1)) }));
  }
  if (kind === 'code') blocks.push({ id: id(), type: 'code', prompt: String(raw.instructions ?? ''), starter: String(legacy.code?.starter ?? ''), tests: String(legacy.code?.tests ?? ''), points });
  // Match the legacy quiz IDs used by the student submission RPC.
  questions.forEach((question, index) => blocks.push({
    id: kind === 'quiz' ? 'legacy-question-' + (index + 1) : id(), type: 'question', question,
  }));
  for (const key of ['quiz', 'link', 'html', 'written', 'code', 'points']) delete base[key];
  return { ...base, blocks, shuffle: Boolean(quiz.shuffle), showAnswers: (quiz.showAnswers as ShowAnswers) ?? 'after_submit' };
}

/**
 * Parses the plain-text quiz format many quiz tools export (Moodle "Aiken"):
 *
 *   What does print(2 + 3) show?
 *   A. 23
 *   B. 5
 *   ANSWER: B
 *
 * Questions are separated by blank lines.
 */
export function parseQuizText(text: string): { questions: QuizQuestion[]; errors: string[] } {
  const questions: QuizQuestion[] = [];
  const errors: string[] = [];
  const chunks = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map(chunk => chunk.trim()).filter(Boolean);
  chunks.forEach((chunk, index) => {
    const lines = chunk.split('\n').map(line => line.trim()).filter(Boolean);
    const answerLine = lines.findIndex(line => /^ANSWER\s*:/i.test(line));
    const choiceLines = lines.filter(line => /^[A-Z][.)]\s+/.test(line));
    const prompt = lines.filter(line => !/^[A-Z][.)]\s+/.test(line) && !/^ANSWER\s*:/i.test(line)).join(' ');
    const where = `Question ${index + 1}`;
    if (!prompt) return errors.push(`${where}: missing the question text.`);
    if (choiceLines.length < 2) return errors.push(`${where}: needs at least two choices like "A. ...".`);
    if (answerLine < 0) return errors.push(`${where}: missing an "ANSWER: B" line.`);
    const letters = lines[answerLine].replace(/^ANSWER\s*:/i, '').toUpperCase().split(/[\s,]+/).filter(Boolean);
    const correct = letters.map(letter => choiceLines.findIndex(line => line[0].toUpperCase() === letter));
    if (!letters.length || correct.some(i => i < 0)) return errors.push(`${where}: the answer letter does not match a choice.`);
    questions.push({
      ...newQuestion(correct.length > 1 ? 'multiple' : 'single'),
      prompt: prompt.slice(0, 2000),
      choices: choiceLines.map(line => line.replace(/^[A-Z][.)]\s+/, '').slice(0, 500)),
      correct,
    });
  });
  return { questions, errors };
}

export const questionBlocks = (questions: QuizQuestion[]): Block[] => questions.map(question => ({ id: id(), type: 'question', question }));

/** Validates an exported assignment file (v1 or v2) and returns a fresh draft copy. */
export function parseAssignmentFile(text: string): Assignment {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('That file is not valid JSON.'); }
  const value = raw as Record<string, unknown>;
  if (!['cic-assignment-v1', 'cic-assignment-v2'].includes(String(value?.format)) || typeof value.kind !== 'string' || !(value.kind in assignmentKinds)) {
    throw new Error('Choose an assignment file exported from CIC Learn.');
  }
  const assignment = normalizeAssignment(value as Partial<Assignment> & Record<string, unknown>);
  if (!Array.isArray(assignment.blocks) || assignment.blocks.some(block => !block || !(block.type in blockLabels))) {
    throw new Error('The content in that file is not readable.');
  }
  return duplicateAssignment({
    ...assignment,
    title: String(assignment.title).slice(0, 200),
    instructions: String(assignment.instructions ?? '').slice(0, 20_000),
    attempts: assignment.attempts === null || Number.isInteger(assignment.attempts) ? assignment.attempts : null,
    timeLimit: assignment.timeLimit === null || Number.isInteger(assignment.timeLimit) ? assignment.timeLimit : null,
  }, String(assignment.title).slice(0, 200));
}

export function exportAssignment(a: Assignment) {
  const { id: _id, createdAt: _created, moduleId: _module, published: _published, ...rest } = a;
  return JSON.stringify({ format: 'cic-assignment-v2', ...rest }, null, 2);
}

export type QuizResponse = Record<string, number[] | string>;

/** Scores one question: 1 for correct, 0 otherwise. Select-all needs the exact set. */
export function questionCorrect(q: QuizQuestion, response: number[] | string | undefined): boolean {
  if (response === undefined) return false;
  if (q.kind === 'short') return typeof response === 'string' && !!response.trim()
    && q.accepted.some(a => a.trim().toLowerCase() === response.trim().toLowerCase());
  if (q.kind === 'numeric') {
    const value = typeof response === 'string' && response.trim() ? Number(response) : NaN;
    return q.answer !== null && Number.isFinite(value) && Math.abs(value - q.answer) <= q.tolerance;
  }
  if (!Array.isArray(response)) return false;
  return response.length === q.correct.length && new Set(response).size === response.length
    && response.every(i => q.correct.includes(i));
}

export function gradeQuiz(questions: QuizQuestion[], responses: QuizResponse) {
  const possible = questions.reduce((sum, q) => sum + q.points, 0);
  const earned = questions.reduce((sum, q) => sum + (questionCorrect(q, responses[q.id]) ? q.points : 0), 0);
  return { earned, possible, percent: possible ? (earned / possible) * 100 : 0 };
}
