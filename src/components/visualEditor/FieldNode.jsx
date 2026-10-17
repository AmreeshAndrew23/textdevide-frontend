import { useNode } from "@craftjs/core";
import { useState } from "react";

const FIELD_TYPES = ["text", "textarea", "number", "email", "url", "password", "date", "time", "color", "checkbox", "select", "image"];

// Canvas rendering of a field — a simplified, readable preview of what the real server-rendered
// page shows (see renderer.ts for the actual markup), not a pixel-exact match. The html/xml preview
// tabs in Dashboard.jsx remain the source of truth for exact appearance; this canvas is for
// structure/property editing.
export default function FieldNode({ label, fieldType, readonly, rules, visibleRoles }) {
  const { connectors: { connect, drag }, selected } = useNode((node) => ({ selected: node.events.selected }));
  const required = (rules || []).some((r) => r.required);
  return (
    <div
      ref={(ref) => connect(drag(ref))}
      style={{
        padding: "8px 10px", margin: "4px 0", borderRadius: 6,
        border: selected ? "2px solid #4f46e5" : "1px dashed #d1d5db",
        background: "#fff", cursor: "move", fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 600, color: "#1e293b" }}>
        {label || "(untitled field)"} {required && <span style={{ color: "#dc2626" }}>*</span>}
      </div>
      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
        {fieldType}{readonly ? " · read-only" : ""}{visibleRoles ? ` · visible to: ${visibleRoles.join(", ")}` : ""}
      </div>
    </div>
  );
}

function RuleRow({ rule, onChange, onRemove }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
      <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}>
        <input type="checkbox" checked={!!rule.required} onChange={(e) => onChange({ ...rule, required: e.target.checked || undefined })} /> required
      </label>
      <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}>
        <input type="checkbox" checked={!!rule.unique} onChange={(e) => onChange({ ...rule, unique: e.target.checked || undefined })} /> unique
      </label>
      {["maxLength", "minValue", "maxValue", "minAge", "maxAge"].map((k) => (
        <label key={k} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}>
          {k}
          <input
            type="number" style={{ width: 48 }}
            value={rule[k] ?? ""}
            onChange={(e) => onChange({ ...rule, [k]: e.target.value === "" ? undefined : Number(e.target.value) })}
          />
        </label>
      ))}
      <button type="button" onClick={onRemove} style={{ fontSize: 11 }}>✕</button>
    </div>
  );
}

// The property panel shown in the right-hand pane when this node is selected — plain HTML form
// controls writing straight back into Craft's node props via setProp, no extra state of its own.
export function FieldNodeSettings() {
  const { actions: { setProp }, id, label, fieldType, readonly, persistenceMapping, hint, rules, visibleRoles } = useNode((node) => ({
    id: node.data.props.id, label: node.data.props.label, fieldType: node.data.props.fieldType,
    readonly: node.data.props.readonly, persistenceMapping: node.data.props.persistenceMapping,
    hint: node.data.props.hint, rules: node.data.props.rules, visibleRoles: node.data.props.visibleRoles,
  }));
  const [showAdvanced, setShowAdvanced] = useState(false);

  const set = (key, value) => setProp((props) => { props[key] = value; });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}>
      <Row label="Field id">
        <input value={id} onChange={(e) => set("id", e.target.value)} />
      </Row>
      <Row label="Label">
        <input value={label} onChange={(e) => set("label", e.target.value)} />
      </Row>
      <Row label="Type">
        <select value={fieldType} onChange={(e) => set("fieldType", e.target.value)}>
          {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Row>
      <Row label="Read-only">
        <input type="checkbox" checked={!!readonly} onChange={(e) => set("readonly", e.target.checked)} />
      </Row>
      <Row label="Saves to (table.column)">
        <input value={persistenceMapping || ""} onChange={(e) => set("persistenceMapping", e.target.value)} placeholder="Student.email" />
      </Row>
      <Row label="Hint text">
        <input value={hint || ""} onChange={(e) => set("hint", e.target.value)} />
      </Row>
      <button type="button" onClick={() => setShowAdvanced((v) => !v)} style={{ alignSelf: "flex-start", fontSize: 11 }}>
        {showAdvanced ? "Hide advanced" : "Show advanced"}
      </button>
      {showAdvanced && (
        <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Validation rules</div>
          {(rules || []).map((rule, i) => (
            <RuleRow
              key={i} rule={rule}
              onChange={(next) => set("rules", (rules || []).map((r, j) => (j === i ? next : r)))}
              onRemove={() => set("rules", (rules || []).filter((_, j) => j !== i))}
            />
          ))}
          <button type="button" onClick={() => set("rules", [...(rules || []), {}])} style={{ fontSize: 11 }}>+ Add rule</button>

          <div style={{ fontWeight: 600, margin: "10px 0 4px" }}>Visible to roles (comma-separated, blank = everyone)</div>
          <input
            value={(visibleRoles || []).join(", ")}
            onChange={(e) => set("visibleRoles", e.target.value.trim() ? e.target.value.split(",").map((r) => r.trim()).filter(Boolean) : null)}
            placeholder="Admin, HR"
          />
        </div>
      )}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ color: "#64748b", fontSize: 11 }}>{label}</span>
      {children}
    </label>
  );
}

FieldNode.craft = {
  displayName: "Field",
  props: {
    id: "field1", label: "New Field", fieldType: "text", readonly: false, persistenceMapping: "",
    defaultValue: null, hint: "", rules: [], options: [], optionsBinding: null, visibleRoles: null,
  },
  related: { settings: FieldNodeSettings },
};
