import { useEffect, useRef } from 'react'
import { basicSetup, EditorView } from 'codemirror'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { python } from '@codemirror/lang-python'

export function SourceEditor({ label, language, value, onChange }: {
  label: string; language: 'html' | 'css' | 'python'; value: string; onChange: (value: string) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const editor = useRef<EditorView | null>(null)
  const change = useRef(onChange)
  change.current = onChange
  const current = useRef(value)
  current.current = value
  useEffect(() => {
    if (!host.current) return
    const view = new EditorView({ parent: host.current, doc: current.current, extensions: [
      basicSetup, { html, css, python }[language](), EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'false' }),
      EditorView.updateListener.of(update => { if (update.docChanged && update.state.doc.toString() !== current.current) change.current(update.state.doc.toString()) }),
      EditorView.theme({ '&': { border: '1px solid #dcdedc', borderRadius: '6px' }, '.cm-content': { minHeight: '220px' }, '.cm-scroller': { maxHeight: '420px', overflow: 'auto' } }),
    ] })
    editor.current = view
    return () => { view.destroy(); editor.current = null }
  }, [label, language])
  useEffect(() => {
    const view = editor.current
    if (view && view.state.doc.toString() !== value) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
  }, [value])
  return <div ref={host} />
}
