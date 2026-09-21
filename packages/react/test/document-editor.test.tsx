// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { createRef, type CSSProperties } from 'react'
import { renderToString } from 'react-dom/server'
import { createDocument, createParagraph } from '@incantly/canvas/document'
import {
  DocumentEditor,
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

  it('renders an inert host during SSR', () => {
    expect(() => renderToString(<DocumentEditor aria-label="Server document" />)).not.toThrow()
    expect(renderToString(<DocumentEditor className="server-document" />)).toContain('server-document')
  })

  afterEach(cleanup)
})
