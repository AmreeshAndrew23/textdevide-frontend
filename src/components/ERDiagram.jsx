import { useEffect, useMemo, useRef, useState } from "react";
import { entitiesToMermaid } from "../utils/erDiagram";

// Extracted from Dashboard.jsx (was private to that file) so the new Domains page can render the
// exact same ER diagram for a domain's entities that a project's own "Architect View → DB Schema"
// already renders for its entities — same {tables:[{name, columns:[{name,type,pk,fk}]}]} shape
// either way, so this needed no changes to work for a domain template too.
export function ERDiagram({ entities, emptyMessage }) {
  const containerRef = useRef(null);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState(null);

  const mermaidDef = useMemo(() => entitiesToMermaid(entities), [entities]);

  useEffect(() => {
    // No setSvg("") here on purpose: the render below already returns the empty-state message
    // whenever !mermaidDef, before it ever looks at svg — so a stale svg sitting unused in state
    // is harmless, and clearing it here would just be a synchronous setState-in-effect for nothing.
    if (!mermaidDef) return;
    let cancelled = false;
    import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        // "base" + themeVariables (rather than the stock "dark" theme) so the diagram uses the
        // Studio's own palette from styles.css — Mermaid can't read CSS variables itself.
        theme: "base",
        themeVariables: {
          darkMode: true, background: "#0e1119", fontFamily: "Inter, system-ui, sans-serif",
          primaryColor: "#191e2c", primaryBorderColor: "#4b4390", primaryTextColor: "#e8eaf2",
          lineColor: "#6a8cff", textColor: "#b3b9cc", tertiaryColor: "#131722",
          attributeBackgroundColorOdd: "#131722", attributeBackgroundColorEven: "#171c29",
        },
        er: { diagramPadding: 40, layoutDirection: "TB", minEntityWidth: 140, minEntityHeight: 80, entityPadding: 18, useMaxWidth: true },
      });
      const id = `er-${Date.now()}`;
      mermaid.render(id, mermaidDef).then(({ svg: rendered }) => {
        if (!cancelled) { setSvg(rendered); setError(null); }
      }).catch((e) => {
        if (!cancelled) setError(e.message);
      });
    });
    return () => { cancelled = true; };
  }, [mermaidDef]);

  if (!mermaidDef) {
    return <div style={{ padding: 60, textAlign: "center", color: "var(--muted, #7a8299)" }}>{emptyMessage || "No schema extracted yet. Go to Database Schema in Workspace to extract entities."}</div>;
  }
  if (error) {
    return <div style={{ padding: 24, color: "var(--danger, #f87171)", fontSize: 13 }}>Diagram error: {error}</div>;
  }
  if (!svg) {
    return <div style={{ padding: 60, textAlign: "center", color: "var(--muted, #7a8299)" }}>Rendering diagram…</div>;
  }

  return (
    <div ref={containerRef} style={{ padding: 24, overflow: "auto", background: "var(--bg-elev, #0e1119)", borderRadius: 10, minHeight: 300 }}
      dangerouslySetInnerHTML={{ __html: svg }} />
  );
}
