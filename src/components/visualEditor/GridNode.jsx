import { useNode } from "@craftjs/core";

export default function GridNode({ label, columns, emptyMessage }) {
  const { connectors: { connect, drag }, selected } = useNode((node) => ({ selected: node.events.selected }));
  return (
    <div
      ref={(ref) => connect(drag(ref))}
      style={{ margin: "4px 0", borderRadius: 6, border: selected ? "2px solid #4f46e5" : "1px dashed #d1d5db", background: "#fff", cursor: "move" }}
    >
      <div style={{ padding: "6px 10px", fontWeight: 600, fontSize: 13, borderBottom: "1px solid #e2e8f0" }}>{label || "(untitled grid)"}</div>
      <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
        <thead>
          <tr>{(columns || []).map((c) => <th key={c.id} style={{ textAlign: "left", padding: "4px 8px", color: "#64748b" }}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          <tr><td colSpan={(columns || []).length || 1} style={{ padding: "8px", color: "#94a3b8" }}>{emptyMessage || "No records."}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function ColumnRow({ col, onChange, onRemove }) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
      <input style={{ width: 70 }} value={col.id} onChange={(e) => onChange({ ...col, id: e.target.value })} placeholder="id" />
      <input style={{ flex: 1 }} value={col.header} onChange={(e) => onChange({ ...col, header: e.target.value })} placeholder="header" />
      <input style={{ flex: 1 }} value={col.binding} onChange={(e) => onChange({ ...col, binding: e.target.value })} placeholder="binding" />
      <button type="button" onClick={onRemove} style={{ fontSize: 11 }}>✕</button>
    </div>
  );
}

export function GridNodeSettings() {
  const { actions: { setProp }, id, label, emptyMessage, columns } = useNode((node) => ({
    id: node.data.props.id, label: node.data.props.label, emptyMessage: node.data.props.emptyMessage, columns: node.data.props.columns,
  }));
  const set = (key, value) => setProp((props) => { props[key] = value; });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ color: "#64748b", fontSize: 11 }}>Grid id</span>
        <input value={id} onChange={(e) => set("id", e.target.value)} />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ color: "#64748b", fontSize: 11 }}>Label</span>
        <input value={label} onChange={(e) => set("label", e.target.value)} />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ color: "#64748b", fontSize: 11 }}>Empty message</span>
        <input value={emptyMessage || ""} onChange={(e) => set("emptyMessage", e.target.value)} />
      </label>
      <div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Columns</div>
        {(columns || []).map((col, i) => (
          <ColumnRow
            key={i} col={col}
            onChange={(next) => set("columns", columns.map((c, j) => (j === i ? next : c)))}
            onRemove={() => set("columns", columns.filter((_, j) => j !== i))}
          />
        ))}
        <button type="button" onClick={() => set("columns", [...(columns || []), { id: "", header: "", binding: "" }])} style={{ fontSize: 11 }}>
          + Add column
        </button>
      </div>
    </div>
  );
}

GridNode.craft = {
  displayName: "Grid",
  props: { id: "grid1", label: "New Grid", emptyMessage: "No records.", columns: [], actions: [] },
  related: { settings: GridNodeSettings },
};
