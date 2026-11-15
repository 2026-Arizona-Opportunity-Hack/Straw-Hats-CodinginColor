import { describe, expect, it } from 'vitest';
import { copiedModuleIds } from './classCurriculum';
import { copyCourse, type Course, type Module } from './model';

const curriculum = (modules: Module[]): Course => ({
  id: 'source', title: 'Library course', level: 'Beginner', description: '', library: true, modules,
});

describe('copied module selection', () => {
  it('uses stored positions when the source read hides an intervening draft', () => {
    const first = { id: 'source-first', title: 'Workshop', published: true, lessons: [], position: 1 };
    const second = { ...first, id: 'source-second', position: 3 };
    const source = curriculum([first, second]);
    const copy = curriculum([
      { ...first, id: 'copy-first' },
      { ...first, id: 'copy-draft', published: false, position: 2 },
      { ...second, id: 'copy-second' },
    ]);

    expect(copiedModuleIds(source, copy, [second.id])).toEqual(['copy-second']);
    expect(copiedModuleIds(source, copy, [second.id, first.id])).toEqual(['copy-first', 'copy-second']);
  });

  it('keeps the selected module from a complete local course with no stored positions', () => {
    const first = { id: 'first', title: 'Start', published: true, lessons: [] };
    const draft = { id: 'draft', title: 'Draft', published: false, lessons: [] };
    const next = { id: 'next', title: 'Next', published: true, lessons: [] };
    const source = curriculum([first, draft, next]);
    const copy = copyCourse(source);

    expect(copiedModuleIds(source, copy, [next.id])).toEqual([copy.modules[2].id]);
    expect(copiedModuleIds(source, copy, [])).toEqual([]);
  });

  it('reports mismatches rather than silently assigning a different module', () => {
    const module = { id: 'source', title: 'Selected', published: true, lessons: [], position: 3 };
    const source = curriculum([module]);
    const copy = curriculum([{ ...module, id: 'different', title: 'Different' }]);

    expect(() => copiedModuleIds(source, copy, [module.id])).toThrow('The library modules changed');
    expect(() => copiedModuleIds(source, copy, ['missing'])).toThrow('The library modules changed');
  });
});
