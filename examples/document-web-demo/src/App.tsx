import { useState } from 'react'
import {
  DocumentEditor,
  createDocument,
  createParagraph,
  type DocumentEditorTheme,
  type IncantlyDocument,
} from '@incantly/canvas-react/document'
import '@incantly/canvas-react/document.css'

const demoDocument = createDocument({
  title: 'Continuous writing demo',
  content: [
    createParagraph({ text: 'Research notebook' }),
    createParagraph({ text: 'Select across this paragraph and the next one to test the continuous writing surface.' }),
    createParagraph({ text: 'The document has no built-in toolbar. A host application can add one anywhere it chooses.' }),
    createParagraph(),
  ],
})

export function App() {
  const [theme, setTheme] = useState<DocumentEditorTheme>('light')
  const [readonly, setReadonly] = useState(false)
  const [placeholder, setPlaceholder] = useState('Write the next finding…')
  const [document, setDocument] = useState<IncantlyDocument>(demoDocument)

  return (
    <main className="demo-shell" data-theme={theme}>
      <header className="demo-controls">
        <div>
          <strong>Document 11.2 playground</strong>
          <span>Continuous surface, responsive layout, placeholder, and themes</span>
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
      </header>

      <DocumentEditor
        document={document}
        theme={theme}
        readonly={readonly}
        placeholder={placeholder}
        aria-label="Research document"
        onChange={(nextDocument) => setDocument(nextDocument)}
      />

      <details className="demo-json">
        <summary>Canonical JSON</summary>
        <pre>{JSON.stringify(document, null, 2)}</pre>
      </details>
    </main>
  )
}
