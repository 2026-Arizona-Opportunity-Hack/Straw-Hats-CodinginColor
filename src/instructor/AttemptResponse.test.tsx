import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AttemptResponse } from './AttemptResponse';
import { savedConceptScores, savedResponse } from './attemptResponses';
import type { Attempt } from './model';

const attempt = (response: Attempt['response']): Attempt => ({ activityId: 'a', score: 75, minutes: 1, count: 3, submitted: true, response, responseAttempt: 3, scoreAttempt: 2 });

describe('saved response display', () => {
  it('escapes prompts, worksheet answers and code while distinguishing latest response from counted score', () => {
    const payload = '<img src=x onerror="alert(1)">';
    const html = renderToStaticMarkup(<AttemptResponse attempt={attempt([
      { prompt: '<script>prompt</script>', value: payload }, { prompt: 'Code', value: '<script>alert(1)</script>', code: true },
    ])} />);
    expect(html).toContain('Latest saved response · attempt 3 · Score counts attempt 2');
    expect(html).toContain('&lt;img');
    expect(html).toContain('<code>&lt;script&gt;alert(1)&lt;/script&gt;</code>');
    expect(html).not.toMatch(/<script|<img/);
  });

  it('shows legacy text, empty answers and only declared inputs for checks and exits', () => {
    expect(renderToStaticMarkup(<AttemptResponse attempt={attempt('line 1\nline 2')} />)).toContain('line 1\nline 2');
    expect(savedResponse({ choice_id: 'yes', solution: 'secret' }, 'check', { prompt: 'Ready?', answer: 'yes', choices: [{ id: 'yes', label: 'Yes' }] }))
      .toEqual([{ prompt: 'Ready?', value: 'Yes' }]);
    expect(savedResponse({ text: 'My reflection', hidden: 'secret' }, 'exit', { prompt: 'What changed?' }))
      .toEqual([{ prompt: 'What changed?', value: 'My reflection' }]);
    expect(savedResponse({ fields: { field: 'a' } }, 'worksheet', { fields: [{ id: 'field', kind: 'short_answer', prompt: 'Explain', choices: [{ id: 'a', label: 'Unused choice' }] }] }))
      .toEqual([{ prompt: 'Explain', value: 'a' }]);
    const missing = savedResponse({ fields: { field: { solution: 'secret' } } }, 'worksheet', { fields: [{ id: 'field', prompt: 'Explain' }] });
    expect(renderToStaticMarkup(<AttemptResponse attempt={attempt(missing)} />)).toContain('No answer');
    expect(savedResponse({ solution: 'secret' }, 'content', {})).toBeUndefined();
  });

  it('accepts only valid 0–1 concept scores from declared concepts', () => {
    expect(savedConceptScores({ concept_scores: { loops: 0.75, unknown: 1, bad: '1', outside: 1.5, infinite: Infinity, zero: 0 } },
      ['loops', 'bad', 'outside', 'infinite', 'zero'])).toEqual({ loops: 75, zero: 0 });
  });
});
