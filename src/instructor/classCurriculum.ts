import type { Course } from './model';

/** Forward the selection in source course order, even when draft rows are hidden on the source. */
export function copiedModuleIds(source: Course, copy: Course, selectedIds: readonly string[]): string[] {
  const selected = new Set(selectedIds);
  const fullSource = source.modules.length === copy.modules.length;
  const copiedByPosition = new Map(copy.modules.map(module => [module.position, module]));
  const sourceChanged = 'The library modules changed. Reload the class setup and select the modules again.';

  const mapped = source.modules.flatMap((module, index) => {
    if (!selected.has(module.id)) return [];
    // Full snapshots share an order in both the database and the local demo.
    // A library read can omit drafts, so its shorter array needs database positions.
    const match = fullSource ? copy.modules[index]
      : module.position == null ? undefined : copiedByPosition.get(module.position);
    if (!match || match.title !== module.title || match.published !== module.published) throw new Error(sourceChanged);
    return [match.id];
  });
  if (mapped.length !== selected.size) throw new Error(sourceChanged);
  return mapped;
}
