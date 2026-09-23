import { API_ORIGIN } from "../api/client";

// Mirrors backend-node/src/runtime/renderer.ts's THEMES table.
const THEMES = [
  { key: "indigo", label: "Indigo" },
  { key: "emerald", label: "Emerald" },
  { key: "slate", label: "Slate" },
  { key: "rose", label: "Rose" },
  { key: "amber", label: "Amber" },
  { key: "ocean", label: "Ocean" },
];

// A real, live-rendered preview per theme (an <iframe> onto the backend's unauthenticated sample
// screen, GET /runtime/theme-preview/:theme) scaled down into a thumbnail — not a screenshot, not a
// separate hand-built mockup, so it can never drift from what a real screen actually looks like in
// that theme. Shared by both places a theme is chosen (project creation, and changing it later) so
// they can't fall out of sync with each other.
export default function ThemePicker({ value, onChange }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
      {THEMES.map((t) => {
        const selected = value === t.key;
        return (
          <button key={t.key} type="button" onClick={() => onChange(t.key)} title={t.label}
            style={{
              padding: 0, cursor: "pointer", borderRadius: 8, overflow: "hidden", background: "#f1f5f9",
              border: selected ? "2px solid #4f46e5" : "2px solid transparent",
              boxShadow: selected ? "0 0 0 2px rgba(79,70,229,0.25)" : "none",
            }}>
            <div style={{ width: "100%", height: 90, overflow: "hidden", position: "relative" }}>
              <iframe
                src={`${API_ORIGIN}/runtime/theme-preview/${t.key}`}
                title={`${t.label} preview`}
                tabIndex={-1}
                sandbox="allow-scripts"
                style={{
                  width: 900, height: 560, border: "none", pointerEvents: "none",
                  transform: "scale(0.24)", transformOrigin: "top left",
                }}
              />
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, padding: "5px 0", textAlign: "center", background: "#fff", color: selected ? "#4f46e5" : "#334155" }}>
              {t.label}
            </div>
          </button>
        );
      })}
    </div>
  );
}
