// Class assignments: work an instructor builds and hands to one class.
// An assignment belongs to a class and can optionally point at a module.
import { embedUrl, id, slidesUrl } from '../model';

export const assignmentKinds = {
  quiz: { label: 'Quiz', detail: 'Questions with an answer key, graded automatically' },
  link: { label: 'Link or embed', detail: 'A video, doc, form or any web page' },
  html: { label: 'Interactive page', detail: 'Paste or upload your own HTML activity' },
  written: { label: 'Written response', detail: 'Prompts students answer in their own words' },
  code: { label: 'Code exercise', detail: 'Python with starter code and tests' },
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

export type ShowAnswers = 'after_submit' | 'after_due' | 'never';

export type Assignment = {
  id: string;
  kind: AssignmentKind;
  title: string;
  instructions: string;
  /** Total points. For quizzes this is the sum of question points. */
  points: number;
  /** ISO local date-time from <input type="datetime-local">, or null. */
  dueAt: string | null;
  /** null means unlimited. */
  attempts: number | null;
  /** Minutes, or null for no limit. */
  timeLimit: number | null;
  moduleId: string | null;
  published: boolean;
  createdAt: string;
  quiz: { questions: QuizQuestion[]; shuffle: boolean; showAnswers: ShowAnswers };
  link: { url: string };
  html: { html: string; reportsScore: boolean };
  written: { prompts: string[] };
  code: { starter: string; tests: string };
};

export function newQuestion(kind: QuestionKind = 'single'): QuizQuestion {
  const choices = kind === 'truefalse' ? ['True', 'False'] : kind === 'single' || kind === 'multiple' ? ['', '', ''] : [];
  return { id: id(), kind, prompt: '', points: 1, choices, correct: [], accepted: [], answer: null, tolerance: 0 };
}

export function newAssignment(kind: AssignmentKind): Assignment {
  return {
    id: id(), kind, title: 'Untitled ' + assignmentKinds[kind].label.toLowerCase(), instructions: '',
    points: kind === 'quiz' ? 1 : 10, dueAt: null, attempts: kind === 'quiz' ? 1 : null, timeLimit: null,
    moduleId: null, published: false, createdAt: new Date().toISOString(),
    quiz: { questions: kind === 'quiz' ? [newQuestion()] : [], shuffle: false, showAnswers: 'after_submit' },
    link: { url: '' },
    html: { html: '', reportsScore: true },
    written: { prompts: kind === 'written' ? [''] : [] },
    code: { starter: '', tests: '' },
  };
}

/** Copy with fresh ids, as a draft. */
export function duplicateAssignment(source: Assignment, title = source.title + ' (copy)'): Assignment {
  return {
    ...structuredClone(source), id: id(), title, published: false, createdAt: new Date().toISOString(),
    quiz: { ...structuredClone(source.quiz), questions: source.quiz.questions.map(q => ({ ...structuredClone(q), id: id() })) },
  };
}

export function totalPoints(assignment: Assignment) {
  return assignment.kind === 'quiz' ? assignment.quiz.questions.reduce((sum, q) => sum + (q.points || 0), 0) : assignment.points;
}

/** Where a link assignment renders: an embeddable URL, or null to open in a new tab. */
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

/** First problem that blocks publishing, or null. Drafts can be saved with problems. */
export function publishProblem(a: Assignment): string | null {
  if (!a.title.trim()) return 'Give the assignment a title.';
  if (a.kind === 'quiz') {
    if (!a.quiz.questions.length) return 'Add at least one question.';
    for (const [index, q] of a.quiz.questions.entries()) {
      const label = `Question ${index + 1}: `;
      if (!q.prompt.trim()) return label + 'add a prompt.';
      if (!(q.points > 0)) return label + 'give it at least 1 point.';
      if (q.kind === 'single' || q.kind === 'multiple' || q.kind === 'truefalse') {
        if (q.choices.filter(c => c.trim()).length < 2) return label + 'add at least two choices.';
        if (!q.correct.length || q.correct.some(i => !q.choices[i]?.trim())) return label + 'mark the correct answer.';
      }
      if (q.kind === 'short' && !q.accepted.some(a => a.trim())) return label + 'add at least one accepted answer.';
      if (q.kind === 'numeric' && q.answer === null) return label + 'enter the correct number.';
    }
  }
  if (a.kind === 'link' && !isHttpsUrl(a.link.url)) return 'Add a link that starts with https://.';
  if (a.kind === 'html' && !a.html.html.trim()) return 'Paste or upload the HTML page.';
  if (a.kind === 'written' && !a.written.prompts.some(p => p.trim())) return 'Add at least one prompt.';
  if (a.kind === 'code' && !a.instructions.trim()) return 'Describe the coding task in the instructions.';
  if (a.kind !== 'quiz' && !(a.points >= 0)) return 'Points must be zero or more.';
  return null;
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
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map(block => block.trim()).filter(Boolean);
  blocks.forEach((block, index) => {
    const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
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

/** Validates an exported assignment file and returns a fresh draft copy. */
export function parseAssignmentFile(text: string): Assignment {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('That file is not valid JSON.'); }
  const value = raw as Partial<Assignment> & { format?: string };
  if (value?.format !== 'cic-assignment-v1' || typeof value.kind !== 'string' || !(value.kind in assignmentKinds)) {
    throw new Error('Choose an assignment file exported from CIC Learn.');
  }
  const base = newAssignment(value.kind as AssignmentKind);
  const merged: Assignment = {
    ...base,
    title: String(value.title ?? base.title).slice(0, 200),
    instructions: String(value.instructions ?? '').slice(0, 20_000),
    points: Number.isFinite(value.points) ? Number(value.points) : base.points,
    attempts: value.attempts === null || Number.isInteger(value.attempts) ? value.attempts ?? null : base.attempts,
    timeLimit: value.timeLimit === null || Number.isInteger(value.timeLimit) ? value.timeLimit ?? null : null,
    quiz: { ...base.quiz, ...(value.quiz ?? {}) },
    link: { ...base.link, ...(value.link ?? {}) },
    html: { ...base.html, ...(value.html ?? {}) },
    written: { ...base.written, ...(value.written ?? {}) },
    code: { ...base.code, ...(value.code ?? {}) },
  };
  if (!Array.isArray(merged.quiz.questions)) throw new Error('The quiz questions in that file are not readable.');
  return duplicateAssignment(merged, merged.title);
}

export function exportAssignment(a: Assignment) {
  const { id: _id, createdAt: _created, moduleId: _module, published: _published, ...rest } = a;
  return JSON.stringify({ format: 'cic-assignment-v1', ...rest }, null, 2);
}

export type QuizResponse = Record<string, number[] | string>;

/** Scores one question: 1 for correct, 0 otherwise. Select-all needs the exact set. */
export function questionCorrect(q: QuizQuestion, response: number[] | string | undefined): boolean {
  if (response === undefined) return false;
  if (q.kind === 'short') return typeof response === 'string' && q.accepted.some(a => a.trim().toLowerCase() === response.trim().toLowerCase());
  if (q.kind === 'numeric') {
    const value = typeof response === 'string' ? Number(response) : NaN;
    return q.answer !== null && Number.isFinite(value) && Math.abs(value - q.answer) <= q.tolerance;
  }
  if (!Array.isArray(response)) return false;
  return response.length === q.correct.length && response.every(i => q.correct.includes(i));
}

export function gradeQuiz(questions: QuizQuestion[], responses: QuizResponse) {
  const possible = questions.reduce((sum, q) => sum + q.points, 0);
  const earned = questions.reduce((sum, q) => sum + (questionCorrect(q, responses[q.id]) ? q.points : 0), 0);
  return { earned, possible, percent: possible ? (earned / possible) * 100 : 0 };
}
