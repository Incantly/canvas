import type { MutableRefObject } from 'react'
import type {
  ToolId,
  Snapshot,
  VersionManager,
  Store,
} from '@incantly/canvas/headless'
import type { CanvasRef, VersionSummary } from '../types/index.js'

export interface StoreBridgeDeps {
  store: Store
  versionManager: VersionManager
  getSnapshot: () => Snapshot
  loadSnapshot: (snap: Snapshot, source?: 'user' | 'remote' | 'all') => void
  notify: () => void
  toolRef: MutableRefObject<ToolId>
}

export function createStoreBridge(deps: StoreBridgeDeps): CanvasRef {
  const { store, versionManager, getSnapshot, loadSnapshot, notify, toolRef } = deps

  return {
    loadSnapshot(snapshot, _fit) {
      loadSnapshot(snapshot, 'remote')
    },
    applyDiff(diff) {
      store.applyDiff(diff, 'remote')
      notify()
    },
    setTool(tool) {
      toolRef.current = tool
      notify()
    },
    setStyle(_key, _value) {
      notify()
    },
    setDocumentBackground(_color) {
      notify()
    },
    setDocumentPaperColor(_color) {
      notify()
    },
    setGrid(_grid) {
      notify()
    },
    undo() {
      store.undo()
      notify()
    },
    redo() {
      store.redo()
      notify()
    },
    clear() {
      store.clear()
      notify()
    },
    fitContent(_animate) {
      notify()
    },
    focusPageDocument() {
      notify()
    },
    refreshPageDocument() {
      notify()
    },
    setPage(_pageId, _opts) {
      notify()
    },
    addPage(opts = {}) {
      store.addPage(opts)
      notify()
    },
    removePage(pageId) {
      if (pageId) store.removePage(pageId)
      notify()
    },
    async getSnapshot() {
      return getSnapshot()
    },
    async exportPng() {
      return null
    },
    async listVersions() {
      const versions = await versionManager.list()
      return versions.map(
        (v): VersionSummary => ({
          id: v.id,
          createdAt: v.createdAt,
          label: v.label,
          kind: v.kind,
        }),
      )
    },
    async revertVersion(versionId) {
      if (typeof versionId !== 'string' || versionId.length === 0) {
        throw new Error('versionId must be a non-empty string')
      }
      await versionManager.revert(versionId)
      notify()
    },
    async saveVersion(label) {
      const v = await versionManager.checkpoint('manual', label)
      return {
        id: v.id,
        createdAt: v.createdAt,
        label: v.label,
        kind: v.kind,
      }
    },
  }
}
