// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { createRef, type CSSProperties } from 'react'
import { renderToString } from 'react-dom/server'
import { createDocument, createParagraph, type IncantlyDocument } from '@incantly/canvas/document'
import {
  DocumentEditor,
  documentRichCommands,
  type DocumentEditorRef,
} from '../src/document/index.js'

const documentFixture = (id: string, text: string) => createDocument({
  id,
  now: '2026-09-21T10:00:00.000Z',
  content: [createParagraph({ id: `node:${id}`, text })],
})

describe('<DocumentEditor />', () => {
  it('initializes an uncontrolled document and exposes the imperative API', async () => {
    const ref = createRef<DocumentEditorRef>()
    const onReady = vi.fn()
    const initialDocument = documentFixture('document:initial', 'Initial text')
    const { container } = render(
      <DocumentEditor ref={ref} initialDocument={initialDocument} onReady={onReady} aria-label="Research document" />,
    )

    await waitFor(() => expect(ref.current?.editor).toBeTruthy())
    expect(onReady).toHaveBeenCalledTimes(1)
    expect(ref.current?.getDocument()).toEqual(initialDocument)
    expect(container.querySelector('.ProseMirror')?.getAttribute('aria-label')).toBe('Research document')
    expect(container.querySelector('.ProseMirror')?.getAttribute('role')).toBe('textbox')
    expect(ref.current?.queryState((editor) => editor.getText())).toBe('Initial text')
  })

  it('keeps the Editor instance stable across ordinary prop and callback changes', async () => {
    const ref = createRef<DocumentEditorRef>()
    const firstChange = vi.fn()
    const secondChange = vi.fn()
    const { rerender, container } = render(
      <DocumentEditor ref={ref} initialDocument={documentFixture('document:stable', 'Stable')} onChange={firstChange} />,
    )
    await waitFor(() => expect(ref.current?.editor).toBeTruthy())
    const editor = ref.current?.editor

    rerender(
      <DocumentEditor ref={ref} initialDocument={documentFixture('document:ignored', 'Ignored')} onChange={secondChange}
        readonly className="updated" aria-label="Readonly document" />,
    )

    expect(ref.current?.editor).toBe(editor)
    expect(editor?.isEditable).toBe(false)
    expect(container.firstElementChild?.classList.contains('updated')).toBe(true)
    expect(container.querySelector('.ProseMirror')?.getAttribute('aria-readonly')).toBe('true')
    expect(ref.current?.getDocument()?.id).toBe('document:stable')
  })

  it('updates controlled documents, including identity changes, without recreating the Editor', async () => {
    const ref = createRef<DocumentEditorRef>()
    const first = documentFixture('document:one', 'One')
    const sameIdentity = { ...first, content: [createParagraph({ id: 'node:document:one', text: 'Updated' })] }
    const nextIdentity = documentFixture('document:two', 'Two')
    const { rerender } = render(<DocumentEditor ref={ref} document={first} />)
    await waitFor(() => expect(ref.current?.editor).toBeTruthy())
    const editor = ref.current?.editor

    rerender(<DocumentEditor ref={ref} document={sameIdentity} />)
    await waitFor(() => expect(ref.current?.getDocument().content[0]).toMatchObject({ content: [{ text: 'Updated' }] }))
    expect(ref.current?.editor).toBe(editor)

    rerender(<DocumentEditor ref={ref} document={nextIdentity} />)
    await waitFor(() => expect(ref.current?.getDocument()?.id).toBe('document:two'))
    expect(ref.current?.editor).toBe(editor)
    expect(ref.current?.queryState((activeEditor) => activeEditor.getText())).toBe('Two')
  })

  it('emits canonical change, transaction, and selection callbacks', async () => {
    const ref = createRef<DocumentEditorRef>()
    const onChange = vi.fn()
    const onTransaction = vi.fn()
    const onSelectionChange = vi.fn()
    render(
      <DocumentEditor ref={ref} initialDocument={documentFixture('document:events', 'Hello')}
        onChange={onChange} onTransaction={onTransaction} onSelectionChange={onSelectionChange} />,
    )
    await waitFor(() => expect(ref.current?.editor).toBeTruthy())

    act(() => { ref.current?.executeCommand((editor) => editor.commands.insertContent('!')) })
    expect(onChange).toHaveBeenCalled()
    expect(onChange.mock.calls.at(-1)[1]).toMatchObject({ mode: 'incremental', origin: 'user' })
    expect(onTransaction).toHaveBeenCalled()

    act(() => { ref.current?.executeCommand((editor) => editor.commands.setTextSelection({ from: 1, to: 3 })) })
    expect(onSelectionChange).toHaveBeenCalledWith(
      expect.objectContaining({ from: 1, to: 3, empty: false }),
      ref.current?.editor,
    )
  })

  it('supports explicit replacement and destroy-safe imperative methods', async () => {
    const ref = createRef<DocumentEditorRef>()
    const onChange = vi.fn()
    render(<DocumentEditor ref={ref} initialDocument={documentFixture('document:old', 'Old')} onChange={onChange} />)
    await waitFor(() => expect(ref.current?.editor).toBeTruthy())

    expect(ref.current?.replaceDocument(documentFixture('document:new', 'New'), { emitChange: true })).toBe(true)
    expect(ref.current?.getDocument()?.id).toBe('document:new')
    expect(onChange.mock.calls.at(-1)[1]).toMatchObject({ mode: 'checkpoint', checkpointReason: 'forced' })

    act(() => { ref.current?.destroy() })
    expect(ref.current?.editor).toBeNull()
    expect(ref.current?.focus()).toBe(false)
    expect(ref.current?.getDocument()).toBeNull()
    expect(ref.current?.replaceDocument(documentFixture('document:later', 'Later'))).toBe(false)
  })

  it('renders the responsive writing surface and switches its independent theme', async () => {
    const ref = createRef<DocumentEditorRef>()
    const initialDocument = documentFixture('document:surface', 'First paragraph')
    const { container, rerender } = render(
      <DocumentEditor ref={ref} initialDocument={initialDocument} theme="light" className="host-surface"
        style={{ '--incantly-document-content-width': '42rem' } as CSSProperties} />,
    )
    await waitFor(() => expect(ref.current?.editor).toBeTruthy())
    const editor = ref.current?.editor
    const host = container.querySelector('[data-incantly-document-editor]')

    expect(host?.classList.contains('incantly-document-editor')).toBe(true)
    expect(host?.classList.contains('host-surface')).toBe(true)
    expect(host?.getAttribute('data-theme')).toBe('light')
    expect((host as HTMLElement | null)?.style.getPropertyValue('--incantly-document-content-width')).toBe('42rem')
    expect(container.querySelector('.incantly-document-editor__content .ProseMirror')).toBeTruthy()

    rerender(<DocumentEditor ref={ref} initialDocument={initialDocument} theme="dark" />)
    expect(ref.current?.editor).toBe(editor)
    expect(container.querySelector('[data-incantly-document-editor]')?.getAttribute('data-theme')).toBe('dark')
  })

  it('uses transient, updateable placeholders without persisting them', async () => {
    const ref = createRef<DocumentEditorRef>()
    const initialDocument = createDocument({ id: 'document:empty', now: '2026-09-21T10:00:00.000Z' })
    const { container, rerender } = render(
      <DocumentEditor ref={ref} initialDocument={initialDocument} placeholder="Write a finding…" />,
    )
    await waitFor(() => expect(ref.current?.editor).toBeTruthy())

    expect(container.querySelector('.ProseMirror .is-empty')?.getAttribute('data-placeholder')).toBe('Write a finding…')
    expect(JSON.stringify(ref.current?.getDocument())).not.toContain('Write a finding…')

    rerender(<DocumentEditor ref={ref} initialDocument={initialDocument} placeholder="Start a research note…" />)
    await waitFor(() => {
      expect(container.querySelector('.ProseMirror .is-empty')?.getAttribute('data-placeholder'))
        .toBe('Start a research note…')
    })
    expect(JSON.stringify(ref.current?.getDocument())).not.toContain('Start a research note…')
  })

  it('keeps one native selection model across paragraphs', async () => {
    const ref = createRef<DocumentEditorRef>()
    const onSelectionChange = vi.fn()
    const document = createDocument({
      id: 'document:selection',
      now: '2026-09-21T10:00:00.000Z',
      content: [
        createParagraph({ id: 'node:first', text: 'First' }),
        createParagraph({ id: 'node:second', text: 'Second' }),
      ],
    })
    render(<DocumentEditor ref={ref} initialDocument={document} onSelectionChange={onSelectionChange} />)
    await waitFor(() => expect(ref.current?.editor).toBeTruthy())

    const end = ref.current!.editor!.state.doc.content.size - 1
    act(() => { ref.current?.executeCommand((editor) => editor.commands.setTextSelection({ from: 1, to: end })) })

    expect(ref.current?.editor?.state.selection.empty).toBe(false)
    expect(ref.current?.editor?.state.selection.$from.parent).not.toBe(ref.current?.editor?.state.selection.$to.parent)
    expect(onSelectionChange).toHaveBeenCalledWith(
      expect.objectContaining({ from: 1, to: end, empty: false }),
      ref.current?.editor,
    )
  })

  it('provides optional accessible formatting UI without recreating the editor', async () => {
    const ref = createRef<DocumentEditorRef>()
    const initialDocument = documentFixture('document:formatting-ui', 'Format me')
    const { container, rerender } = render(
      <DocumentEditor ref={ref} initialDocument={initialDocument} ui="formatting" />,
    )
    await waitFor(() => expect(ref.current?.editor).toBeTruthy())
    const editor = ref.current?.editor
    const toolbar = container.querySelector('[role="toolbar"][aria-label="Document formatting"]')
    expect(toolbar).toBeTruthy()

    act(() => { ref.current?.executeCommand((current) => current.commands.setTextSelection({ from: 1, to: 7 })) })
    const bold = container.querySelector('button[aria-label="Bold"]') as HTMLButtonElement
    fireEvent.mouseDown(bold)
    expect(ref.current?.editor?.isActive('bold')).toBe(true)
    expect(bold.getAttribute('aria-pressed')).toBe('true')

    rerender(<DocumentEditor ref={ref} initialDocument={initialDocument} ui="none" />)
    expect(ref.current?.editor).toBe(editor)
    expect(container.querySelector('[aria-label="Document formatting"]')).toBeNull()
  })

  it('offers host-overridable slash commands and removes the trigger text', async () => {
    const ref = createRef<DocumentEditorRef>()
    const initialDocument = createDocument({ id: 'document:slash', now: '2026-09-21T10:00:00.000Z' })
    const { container } = render(<DocumentEditor ref={ref} initialDocument={initialDocument} ui="formatting" />)
    await waitFor(() => expect(ref.current?.editor).toBeTruthy())

    act(() => { ref.current?.executeCommand((editor) => editor.commands.insertContent('/heading')) })
    const item = await waitFor(() => {
      const button = container.querySelector('[role="menuitem"]') as HTMLButtonElement | null
      expect(button?.textContent).toContain('Heading 1')
      return button!
    })
    fireEvent.mouseDown(item)

    expect(ref.current?.editor?.isActive('heading', { level: 1 })).toBe(true)
    expect(ref.current?.editor?.getText()).not.toContain('/heading')
  })

  it('continues bullet list items when Enter is pressed', async () => {
    const ref = createRef<DocumentEditorRef>()
    const { container } = render(<DocumentEditor ref={ref} initialDocument={documentFixture('document:list-enter', 'First')} />)
    await waitFor(() => expect(ref.current?.editor).toBeTruthy())
    act(() => {
      ref.current?.executeCommand((editor) => {
        editor.commands.setTextSelection(6)
        return editor.commands.toggleList('bulletList', 'listItem')
      })
    })
    fireEvent.keyDown(container.querySelector('.ProseMirror')!, { key: 'Enter' })
    await waitFor(() => expect(ref.current?.getDocument()?.content[0]).toMatchObject({
      type: 'bulletList', content: [{}, {}],
    }))

  })

  it('continues numbered list items when Enter is pressed', async () => {
    const ref = createRef<DocumentEditorRef>()
    const { container } = render(<DocumentEditor ref={ref} initialDocument={documentFixture('document:ordered-enter', 'First')} />)
    await waitFor(() => expect(ref.current?.editor).toBeTruthy())
    act(() => {
      ref.current?.executeCommand((editor) => {
        editor.commands.setTextSelection(6)
        return editor.commands.toggleList('orderedList', 'listItem')
      })
    })
    fireEvent.keyDown(container.querySelector('.ProseMirror')!, { key: 'Enter' })
    await waitFor(() => expect(ref.current?.getDocument()?.content[0]).toMatchObject({
      type: 'orderedList', content: [{}, {}],
    }))
  })

  it('reports command errors without throwing into the host application', async () => {
    const ref = createRef<DocumentEditorRef>()
    const onError = vi.fn()
    render(<DocumentEditor ref={ref} onError={onError} />)
    await waitFor(() => expect(ref.current?.editor).toBeTruthy())

    expect(ref.current?.executeCommand(() => { throw new Error('command failed') })).toBe(false)
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'command', error: expect.any(Error) }),
      ref.current?.editor,
    )
  })

  it('writes rich marks and blocks as canonical content', async () => {
    const ref = createRef<DocumentEditorRef>()
    const onChange = vi.fn()
    const { container } = render(
      <DocumentEditor ref={ref} initialDocument={documentFixture('document:rich', 'Equation')} onChange={onChange} />,
    )
    await waitFor(() => expect(ref.current?.editor).toBeTruthy())

    act(() => {
      ref.current?.executeCommand((editor) => {
        editor.commands.setTextSelection({ from: 1, to: 9 })
        documentRichCommands.setHighlight(editor, '#fef08a')
        editor.commands.setTextSelection({ from: 1, to: 9 })
        documentRichCommands.setTextColor(editor, '#155e75')
        editor.commands.setTextSelection(9)
        documentRichCommands.insertChecklist(editor)
        return true
      })
    })

    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const richDocument = ref.current?.getDocument()
    const types = richDocument?.content.map((node) => node.type) ?? []
    expect(types).toEqual(expect.arrayContaining(['paragraph', 'checklist']))
    expect(richDocument?.content[0]).toMatchObject({
      content: [{ text: 'Equation', marks: expect.arrayContaining([
        { type: 'highlight', color: '#fef08a' },
        { type: 'textColor', color: '#155e75' },
      ]) }],
    })
    expect(container.querySelector('[data-type="checklist"]')).toBeTruthy()
  })

  it('stores inline math as a semantic mark and block math as a semantic atom', async () => {
    const ref = createRef<DocumentEditorRef>()
    render(<DocumentEditor ref={ref} initialDocument={documentFixture('document:math', 'x squared')} />)
    await waitFor(() => expect(ref.current?.editor).toBeTruthy())
    act(() => {
      ref.current?.executeCommand((editor) => {
        editor.commands.setTextSelection({ from: 1, to: 10 })
        documentRichCommands.setInlineMath(editor, 'x^2')
        editor.commands.setTextSelection(10)
        documentRichCommands.insertMathBlock(editor, 'x^2', true, 'equation-one')
        return true
      })
    })
    await waitFor(() => expect(ref.current?.getDocument()?.content.map((node) => node.type))
      .toEqual(expect.arrayContaining(['paragraph', 'mathBlock'])))
    expect(ref.current?.getDocument()?.content[0]).toMatchObject({
      content: [{ marks: [{ type: 'inlineMath', latex: 'x^2' }] }],
    })
  })

  it('renders media and embed nodes as inert safe cards', async () => {
    const richFixture = createDocument({
      id: 'document:cards', now: '2026-09-21T10:00:00.000Z', content: [
        { id: 'node:image', type: 'image', attrs: { assetId: 'asset:image' as never } },
        { id: 'node:file', type: 'fileAttachment', attrs: { assetId: 'asset:file' as never, filename: 'paper.docx' } },
        { id: 'node:audio', type: 'audio', attrs: { assetId: 'asset:audio' as never, title: 'Interview' } },
        { id: 'node:video', type: 'videoEmbed', attrs: { provider: 'youtube', videoId: 'research-talk' } },
        { id: 'node:pdf', type: 'pdfEmbed', attrs: { assetId: 'asset:pdf' as never, display: 'card' } },
        { id: 'node:canvas', type: 'canvasEmbed', attrs: { canvasId: 'canvas:research' } },
        { id: 'node:break', type: 'pageBreak' },
      ],
    } as IncantlyDocument)
    const ref = createRef<DocumentEditorRef>()
    const { container } = render(<DocumentEditor ref={ref} initialDocument={richFixture} />)
    await waitFor(() => expect(ref.current?.editor).toBeTruthy())

    for (const node of ['image', 'fileAttachment', 'audio', 'videoEmbed', 'pdfEmbed', 'canvasEmbed']) {
      expect(container.querySelector(`[data-incantly-node="${node}"]`)?.getAttribute('contenteditable')).toBe('false')
    }
    expect(container.querySelector('[data-incantly-node="pageBreak"]')).toBeTruthy()
    expect(ref.current?.getDocument()?.content.map((node) => node.type)).toEqual(richFixture.content.map((node) => node.type))
  })

  it('provides basic table row and column actions through the table selection', async () => {
    const ref = createRef<DocumentEditorRef>()
    render(<DocumentEditor ref={ref} initialDocument={documentFixture('document:table-actions', 'Before')} />)
    await waitFor(() => expect(ref.current?.editor).toBeTruthy())

    act(() => {
      ref.current?.executeCommand((editor) => {
        documentRichCommands.insertTable(editor, { rows: 1, columns: 1 })
        return true
      })
    })

    await waitFor(() => {
      const table = ref.current?.getDocument()?.content.find((node) => node.type === 'table')
      expect(table).toMatchObject({ type: 'table', content: [{ content: [{}] }] })
    })
    act(() => {
      ref.current?.executeCommand((editor) => {
        let tablePosition = 0
        editor.state.doc.descendants((node, position) => {
          if (node.type.name === 'table') tablePosition = position
        })
        editor.commands.setTextSelection(tablePosition + 3)
        documentRichCommands.addTableRow(editor)
        documentRichCommands.addTableColumn(editor)
        return true
      })
    })
    await waitFor(() => {
      const table = ref.current?.getDocument()?.content.find((node) => node.type === 'table')
      expect(table).toMatchObject({ type: 'table', content: [{ content: [{}, {}] }, { content: [{}, {}] }] })
    })
  })

  it('renders an inert host during SSR', () => {
    expect(() => renderToString(<DocumentEditor aria-label="Server document" />)).not.toThrow()
    expect(renderToString(<DocumentEditor className="server-document" />)).toContain('server-document')
  })

  afterEach(cleanup)
})
