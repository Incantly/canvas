// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { createRef } from 'react'
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
