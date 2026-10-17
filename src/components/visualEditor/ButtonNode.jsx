import { useNode } from "@craftjs/core";

const STYLE_COLORS = { primary: "#4f46e5", secondary: "#64748b", danger: "#dc2626", ghost: "#94a3b8" };

export default function ButtonNode({ label, style }) {
  const { connectors: { connect, drag }, selected } = useNode((node) => ({ selected: node.events.selected }));
  return (
    <button
      type="button"
      ref={(ref) => connect(drag(ref))}
      style={{
        margin: "4px 6px 4px 0", padding: "6px 14px", borderRadius: 6, cursor: "move", fontSize: 13,
        border: selected ? "2px solid #4f46e5" : `1px solid ${STYLE_COLORS[style] || STYLE_COLORS.primary}`,
        background: style === "ghost" ? "transparent" : (STYLE_COLORS[style] || STYLE_COLORS.primary),
        color: style === "ghost" ? STYLE_COLORS.ghost : "#fff",
      }}
    >
      {label || "(untitled button)"}
    </button>
  );
}

export function ButtonNodeSettings() {
  const { actions: { setProp }, id, label, style } = useNode((node) => ({
    id: node.data.props.id, label: node.data.props.label, style: node.data.props.style,
  }));
  const set = (key, value) => setProp((props) => { props[key] = value; });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ color: "#64748b", fontSize: 11 }}>Button id</span>
        <input value={id} onChange={(e) => set("id", e.target.value)} />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ color: "#64748b", fontSize: 11 }}>Label</span>
        <input value={label} onChange={(e) => set("label", e.target.value)} />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ color: "#64748b", fontSize: 11 }}>Style</span>
        <select value={style} onChange={(e) => set("style", e.target.value)}>
          {Object.keys(STYLE_COLORS).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <p style={{ color: "#94a3b8", fontSize: 11 }}>
        What this button does when clicked (which query it runs) isn't editable here — that stays
        wired through the AI prompt / screen XML, same as before.
      </p>
    </div>
  );
}

ButtonNode.craft = {
  displayName: "Button",
  props: { id: "button1", label: "New Button", style: "primary" },
  related: { settings: ButtonNodeSettings },
};
