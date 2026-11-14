import { useId, type ReactNode } from 'react';
import { ArrowLeft, X } from 'lucide-react';

export function PageHeader({ title, description, back, children }: {
  title: string; description?: string; back?: { label: string; to: string }; children?: ReactNode;
}) {
  return <header className="ic-page-header">
    <div>
      {back && <a className="ic-back" href={back.to}><ArrowLeft size={15} /> {back.label}</a>}
      <h1 tabIndex={-1} id="ic-page-title">{title}</h1>
      {description && <p>{description}</p>}
    </div>
    {children && <div className="ic-page-actions">{children}</div>}
  </header>;
}

export function Panel({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return <section className="ic-panel">
    {title && <header className="ic-panel-heading"><h2>{title}</h2>{actions}</header>}
    {children}
  </section>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="ic-empty">{children}</p>;
}

export function Dialog({ title, children, onClose, wide = false }: {
  title: string; children: ReactNode; onClose: () => void; wide?: boolean;
}) {
  const headingId = useId();
  return <dialog aria-labelledby={headingId} className={wide ? 'ic-dialog ic-dialog-wide' : 'ic-dialog'} ref={node => {
    if (node && !node.open) node.showModal();
  }} onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="ic-panel-heading"><h2 id={headingId}>{title}</h2><button type="button" className="ic-icon" onClick={onClose} aria-label="Close dialog"><X size={20} /></button></header>
    <div className="ic-dialog-content">{children}</div>
  </dialog>;
}

export async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
