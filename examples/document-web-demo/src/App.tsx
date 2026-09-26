import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DocumentEditor,
  DocumentExportMenu,
  DocumentPageView,
  PageSettings,
  createDocument,
  createParagraph,
  downloadExport,
  printDocumentPdf,
  renderPagedPreview,
  type DocumentEditorTheme,
  type IncantlyDocument,
  type ExportResult,
} from './editor/index.js'
import './editor/document.css'

const demoDocument = createDocument({
  title: 'Continuous writing demo',
  content: [
    createParagraph({ text: 'Research notebook' }),
    createParagraph({ text: 'Select across this paragraph and the next one to test the continuous writing surface.' }),
    createParagraph({ text: 'The document has no built-in toolbar. A host application can add one anywhere it chooses.' }),
    createParagraph(),
  ],
})

export function PdfPreview({ value, onError }: { value: IncantlyDocument; onError: (error: unknown) => void }) {
  const targetRef = useRef<HTMLDivElement>(null)
  const [pages, setPages] = useState<number | null>(null)
  const [rendering, setRendering] = useState(true)
  useEffect(() => {
    let cancelled = false
    setRendering(true)
    setPages(null)
    const target = targetRef.current
    if (!target) return undefined
    void renderPagedPreview(target, value).then(
      (result) => { if (!cancelled) { setPages(result.totalPages); setRendering(false) } },
      (error: unknown) => { if (!cancelled) { setRendering(false); onError(error) } },
    )
    return () => { cancelled = true; target.replaceChildren() }
    // Re-render only when the document changes; the error reporter is stable enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <div className="demo-pdf-preview">
      {rendering && <span>Rendering paginated preview…</span>}
      {pages !== null && <span>{pages} page{pages === 1 ? '' : 's'} · paper, margins, and breaks from page setup</span>}
      <div ref={targetRef} className="demo-pdf-pages" aria-label="PDF page preview" />
    </div>
  )
}

export function App() {
  const [theme, setTheme] = useState<DocumentEditorTheme>('light')
  const [readonly, setReadonly] = useState(false)
  const [placeholder, setPlaceholder] = useState('Write the next finding…')
  const [document, setDocument] = useState<IncantlyDocument>(demoDocument)
  const [toolbar, setToolbar] = useState(true)
  const [events, setEvents] = useState<string[]>([])
  const [lastExport, setLastExport] = useState<ExportResult | null>(null)
  const stats = useMemo(() => { const json = JSON.stringify(document); return { characters: json.length, nodes: (json.match(/"type":/g) ?? []).length } }, [document])
  const updateDocument = (next: IncantlyDocument) => { setDocument(next); setEvents((items) => [`${new Date().toLocaleTimeString()} change`, ...items].slice(0, 30)) }
  const loadLarge = () => setDocument(createDocument({ title: 'Large benchmark', content: Array.from({ length: 1000 }, (_, index) => createParagraph({ text: `Paragraph ${index + 1}: ${'representative research text '.repeat(8)}` })) }))
  const downloadLastExport = () => {
    if (!lastExport) return
    if (lastExport.format === 'pdf') {
      // PDF is a system-print flow: render off-screen, then open the dialog.
      void printDocumentPdf(document).catch((error: unknown) => window.alert(error instanceof Error ? error.message : 'Export failed'))
      return
    }
    downloadExport(lastExport)
  }

  return (
    <main className="demo-shell" data-theme={theme}>
      <header className="demo-controls">
        <div>
          <strong>Document 11.3 playground</strong>
          <span>Continuous surface and Milestone 11.3 formatting UI—type “/” for block commands</span>
        </div>
        <label>
          Placeholder
          <input value={placeholder} onChange={(event) => setPlaceholder(event.target.value)} />
        </label>
        <button type="button" onClick={() => setTheme((value) => value === 'light' ? 'dark' : 'light')}>
          {theme === 'light' ? 'Use dark theme' : 'Use light theme'}
        </button>
        <button type="button" aria-pressed={readonly} onClick={() => setReadonly((value) => !value)}>
          {readonly ? 'Enable editing' : 'Make read-only'}
        </button>
        <button type="button" onClick={() => setToolbar((value) => !value)}>Toggle toolbar</button>
        <button type="button" onClick={() => setDocument(demoDocument)}>Reset fixture</button>
        <button type="button" onClick={loadLarge}>Load large fixture</button>
        <button type="button" onClick={() => localStorage.setItem('incantly-document-demo', JSON.stringify(document))}>Save locally</button>
        <button type="button" onClick={() => { const value = localStorage.getItem('incantly-document-demo'); if (value) setDocument(JSON.parse(value) as IncantlyDocument) }}>Reload local</button>
      </header>

      <DocumentExportMenu document={document} download={false} onExport={(result) => { setLastExport(result); setEvents((items) => [`${new Date().toLocaleTimeString()} exported ${result.format}`, ...items].slice(0, 30)) }} onError={(error) => window.alert(error instanceof Error ? error.message : 'Export failed')} />
      {lastExport && <section className="demo-export-preview" aria-live="polite"><strong>Export preview: {lastExport.format.toUpperCase()}</strong><span>{lastExport.filename} · {lastExport.mimeType}</span>{lastExport.format === 'pdf' ? <PdfPreview value={document} onError={(error) => window.alert(error instanceof Error ? error.message : 'Export failed')} /> : lastExport.output.kind === 'text' ? lastExport.format === 'html' ? <iframe title="HTML export preview" srcDoc={lastExport.output.text} /> : <pre>{lastExport.output.text.slice(0, 4000)}</pre> : <span>{lastExport.output.bytes.byteLength.toLocaleString()} bytes generated</span>}<div className="demo-download-row"><button type="button" onClick={downloadLastExport}>{lastExport.format === 'pdf' ? 'Print / Save as PDF' : `Download ${lastExport.filename}`}</button></div></section>}
      <PageSettings className="demo-page-settings" value={document.metadata.pageSetup} onChange={(pageSetup) => updateDocument({ ...document, metadata: { ...document.metadata, pageSetup } })} />

      <DocumentPageView pageSetup={document.metadata.pageSetup} title={document.metadata.title} className="demo-page">
        <DocumentEditor
          document={document}
          theme={theme}
          readonly={readonly}
          placeholder={placeholder}
          ui={toolbar ? 'formatting' : 'none'}
          aria-label="Research document"
          onChange={(nextDocument) => updateDocument(nextDocument)}
          onSelectionChange={() => setEvents((items) => [`${new Date().toLocaleTimeString()} selection`, ...items].slice(0, 30))}
        />
      </DocumentPageView>

      <aside className="demo-diagnostics"><strong>Diagnostics</strong><span>Schema {document.schemaVersion}</span><span>{stats.nodes} nodes</span><span>{stats.characters} serialized characters</span><ol>{events.map((event, index) => <li key={`${event}-${index}`}>{event}</li>)}</ol></aside>

      <details className="demo-json">
        <summary>Canonical JSON</summary>
        <pre>{JSON.stringify(document, null, 2)}</pre>
      </details>
    </main>
  )
}
