import { describe, expect, it } from "vitest";
import { createStoreBridge } from "../src/store/store-bridge.js";
import {
  Store,
  MemoryVersionStorage,
  createVersionManager,
} from "@incantly/canvas/headless";
import type { ColorId, SizeId, ToolId } from "@incantly/canvas/headless";

describe("createStoreBridge", () => {
  it("exposes undo/redo and getSnapshot", async () => {
    const store = new Store();
    const versionManager = createVersionManager({
      storage: new MemoryVersionStorage(),
      store,
    });
    const toolRef = { current: "select" as const };
    let rev = 0;
    const bridge = createStoreBridge({
      store,
      versionManager,
      getSnapshot: () => store.getSnapshot(),
      loadSnapshot: (s) => store.loadSnapshot(s, "remote"),
      notify: () => {
        rev++;
      },
      toolRef,
    });
    bridge.setTool("draw");
    expect(toolRef.current).toBe("draw");
    const snap = await bridge.getSnapshot();
    expect(snap.document.store).toBeDefined();
    versionManager.dispose();
  });

  it("applies color and size via setStyle", () => {
    const store = new Store();
    const versionManager = createVersionManager({
      storage: new MemoryVersionStorage(),
      store,
    });
    const toolRef = { current: "select" as ToolId };
    const colorRef = { current: "black" as ColorId };
    const sizeRef = { current: "m" as SizeId };
    const bridge = createStoreBridge({
      store,
      versionManager,
      getSnapshot: () => store.getSnapshot(),
      loadSnapshot: (s) => store.loadSnapshot(s, "remote"),
      notify: () => {},
      toolRef,
      colorRef,
      sizeRef,
    });
    bridge.setStyle("color", "blue");
    bridge.setStyle("size", "xl");
    bridge.setStyle("dash", "dashed");
    expect(colorRef.current).toBe("blue");
    expect(sizeRef.current).toBe("xl");
    versionManager.dispose();
  });

  it("rejects revertVersion without a string id", async () => {
    const store = new Store();
    const versionManager = createVersionManager({
      storage: new MemoryVersionStorage(),
      store,
    });
    const bridge = createStoreBridge({
      store,
      versionManager,
      getSnapshot: () => store.getSnapshot(),
      loadSnapshot: (s) => store.loadSnapshot(s, "remote"),
      notify: () => {},
      toolRef: { current: "select" },
    });
    await expect(bridge.revertVersion("")).rejects.toThrow(/versionId/);
    versionManager.dispose();
  });

  it("ignores tools outside the host ink set", () => {
    const store = new Store();
    const versionManager = createVersionManager({
      storage: new MemoryVersionStorage(),
      store,
    });
    const toolRef = { current: "select" };
    const bridge = createStoreBridge({
      store,
      versionManager,
      getSnapshot: () => store.getSnapshot(),
      loadSnapshot: (s) => store.loadSnapshot(s, "remote"),
      notify: () => {},
      toolRef,
      allowedInkTools: () => ["select", "eraser", "draw", "pencil"],
    });
    bridge.setTool("pencil");
    expect(toolRef.current).toBe("pencil");
    bridge.setTool("laser");
    expect(toolRef.current).toBe("pencil");
    versionManager.dispose();
  });
});
