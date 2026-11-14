import { Code2, FileText, Globe, ListChecks, MonitorPlay } from 'lucide-react';

export const kindIcon = { quiz: ListChecks, link: Globe, html: MonitorPlay, written: FileText, code: Code2 } as const;

export function formatDue(value: string | null) {
  if (!value) return 'No due date';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'No due date'
    : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
