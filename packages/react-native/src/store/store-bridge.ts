import type { MutableRefObject } from "react";
import type {
  ColorId,
  SizeId,
  Snapshot,
  VersionManager,
  Store,
} from "@incantly/canvas/headless";
import { COLOR_IDS, SIZE_IDS } from "@incantly/canvas/headless";
import type { CanvasRef, VersionSummary } from "../types/index.js";

export interface StoreBridgeDeps {
  store: Store;
  versionManager: VersionManager;
  getSnapshot: () => Snapshot;
  loadSnapshot: (snap: Snapshot, source?: "user" | "remote" | "all") => void;
  notify: () => void;
  toolRef: MutableRefObject<string>;
  colorRef?: MutableRefObject<ColorId>;
  sizeRef?: MutableRefObject<SizeId>;
  currentPageIdRef?: MutableRefObject<string>;
  onToolChange?: (tool: string) => void;
  onColorChange?: (color: ColorId) => void;
  onSizeChange?: (size: SizeId) => void;
  allowedInkTools?: () => string[];
}

export function createStoreBridge(deps: StoreBridgeDeps): CanvasRef {
  const {
    store,
    versionManager,
    getSnapshot,
    loadSnapshot,
    notify,
    toolRef,
    colorRef,
    sizeRef,
    currentPageIdRef,
    onToolChange,
    onColorChange,
    onSizeChange,
    allowedInkTools,
  } = deps;

  return {
    loadSnapshot(snapshot, _fit) {
      loadSnapshot(snapshot, "remote");
    },
    applyDiff(diff) {
      store.applyDiff(diff, "remote");
      notify();
    },
    setTool(tool) {
      if (typeof tool !== "string" || tool.length === 0) return;
      const allowed = allowedInkTools?.();
      if (allowed && !allowed.includes(tool)) return;
      toolRef.current = tool;
      onToolChange?.(tool);
      notify();
    },
    setStyle(key, value) {
      if (key === "color" && colorRef && (COLOR_IDS as readonly string[]).includes(value)) {
        colorRef.current = value as ColorId;
        onColorChange?.(value as ColorId);
      } else if (key === "size" && sizeRef && (SIZE_IDS as readonly string[]).includes(value)) {
        sizeRef.current = value as SizeId;
        onSizeChange?.(value as SizeId);
      }
      notify();
    },
    setDocumentBackground(_color) {
      notify();
    },
    setDocumentPaperColor(_color) {
      notify();
    },
    setGrid(_grid) {
      notify();
    },
    undo() {
      store.undo();
      notify();
    },
    redo() {
      store.redo();
      notify();
    },
    clear() {
      store.clear();
      notify();
    },
    fitContent(_animate) {
      notify();
    },
    focusPageDocument() {
      notify();
    },
    refreshPageDocument() {
      notify();
    },
    setPage(pageId, _opts) {
      if (!store.page(pageId)) return;
      if (currentPageIdRef) currentPageIdRef.current = pageId;
      notify();
    },
    addPage(opts = {}) {
      const page = store.addPage(opts);
      if (currentPageIdRef) currentPageIdRef.current = page.id;
      notify();
    },
    setPagePaper(pageId, opts) {
      store.setPagePaper(pageId, opts);
      notify();
    },
    removePage(pageId) {
      const id = pageId ?? currentPageIdRef?.current;
      if (id) store.removePage(id);
      const pages = store.pages();
      if (currentPageIdRef && !store.page(currentPageIdRef.current)) {
        currentPageIdRef.current = pages[0]?.id ?? "";
      }
      notify();
    },
    async getSnapshot() {
      return getSnapshot();
    },
    async exportPng() {
      return null;
    },
    async listVersions() {
      const versions = await versionManager.list();
      return versions.map(
        (v): VersionSummary => ({
          id: v.id,
          createdAt: v.createdAt,
          label: v.label,
          kind: v.kind,
        }),
      );
    },
    async revertVersion(versionId) {
      if (typeof versionId !== "string" || versionId.length === 0) {
        throw new Error("versionId must be a non-empty string");
      }
      await versionManager.revert(versionId);
      notify();
    },
    async saveVersion(label) {
      const v = await versionManager.checkpoint("manual", label);
      return {
        id: v.id,
        createdAt: v.createdAt,
        label: v.label,
        kind: v.kind,
      };
    },
  };
}
