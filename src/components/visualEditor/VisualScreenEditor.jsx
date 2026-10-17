import { useState } from "react";
import { Editor, Frame, Element, useEditor } from "@craftjs/core";
import FieldNode from "./FieldNode";
import GridNode from "./GridNode";
import ButtonNode from "./ButtonNode";
import FieldsetNode from "./FieldsetNode";
import Palette from "./Palette";
import { xmlToCraftTree, craftTreeToXml } from "../../utils/visualEditorXml";

const RESOLVER = { FieldNode, GridNode, ButtonNode, FieldsetNode };

// Builds real JSX from the plain adapter tree — Craft's <Frame> parses whatever JSX it's given as
// children into real nodes on its initial mount. This is the hydration half of the XML <-> editor
// round trip; craftNodesToTree() below is the reverse (editor's live state -> plain tree) used on Save.
function buildElement(node) {
  if (!node) return null;
  if (node.type === "field") return <FieldNode key={node.id} {...node.props} id={node.id} />;
  if (node.type === "grid") return <GridNode key={node.id} {...node.props} id={node.id} />;
  if (node.type === "button") return <ButtonNode key={node.id} {...node.props} id={node.id} />;
  if (node.type === "fieldset") {
    return (
      <Element key={`fs_${Math.random().toString(36).slice(2, 7)}`} is={FieldsetNode} canvas legend={node.props.legend}>
        {(node.children || []).map(buildElement)}
      </Element>
    );
  }
  return null;
}

// The reverse direction: walks Craft's live, in-memory node map (query.getNodes()) back into the
// same plain tree shape visualEditorXml.js expects, keyed off each node's displayName (set via
// each component's static .craft.displayName) rather than anything Craft-internal/fragile.
function craftNodesToTree(query) {
  const nodes = query.getNodes();
  const walk = (id) => {
    const n = nodes[id];
    if (!n) return null;
    const { id: nodeId, ...props } = n.data.props || {};
    const name = n.data.displayName;
    if (name === "Field") return { type: "field", id: nodeId, props, children: [] };
    if (name === "Grid") return { type: "grid", id: nodeId, props, children: [] };
    if (name === "Button") return { type: "button", id: nodeId, props, children: [] };
    if (name === "Fieldset") return { type: "fieldset", id: "", props: { legend: props.legend }, children: (n.data.nodes || []).map(walk).filter(Boolean) };
    return null;
  };
  const root = nodes.ROOT;
  return (root?.data.nodes || []).map(walk).filter(Boolean);
}

function SettingsPanel() {
  const { selected } = useEditor((state, query) => {
    const currentId = query.getEvent("selected").last();
    let selected;
    if (currentId && state.nodes[currentId]) {
      selected = {
        name: state.nodes[currentId].data.displayName,
        Settings: state.nodes[currentId].related && state.nodes[currentId].related.settings,
      };
    }
    return { selected };
  });
  if (!selected) return <div style={{ color: "#94a3b8", fontSize: 12 }}>Select an element on the canvas to edit its properties.</div>;
  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: "#1e293b" }}>{selected.name}</div>
      {selected.Settings ? <selected.Settings /> : null}
    </div>
  );
}

// Visual (drag-and-drop) editor for a screen's <ui> structure, as a complement to the existing
// AI-prompt generation path — both converge on the same <screen> XML; see the plan this implements
// (gentle-hatching-riddle.md in the session's plan history) for the full design/scope rationale.
export default function VisualScreenEditor({ xml, screenKey, onSave }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { items } = xmlToCraftTree(xml);

  const handleSave = async (newXml) => {
    setSaving(true);
    setError("");
    try {
      await onSave(newXml);
    } catch (e) {
      setError(e?.message || "Could not save — try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!xml || !xml.trim()) {
    return <div style={{ padding: 20, color: "#94a3b8", fontSize: 13 }}>Generate this screen first (via the prompt) before opening the visual editor.</div>;
  }

  return (
    <Editor resolver={RESOLVER} key={screenKey}>
      <EditorInner xml={xml} items={items} onSave={handleSave} saving={saving} error={error} />
    </Editor>
  );
}

// Split out so Save can grab `query` via useEditor() from inside the <Editor> tree, and so the
// source xml this save started from (needed by craftTreeToXml to preserve everything outside <ui>)
// is captured once per hydration rather than re-read from a global.
function EditorInner({ xml, items, onSave, saving, error }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <SaveBar xml={xml} onSave={onSave} saving={saving} error={error} />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{ width: 180, padding: 12, borderRight: "1px solid #e2e8f0", overflowY: "auto" }}>
          <Palette />
        </div>
        <div style={{ flex: 1, padding: 16, overflowY: "auto", background: "#f1f5f9" }}>
          <Frame>
            <Element is="div" canvas data-root-canvas style={{ minHeight: 200 }}>
              {items.map(buildElement)}
            </Element>
          </Frame>
        </div>
        <div style={{ width: 260, padding: 12, borderLeft: "1px solid #e2e8f0", overflowY: "auto" }}>
          <SettingsPanel />
        </div>
      </div>
    </div>
  );
}

function SaveBar({ xml, onSave, saving, error }) {
  const { query } = useEditor();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: "1px solid #e2e8f0" }}>
      <button
        type="button" disabled={saving}
        onClick={() => onSave(craftTreeToXml(craftNodesToTree(query), xml))}
        style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#4f46e5", color: "#fff", fontSize: 12, cursor: "pointer", opacity: saving ? 0.6 : 1 }}
      >
        {saving ? "Saving…" : "Save layout"}
      </button>
      {error && <span style={{ color: "#dc2626", fontSize: 12 }}>{error}</span>}
      <span style={{ marginLeft: "auto", fontSize: 11, color: "#94a3b8" }}>
        Structure &amp; field properties only — Save/button logic stays as-is.
      </span>
    </div>
  );
}
