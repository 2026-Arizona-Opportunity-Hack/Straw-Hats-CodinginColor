import type { Attempt, SavedAnswer } from './model';

type Json = Record<string, unknown>;
const object = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
const list = (value: unknown): Json[] => Array.isArray(value) ? value.map(object) : [];
const text = (value: unknown) => typeof value === 'string' ? value : '';

/** Read only student-input fields declared by the activity; never dump arbitrary JSON or answer keys. */
export function savedResponse(response: unknown, type: string, content: Json): Attempt['response'] {
  if (typeof response === 'string') return response; // Older/demo attempts.
  const saved = object(response);
  if (type === 'code') return typeof saved.code === 'string' ? [{ prompt: 'Submitted code', value: saved.code, code: true }] : undefined;
  const key = type === 'worksheet' ? 'fields' : ['pretest', 'posttest'].includes(type) ? 'answers' : null;
  const fields = key ? list(content[key === 'answers' ? 'items' : 'fields'])
    : ['check', 'exit'].includes(type) ? [{ id: list(content.choices).length ? 'choice_id' : 'text', prompt: content.prompt, choices: content.choices }] : [];
  const values = key ? object(saved[key]) : saved;
  const answers: SavedAnswer[] = fields.filter(field => typeof field.id === 'string').map((field, index) => {
    const value = Object.hasOwn(values, String(field.id)) ? text(values[String(field.id)]) : '';
    const choice = (type !== 'worksheet' || field.kind === 'multiple_choice')
      ? list(field.choices).find(choice => choice.id === value) : undefined;
    return { prompt: text(field.prompt) || `Question ${index + 1}`, value: choice ? text(choice.label) : value };
  });
  return answers.length ? answers : undefined;
}

/** Concept percentages must come from the same counted attempt as the displayed score. */
export function savedConceptScores(response: unknown, concepts: string[]): Record<string, number> | undefined {
  const allowed = new Set(concepts.map(concept => concept.trim()).filter(Boolean));
  const scores = Object.entries(object(object(response).concept_scores))
    .filter(([concept, score]) => allowed.has(concept.trim()) && typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 1)
    .map(([concept, score]) => [concept.trim(), (score as number) * 100]);
  return scores.length ? Object.fromEntries(scores) : undefined;
}
