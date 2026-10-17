import { useEditor, Element } from "@craftjs/core";
import FieldNode from "./FieldNode";
import GridNode from "./GridNode";
import ButtonNode from "./ButtonNode";
import FieldsetNode from "./FieldsetNode";

const uid = (prefix) => `${prefix}${Math.random().toString(36).slice(2, 7)}`;

const BLOCKS = [
  { label: "Field", make: () => <FieldNode id={uid("field_")} /> },
  { label: "Grid", make: () => <GridNode id={uid("grid_")} /> },
  { label: "Button", make: () => <ButtonNode id={uid("button_")} /> },
  { label: "Fieldset (group)", make: () => <Element is={FieldsetNode} canvas /> },
];

// Drag source for each block type — Craft's connectors.create() makes the DOM node itself a drag
// source that, on drop, creates a real node from the given React element. No manual drag/drop
// plumbing needed; Craft.js owns the whole interaction.
export default function Palette() {
  const { connectors } = useEditor();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 2 }}>Drag onto the canvas</div>
      {BLOCKS.map((b) => (
        <div
          key={b.label}
          ref={(ref) => connectors.create(ref, b.make())}
          style={{
            padding: "8px 10px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#f8fafc",
            fontSize: 12, cursor: "grab", userSelect: "none",
          }}
        >
          {b.label}
        </div>
      ))}
    </div>
  );
}
