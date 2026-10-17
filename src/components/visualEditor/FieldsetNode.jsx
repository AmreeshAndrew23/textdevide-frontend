import { useNode } from "@craftjs/core";

// A real Craft.js droppable container (isCanvas) — fields/buttons can be dragged into or out of it
// to group them, the same grouping <fieldset legend="..."> already means in the XML vocabulary
// (purely cosmetic grouping, not a new data concept — see screenModel.ts).
export default function FieldsetNode({ legend, children }) {
  const { connectors: { connect, drag }, selected } = useNode((node) => ({ selected: node.events.selected }));
  return (
    <fieldset
      ref={(ref) => connect(drag(ref))}
      style={{ margin: "6px 0", padding: "10px", borderRadius: 6, border: selected ? "2px solid #4f46e5" : "1px dashed #94a3b8", minHeight: 40 }}
    >
      <legend style={{ fontSize: 12, fontWeight: 600, color: "#1e293b", padding: "0 4px" }}>{legend || "(fieldset)"}</legend>
      {children}
    </fieldset>
  );
}

export function FieldsetNodeSettings() {
  const { actions: { setProp }, legend } = useNode((node) => ({ legend: node.data.props.legend }));
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
      <span style={{ color: "#64748b", fontSize: 11 }}>Legend</span>
      <input value={legend || ""} onChange={(e) => setProp((props) => { props.legend = e.target.value; })} />
    </label>
  );
}

FieldsetNode.craft = {
  displayName: "Fieldset",
  props: { legend: "New Group" },
  related: { settings: FieldsetNodeSettings },
  isCanvas: true,
};
