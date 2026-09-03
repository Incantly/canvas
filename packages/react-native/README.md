# @incantly/canvas-react-native

React Native bindings for [Incantly Canvas](https://github.com/Incantly/canvas) — native document renderer (one rich-text editor per paper page, SVG ink + shapes). `documentMode={false}` is an infinite open canvas: pan/pinch, movable text boxes, and ink as draw shapes.

On paper notes, **Type** writes in the page column; **Cursor** selects, moves, and resizes shapes. On the open canvas, **Text** places a resizable box (transparent fill by default). Both surfaces clamp zoom to 25%–400% and show a corner minimap of drawn content.

Optional peer `react-native-enriched-markdown` (Expo SDK 55 / RN 0.83, New Architecture, **dev client / prebuild**, not Expo Go). Without it, the page editor falls back to one multiline `TextInput` so selection still spans Enter-separated lines.

Required peer `react-native-svg` for pen / highlighter / eraser and line / arrow / geo.

```bash
npm install @incantly/canvas-react-native react-native-svg
```

```tsx
import { Canvas } from "@incantly/canvas-react-native";

export default function App() {
  return (
    <Canvas
      style={{ flex: 1 }}
      inkBar={{
        draw: { name: "Ballpoint", icon: <PenIcon /> },
        eraser: { icon: <EraserIcon /> },
      }}
      inkPens={[
        { id: "draw", name: "Pen", style: { kind: "draw" } },
        {
          id: "pencil",
          name: "Pencil",
          style: { kind: "draw", pressureWidth: true, widthScale: 0.55 },
        },
        { id: "highlight", name: "Highlight", style: { kind: "highlight" } },
      ]}
    />
  );
}
```

`inkBar` uses the same `{ name, icon, hidden }` shape as `formatBar`. `inkPens` is how hosts add their own tools (pressure, width, opacity). Snapshots still store `kind: "draw" | "highlight"` so web can paint the stroke; an optional `pen` id remembers which host tool made it.

See [`example/README.md`](example/README.md) for the RN playground reference.
